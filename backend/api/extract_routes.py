"""
模板提取 API 路由

提供从模板文档提取格式规则的端点：
- POST /extract-rules — 上传模板文档并提取格式规则
"""

from __future__ import annotations

import os
import uuid
import shutil
import logging
import asyncio

from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from api.schemas import (
    ExtractRulesResponse,
    ExtractRulesSummary,
    ExtractRulesPageSetup,
    ErrorResponse,
)
from api._helpers import (
    safe_session_dir,
    safe_filename,
    validate_and_read_upload,
)
from services.extractor_service import run_extract
from config import MAX_CONCURRENT_UPLOADS

logger = logging.getLogger(__name__)

extract_router = APIRouter(tags=["Extract"])

# 并发信号量
_upload_semaphore = asyncio.Semaphore(MAX_CONCURRENT_UPLOADS)


# ========================================
# POST /extract-rules — 从模板文档提取格式规则
# ========================================
@extract_router.post("/extract-rules", response_model=ExtractRulesResponse)
async def extract_rules(
    file: UploadFile = File(...),
    name: str = Form(default=""),
):
    """上传 .docx 模板文件，自动提取格式规则并返回 YAML 内容。"""
    # 1. 验证文件（使用公共函数）
    content = await validate_and_read_upload(file)

    # 并发限制
    async with _upload_semaphore:

        # 2. 保存文件到临时目录
        session_id = str(uuid.uuid4())
        session_dir = safe_session_dir(session_id)
        os.makedirs(session_dir, exist_ok=True)
        safe_name = safe_filename(file.filename)
        filepath = os.path.join(session_dir, safe_name)
        with open(filepath, "wb") as f:
            f.write(content)

        # 3. 执行提取（同步操作，放到线程池）
        try:
            result = await asyncio.to_thread(
                run_extract,
                filepath=filepath,
                name=name or None,
                description=None,
            )

            # 空白模板检查
            raw_summary = result.get("summary", {})
            has_any = any([
                raw_summary.get("has_page_setup"),
                raw_summary.get("has_header_footer"),
                raw_summary.get("has_numbering"),
                raw_summary.get("has_structure"),
                raw_summary.get("has_special_checks"),
                raw_summary.get("has_heading_style_fix"),
                raw_summary.get("style_count", 0) > 0,
            ])
            if not has_any:
                raise HTTPException(
                    status_code=422,
                    detail=ErrorResponse(
                        error="EMPTY_TEMPLATE",
                        message="未检测到有效格式规则，请确认上传的是包含格式设置的模板文件"
                    ).model_dump(),
                )

            # 构建摘要
            raw_summary = result["summary"]
            page_setup_info = None
            if raw_summary.get("page_setup_info"):
                page_setup_info = ExtractRulesPageSetup(**raw_summary["page_setup_info"])

            summary = ExtractRulesSummary(
                has_page_setup=raw_summary.get("has_page_setup", False),
                has_header_footer=raw_summary.get("has_header_footer", False),
                has_numbering=raw_summary.get("has_numbering", False),
                has_structure=raw_summary.get("has_structure", False),
                has_special_checks=raw_summary.get("has_special_checks", False),
                has_heading_style_fix=raw_summary.get("has_heading_style_fix", False),
                style_count=raw_summary.get("style_count", 0),
                style_names=raw_summary.get("style_names", []),
                page_setup_info=page_setup_info,
                extracted_at=raw_summary.get("extracted_at", ""),
            )

            return ExtractRulesResponse(
                yaml_content=result["yaml_content"],
                summary=summary,
                filename=safe_name,
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"模板提取失败: filename={safe_name}, error={e}")
            raise HTTPException(
                status_code=422,
                detail=ErrorResponse(
                    error="EXTRACT_ERROR",
                    message=f"模板提取失败: {str(e)}"
                ).model_dump(),
            )
        finally:
            # 清理临时文件
            shutil.rmtree(session_dir, ignore_errors=True)
