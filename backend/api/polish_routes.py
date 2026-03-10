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

from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from api.schemas import (
    PolishApplyRequestSchema,
    PolishApplyResponseSchema,
    ErrorResponse,
)
from services import llm_service
from services import polisher_service
from config import TEMP_DIR, MAX_FILE_SIZE

logger = logging.getLogger(__name__)

polish_router = APIRouter(prefix="/polish", tags=["Polish"])

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

    # 读取文件内容
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="FILE_TOO_LARGE",
                message=f"文件大小超过限制（最大 {MAX_FILE_SIZE // 1024 // 1024}MB）"
            ).model_dump(),
        )

    # 保存到临时文件
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(TEMP_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)

    # 安全文件名
    safe_name = re.sub(r'[^\w\u4e00-\u9fff\.\-]', '_', file.filename)
    filepath = os.path.join(session_dir, safe_name)
    with open(filepath, "wb") as f:
        f.write(content)

    logger.info(f"[{session_id}] 开始润色：{safe_name}")

    return StreamingResponse(
        polisher_service.polish_file(
            file_path=filepath,
            filename=file.filename,
            session_id=session_id,
            enable_reviewer=enable_reviewer,
        ),
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
