"""
润色 API 路由

提供内容润色功能的 REST/SSE 端点：
- POST /api/polish           — 执行润色（SSE 流式）
- POST /api/polish/apply     — 应用润色修改
- GET  /api/polish/download/{session_id} — 下载润色后文档
"""

import os
import uuid
import logging
import asyncio

from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from api.schemas import (
    PolishApplyRequestSchema,
    PolishApplyResponseSchema,
    PolishSessionStatusSchema,
    ErrorResponse,
)
from api._helpers import (
    validate_session_id,
    safe_session_dir,
    safe_filename,
    validate_and_read_upload,
)
from services import llm_service
from services import polisher_service
from config import MAX_CONCURRENT_UPLOADS

logger = logging.getLogger(__name__)

polish_router = APIRouter(prefix="/polish", tags=["Polish"])

# 并发限制信号量：润色涉及 LLM 调用，限制并发保护资源
_polish_semaphore = asyncio.Semaphore(MAX_CONCURRENT_UPLOADS)


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

    # 验证文件（扩展名、大小、魔数）
    content = await validate_and_read_upload(file)

    # 保存到临时文件（安全路径）
    session_id = str(uuid.uuid4())
    session_dir = safe_session_dir(session_id)
    os.makedirs(session_dir, exist_ok=True)

    # 安全文件名
    safe_name = safe_filename(file.filename)
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
    validate_session_id(request.session_id)

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
# GET /api/polish/session/{session_id}/status — 检查 session 有效性
# ========================================
@polish_router.get("/session/{session_id}/status", response_model=PolishSessionStatusSchema)
async def check_polish_session_status(session_id: str):
    """检查润色 session 是否仍然有效（用于前端从缓存恢复后验证）。"""
    validate_session_id(session_id)

    result = polisher_service.check_session_exists(session_id)
    return PolishSessionStatusSchema(**result)


# ========================================
# GET /api/polish/download/{session_id} — 下载润色后文档
# ========================================
@polish_router.get("/download/{session_id}")
async def download_polished_file(session_id: str):
    """下载润色后的 .docx 文件。"""
    validate_session_id(session_id)

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
