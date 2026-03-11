"""
格式检查 API 路由

提供文档格式检查端点：
- POST /check   — 上传文件并执行格式检查
- POST /recheck — 使用已上传文件切换规则重新检查
"""

from __future__ import annotations

import os
import uuid
import logging
import asyncio
from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from api.schemas import CheckReport, RecheckRequest, ErrorResponse
from api._helpers import (
    validate_session_id,
    safe_session_dir,
    safe_filename,
    touch_session,
    read_session_meta,
    write_session_meta,
    resolve_rules,
    validate_and_read_upload,
)
from services.checker_service import run_check
from config import MAX_CONCURRENT_UPLOADS

logger = logging.getLogger(__name__)

check_router = APIRouter(tags=["Check"])

# 并发上传信号量
_upload_semaphore = asyncio.Semaphore(MAX_CONCURRENT_UPLOADS)


# ========================================
# POST /check — 上传文件并执行格式检查
# ========================================
@check_router.post("/check", response_model=CheckReport)
async def check_file(
    file: UploadFile = File(...),
    rule_id: str = Form(default="default"),
    session_id: str = Form(default=""),
    custom_rules_yaml: Optional[str] = Form(default=None),
):
    """上传 .docx 文件并执行格式检查。

    当 custom_rules_yaml 非空时，使用该自定义 YAML 规则内容进行检查，
    忽略 rule_id 指定的服务端预置规则。
    """
    # 1. 验证文件（不占信号量）
    content = await validate_and_read_upload(file)

    # 并发限制
    if _upload_semaphore.locked():
        logger.warning("并发上传数已达上限，拒绝新请求")
    async with _upload_semaphore:

        # 2. 解析规则来源
        resolved = resolve_rules(rule_id, custom_rules_yaml)

        # 3. 生成 session_id（如果未提供）
        if not session_id:
            session_id = str(uuid.uuid4())
        else:
            validate_session_id(session_id)

        # 4. 保存文件到临时目录
        safe_name = safe_filename(file.filename)
        session_dir = safe_session_dir(session_id)
        os.makedirs(session_dir, exist_ok=True)
        filepath = os.path.join(session_dir, safe_name)
        with open(filepath, "wb") as f:
            f.write(content)

        # 保存元信息（JSON 格式）
        write_session_meta(session_dir, {
            "filename": safe_name,
            "rule_id": rule_id,
        })

        # 5. 执行检查（同步 CPU 密集型操作，放到线程池避免阻塞事件循环）
        try:
            report = await asyncio.to_thread(
                run_check,
                filepath=filepath,
                rules_path=resolved.path,
                session_id=session_id,
                filename=safe_name,
                rule_id=rule_id,
                rule_name=resolved.name,
            )
            return report
        except Exception as e:
            logger.error(f"文件检查失败: session_id={session_id}, error={e}")
            raise HTTPException(
                status_code=422,
                detail=ErrorResponse(
                    error="FILE_CORRUPTED",
                    message=f"文件处理失败: {str(e)}"
                ).model_dump(),
            )
        finally:
            resolved.cleanup()


# ========================================
# POST /recheck — 使用已上传文件切换规则重新检查
# ========================================
@check_router.post("/recheck", response_model=CheckReport)
async def recheck_file(request: RecheckRequest):
    """使用已上传的文件，切换到新的规则重新执行格式检查。"""
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

        # 更新元信息中的 rule_id
        meta["rule_id"] = request.rule_id
        write_session_meta(session_dir, meta)

        # 执行检查
        try:
            report = await asyncio.to_thread(
                run_check,
                filepath=filepath,
                rules_path=resolved.path,
                session_id=request.session_id,
                filename=filename,
                rule_id=request.rule_id,
                rule_name=resolved.name,
            )
            return report
        except Exception as e:
            logger.error(f"重新检查失败: session_id={request.session_id}, error={e}")
            raise HTTPException(
                status_code=422,
                detail=ErrorResponse(
                    error="RECHECK_ERROR",
                    message=f"重新检查失败: {str(e)}"
                ).model_dump(),
            )
        finally:
            resolved.cleanup()
