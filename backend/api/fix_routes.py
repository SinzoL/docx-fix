"""
格式修复 API 路由

提供文档格式修复端点：
- POST /fix          — 执行格式修复
- GET  /fix/download — 下载修复后文件
"""

from __future__ import annotations

import os
import logging
import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from api.schemas import FixRequest, FixReport, ErrorResponse
from api._helpers import (
    validate_session_id,
    safe_session_dir,
    touch_session,
    read_session_meta,
    resolve_rules,
)
from services.fixer_service import run_fix
from config import MAX_CONCURRENT_UPLOADS

logger = logging.getLogger(__name__)

fix_router = APIRouter(tags=["Fix"])

# 并发信号量
_upload_semaphore = asyncio.Semaphore(MAX_CONCURRENT_UPLOADS)


# ========================================
# POST /fix — 执行修复并返回预览
# ========================================
@fix_router.post("/fix", response_model=FixReport)
async def fix_file(request: FixRequest):
    """对已上传的文件执行格式修复。"""
    validate_session_id(request.session_id)
    session_dir = safe_session_dir(request.session_id)

    # 验证 session 存在
    if not os.path.exists(session_dir):
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                error="SESSION_NOT_FOUND",
                message="会话不存在或已过期，请重新上传文件"
            ).model_dump(),
        )

    # 续命 — 更新 session mtime
    touch_session(session_dir)

    # 并发限制
    async with _upload_semaphore:

        # 读取元信息
        meta = read_session_meta(session_dir)
        filename = meta.get("filename", "unknown.docx")

        # 查找上传的文件
        filepath = os.path.join(session_dir, filename)
        if not os.path.exists(filepath):
            raise HTTPException(
                status_code=404,
                detail=ErrorResponse(
                    error="SESSION_NOT_FOUND",
                    message="原始文件不存在，请重新上传"
                ).model_dump(),
            )

        # 解析规则来源
        resolved = resolve_rules(request.rule_id, request.custom_rules_yaml)

        # 执行修复（同步 CPU 密集型操作，放到线程池避免阻塞事件循环）
        try:
            report = await asyncio.to_thread(
                run_fix,
                filepath=filepath,
                rules_path=resolved.path,
                session_id=request.session_id,
                filename=filename,
                rule_name=resolved.name,
                include_text_fix=request.include_text_fix,
            )
            return report
        except Exception as e:
            logger.error(f"文件修复失败: session_id={request.session_id}, error={e}")
            raise HTTPException(
                status_code=500,
                detail=ErrorResponse(
                    error="FIX_ERROR",
                    message=f"修复失败: {str(e)}"
                ).model_dump(),
            )
        finally:
            resolved.cleanup()


# ========================================
# GET /fix/download — 下载修复后文件
# ========================================
@fix_router.get("/fix/download")
async def download_fixed_file(session_id: str):
    """下载修复后的 .docx 文件"""
    validate_session_id(session_id)
    session_dir = safe_session_dir(session_id)

    if not os.path.exists(session_dir):
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                error="SESSION_NOT_FOUND",
                message="会话不存在或已过期"
            ).model_dump(),
        )

    # 续命
    touch_session(session_dir)

    # 读取元信息获取文件名
    meta = read_session_meta(session_dir)
    filename = meta.get("filename", "document.docx")

    # 查找修复后的文件
    base, ext = os.path.splitext(filename)
    fixed_filename = base + "_fixed" + ext
    fixed_path = os.path.join(session_dir, fixed_filename)

    if not os.path.exists(fixed_path):
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                error="SESSION_NOT_FOUND",
                message="修复文件不存在，请先执行修复"
            ).model_dump(),
        )

    return FileResponse(
        path=fixed_path,
        filename=fixed_filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
