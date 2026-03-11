"""
润色 API 路由

提供内容润色功能的 REST/SSE 端点：
- POST /api/polish           — 执行润色（SSE 流式）
- POST /api/polish/apply     — 应用润色修改
- GET  /api/polish/download/{session_id} — 下载润色后文档
"""

import os
import re
import uuid
import logging
import asyncio
from pathlib import Path

from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from api.schemas import (
    PolishApplyRequestSchema,
    PolishApplyResponseSchema,
    ErrorResponse,
)
from services import llm_service
from services import polisher_service
from config import TEMP_DIR, MAX_FILE_SIZE, MAX_CONCURRENT_UPLOADS

logger = logging.getLogger(__name__)

polish_router = APIRouter(prefix="/polish", tags=["Polish"])

# 并发限制信号量：润色涉及 LLM 调用，限制并发保护资源
_polish_semaphore = asyncio.Semaphore(MAX_CONCURRENT_UPLOADS)

# UUID v4 校验正则
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _check_llm_available():
    """检查 LLM 服务是否可用"""
    if not llm_service.is_available():
        raise HTTPException(
            status_code=503,
            detail=ErrorResponse(
                error="LLM_UNAVAILABLE",
                message="AI 服务未配置，请检查 DEEPSEEK_API_KEY 环境变量"
            ).model_dump(),
        )


def _validate_session_id(session_id: str):
    """校验 session_id 格式"""
    if not _UUID_RE.match(session_id):
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_SESSION_ID",
                message="session_id 格式不正确"
            ).model_dump(),
        )


def _safe_session_dir(session_id: str) -> str:
    """根据已校验的 session_id 构建安全的 session 目录路径（路径穿越防护）。"""
    session_dir = Path(TEMP_DIR) / session_id
    resolved = session_dir.resolve()
    temp_resolved = Path(TEMP_DIR).resolve()
    if not str(resolved).startswith(str(temp_resolved)):
        logger.error(f"[polish] 路径穿越检测: session_id={session_id!r}, resolved={resolved}")
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_SESSION_ID",
                message="session_id 格式不正确"
            ).model_dump(),
        )
    return str(session_dir)


def _safe_filename(filename: str) -> str:
    """清理文件名，移除路径分隔符等危险字符。"""
    safe = Path(filename).name
    safe = safe.replace("/", "_").replace("\\", "_").replace("..", "_")
    if not safe:
        safe = "document.docx"
    return safe


# ========================================
# POST /api/polish — 执行润色（SSE 流式）
# ========================================
@polish_router.post("")
async def polish_file(
    file: UploadFile = File(...),
    enable_reviewer: bool = Form(default=True),
):
    """上传 .docx 文件并执行内容润色。

    返回 SSE 流式响应，每完成一批段落推送一个事件。
    """
    _check_llm_available()

    # 验证文件类型
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_FILE_TYPE",
                message="请上传 .docx 格式的文件"
            ).model_dump(),
        )

    # 流式读取文件并验证大小
    content = bytearray()
    chunk_size = 64 * 1024
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        content.extend(chunk)
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="FILE_TOO_LARGE",
                    message=f"文件大小超过限制（最大 {MAX_FILE_SIZE // 1024 // 1024}MB）"
                ).model_dump(),
            )
    content = bytes(content)

    # 魔数校验：docx 文件是 ZIP 格式，前 4 字节为 PK\x03\x04
    if len(content) < 4 or content[:4] != b"PK\x03\x04":
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_FILE_CONTENT",
                message="文件内容无效：不是有效的 .docx 文件（文件可能已损坏或被篡改）"
            ).model_dump(),
        )

    # 保存到临时文件（安全路径）
    session_id = str(uuid.uuid4())
    session_dir = _safe_session_dir(session_id)
    os.makedirs(session_dir, exist_ok=True)

    # 安全文件名
    safe_name = _safe_filename(file.filename)
    filepath = os.path.join(session_dir, safe_name)
    with open(filepath, "wb") as f:
        f.write(content)

    logger.info(f"[{session_id}] 开始润色：{safe_name}")

    # 限制并发：SSE generator 包裹在信号量内
    async def _rate_limited_generator():
        async with _polish_semaphore:
            async for chunk in polisher_service.polish_file(
                file_path=filepath,
                filename=file.filename,
                session_id=session_id,
                enable_reviewer=enable_reviewer,
            ):
                yield chunk

    return StreamingResponse(
        _rate_limited_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ========================================
# POST /api/polish/apply — 应用润色修改
# ========================================
@polish_router.post("/apply", response_model=PolishApplyResponseSchema)
async def apply_polish(request: PolishApplyRequestSchema):
    """应用用户选中的润色建议，生成修改后的文档。"""
    _validate_session_id(request.session_id)

    try:
        result = await polisher_service.apply_polish(
            session_id=request.session_id,
            accepted_indices=request.accepted_indices,
        )
        return PolishApplyResponseSchema(**result)
    except ValueError as e:
        # 区分不同的错误类型
        msg = str(e)
        if "不存在" in msg or "已过期" in msg:
            raise HTTPException(
                status_code=404,
                detail=ErrorResponse(
                    error="NOT_FOUND",
                    message=msg
                ).model_dump(),
            )
        elif "已被应用" in msg:
            raise HTTPException(
                status_code=409,
                detail=ErrorResponse(
                    error="CONFLICT",
                    message=msg
                ).model_dump(),
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="BAD_REQUEST",
                    message=msg
                ).model_dump(),
            )


# ========================================
# GET /api/polish/download/{session_id} — 下载润色后文档
# ========================================
@polish_router.get("/download/{session_id}")
async def download_polished_file(session_id: str):
    """下载润色后的 .docx 文件。"""
    _validate_session_id(session_id)

    try:
        file_path, filename = polisher_service.get_polished_file(session_id)
    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                error="NOT_FOUND",
                message=str(e)
            ).model_dump(),
        )

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
