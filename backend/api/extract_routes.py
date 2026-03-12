"""
模板提取 API 路由

提供从模板文档提取格式规则的端点：
- POST /extract-rules — 上传模板文档并提取格式规则
- POST /extract-rules/review — LLM 智能审核提取结果
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
    ExtractReviewContext,
    ColoredTextParagraph,
    HeadingStructureItem,
    ExtractReviewRequest,
    ExtractReviewResponse,
    ExtractReviewItem,
    ErrorResponse,
)
from api._helpers import (
    safe_session_dir,
    safe_filename,
    validate_and_read_upload,
    upload_semaphore,
)
from services.extractor_service import run_extract
from services.extract_review_service import review_extract_rules

logger = logging.getLogger(__name__)

extract_router = APIRouter(tags=["Extract"])


# ========================================
# POST /extract-rules — 从模板文档提取格式规则
# ========================================
@extract_router.post("/extract-rules", response_model=ExtractRulesResponse)
async def extract_rules(
    file: UploadFile = File(...),
    name: str = Form(default=""),
):
    """上传 .docx 模板文件，自动提取格式规则并返回 YAML 内容。"""
    # 并发限制（前移到文件读取之前，避免多个大文件同时读入内存）
    async with upload_semaphore:

        # 1. 验证文件（使用公共函数）
        content = await validate_and_read_upload(file)

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

            # 构建审核上下文
            raw_review_ctx = result.get("review_context", {})
            review_context = ExtractReviewContext(
                colored_text_paragraphs=[
                    ColoredTextParagraph(**p)
                    for p in raw_review_ctx.get("colored_text_paragraphs", [])
                ],
                heading_structure=[
                    HeadingStructureItem(**h)
                    for h in raw_review_ctx.get("heading_structure", [])
                ],
            )

            return ExtractRulesResponse(
                yaml_content=result["yaml_content"],
                summary=summary,
                filename=safe_name,
                review_context=review_context,
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


# ========================================
# POST /extract-rules/review — LLM 智能审核提取结果
# ========================================
@extract_router.post("/extract-rules/review", response_model=ExtractReviewResponse)
async def review_extract(
    request: ExtractReviewRequest,
):
    """对提取的规则进行 LLM 智能审核。

    接受提取结果上下文（YAML 内容 + 特殊颜色字体 + 标题结构），
    调用 LLM 进行四维度审核，返回审核建议列表。
    LLM 不可用时返回空列表（不返回错误）。
    """
    # 校验 yaml_content 非空
    if not request.yaml_content or not request.yaml_content.strip():
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_REQUEST",
                message="缺少必要的审核上下文",
            ).model_dump(),
        )

    # 调用审核服务
    review_items = await review_extract_rules(
        yaml_content=request.yaml_content,
        colored_text_paragraphs=[
            p.model_dump() for p in request.colored_text_paragraphs
        ],
        heading_structure=[
            h.model_dump() for h in request.heading_structure
        ],
    )

    return ExtractReviewResponse(
        review_items=[ExtractReviewItem(**item) for item in review_items],
    )
