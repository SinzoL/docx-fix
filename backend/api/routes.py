"""
API 路由定义

所有 API 端点均挂载在 /api 前缀下。
"""

import os
import re
import shutil
import uuid
import logging
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse

from api.schemas import (
    RulesListResponse,
    RuleDetailResponse,
    RuleDetailSection,
    RuleDetailItem,
    CheckReport,
    FixRequest,
    FixReport,
    ErrorResponse,
    ExtractRulesResponse,
    ExtractRulesSummary,
    ExtractRulesPageSetup,
)
from services.rules_service import get_rules_list, get_rule_path, get_rule_detail
from services.checker_service import run_check
from services.fixer_service import run_fix
from services.extractor_service import run_extract
from config import TEMP_DIR, MAX_FILE_SIZE

logger = logging.getLogger(__name__)

router = APIRouter()

# session_id 合法格式：UUID v4
_SESSION_ID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE)


def _validate_session_id(session_id: str) -> str:
    """校验 session_id 格式，防止路径穿越攻击。

    Args:
        session_id: 客户端传入的 session_id

    Returns:
        校验通过的 session_id

    Raises:
        HTTPException: session_id 格式非法
    """
    if not _SESSION_ID_PATTERN.match(session_id):
        logger.warning(f"非法 session_id 被拦截: {session_id!r}")
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_SESSION_ID",
                message="会话 ID 格式无效"
            ).model_dump(),
        )
    return session_id


def _safe_session_dir(session_id: str) -> str:
    """根据已校验的 session_id 构建安全的 session 目录路径。

    额外做 resolve() 检查，确保最终路径确实在 TEMP_DIR 下。

    Args:
        session_id: 已通过 _validate_session_id 校验的 session_id

    Returns:
        session 目录的绝对路径

    Raises:
        HTTPException: 路径不在 TEMP_DIR 下（二次防御）
    """
    session_dir = Path(TEMP_DIR) / session_id
    resolved = session_dir.resolve()
    temp_resolved = Path(TEMP_DIR).resolve()
    if not str(resolved).startswith(str(temp_resolved)):
        logger.error(f"路径穿越检测: session_id={session_id!r}, resolved={resolved}")
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_SESSION_ID",
                message="会话 ID 格式无效"
            ).model_dump(),
        )
    return str(session_dir)


def _safe_filename(filename: str) -> str:
    """清理文件名，移除路径分隔符等危险字符。

    Args:
        filename: 客户端传入的原始文件名

    Returns:
        安全的文件名（仅保留文件名部分）
    """
    # 只取文件名部分（去掉任何路径前缀）
    safe = Path(filename).name
    # 再次确认不包含路径分隔符
    safe = safe.replace("/", "_").replace("\\", "_").replace("..", "_")
    if not safe:
        safe = "document.docx"
    return safe


# ========================================
# GET /rules — 获取可用规则列表
# ========================================
@router.get("/rules", response_model=RulesListResponse)
async def list_rules():
    """获取所有可用的规则文件列表"""
    rules = get_rules_list()
    return RulesListResponse(rules=rules)


# ========================================
# GET /rules/{rule_id} — 获取规则详情
# ========================================
@router.get("/rules/{rule_id}", response_model=RuleDetailResponse)
async def get_rule(rule_id: str):
    """获取指定规则文件的详细内容"""
    data = get_rule_detail(rule_id)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                error="INVALID_RULE",
                message=f"规则 '{rule_id}' 不存在"
            ).model_dump(),
        )

    meta = data.get("meta", {})
    sections = []

    # 页面设置
    page_setup = data.get("page_setup", {})
    if page_setup:
        page_rules = []
        if "width_cm" in page_setup and "height_cm" in page_setup:
            page_rules.append(RuleDetailItem(
                item="纸张大小",
                value=f"{page_setup.get('paper_size', 'A4')} ({page_setup['width_cm']} × {page_setup['height_cm']} cm)"
            ))
        for key, label in [
            ("margin_top_cm", "上边距"),
            ("margin_bottom_cm", "下边距"),
            ("margin_left_cm", "左边距"),
            ("margin_right_cm", "右边距"),
        ]:
            if key in page_setup:
                page_rules.append(RuleDetailItem(item=label, value=f"{page_setup[key]} cm"))
        if page_rules:
            sections.append(RuleDetailSection(name="页面设置", rules=page_rules))

    # 样式定义
    styles = data.get("styles", {})
    for style_name, style_rules in styles.items():
        style_items = []
        char_rules = style_rules.get("character", {})
        para_rules = style_rules.get("paragraph", {})

        if "font_east_asia" in char_rules:
            style_items.append(RuleDetailItem(item="中文字体", value=char_rules["font_east_asia"]))
        if "font_ascii" in char_rules:
            style_items.append(RuleDetailItem(item="英文字体", value=char_rules["font_ascii"]))
        if "font_size_pt" in char_rules:
            style_items.append(RuleDetailItem(item="字号", value=f"{char_rules['font_size_pt']}pt"))
        if "alignment" in para_rules:
            style_items.append(RuleDetailItem(item="对齐方式", value=para_rules["alignment"]))
        if "line_spacing" in para_rules:
            style_items.append(RuleDetailItem(item="行距", value=str(para_rules["line_spacing"])))
        if "outline_level" in para_rules:
            style_items.append(RuleDetailItem(item="大纲级别", value=str(para_rules["outline_level"] + 1)))

        if style_items:
            sections.append(RuleDetailSection(name=f"样式: {style_name}", rules=style_items))

    # 页眉页脚
    hf = data.get("header_footer", {})
    if hf:
        hf_items = []
        header = hf.get("header", {})
        if header.get("text"):
            hf_items.append(RuleDetailItem(item="页眉文本", value=header["text"]))
        if hf_items:
            sections.append(RuleDetailSection(name="页眉页脚", rules=hf_items))

    # 文档结构
    structure = data.get("structure", {})
    if structure:
        struct_items = []
        for ch in structure.get("required_chapters", []):
            struct_items.append(RuleDetailItem(item="必要章节", value=ch.get("pattern", "")))
        if struct_items:
            sections.append(RuleDetailSection(name="文档结构", rules=struct_items))

    return RuleDetailResponse(
        id=rule_id,
        name=meta.get("name", rule_id),
        description=meta.get("description", ""),
        sections=sections,
    )


# ========================================
# POST /check — 上传文件并执行格式检查
# ========================================
@router.post("/check", response_model=CheckReport)
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
    # 1. 验证文件类型
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_FILE_TYPE",
                message="仅支持 .docx 格式文件"
            ).model_dump(),
        )

    # 2. 验证文件大小
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="FILE_TOO_LARGE",
                message=f"文件大小超过限制（最大 {MAX_FILE_SIZE // 1024 // 1024}MB）"
            ).model_dump(),
        )

    # 3. 处理规则来源（自定义 YAML 或服务端预置规则）
    custom_rules_tmpfile = None
    if custom_rules_yaml:
        # 使用自定义规则：写入临时 YAML 文件
        try:
            custom_rules_tmpfile = tempfile.NamedTemporaryFile(
                mode="w", suffix=".yaml", delete=False, dir=TEMP_DIR
            )
            custom_rules_tmpfile.write(custom_rules_yaml)
            custom_rules_tmpfile.close()
            rules_path = custom_rules_tmpfile.name
            rule_name = "自定义规则"
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="INVALID_CUSTOM_RULES",
                    message="自定义规则内容无效"
                ).model_dump(),
            )
    else:
        # 使用服务端预置规则
        rules_path = get_rule_path(rule_id)
        if rules_path is None:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="INVALID_RULE",
                    message=f"规则 '{rule_id}' 不存在"
                ).model_dump(),
            )
        rule_name = rule_id
        rules_list_data = get_rules_list()
        for r in rules_list_data:
            if r.id == rule_id:
                rule_name = r.name
                break

    # 4. 生成 session_id（如果未提供）
    if not session_id:
        session_id = str(uuid.uuid4())
    else:
        _validate_session_id(session_id)

    # 5. 保存文件到临时目录
    safe_name = _safe_filename(file.filename)
    session_dir = _safe_session_dir(session_id)
    os.makedirs(session_dir, exist_ok=True)
    filepath = os.path.join(session_dir, safe_name)
    with open(filepath, "wb") as f:
        f.write(content)

    # 保存元信息
    meta_path = os.path.join(session_dir, "_meta.txt")
    with open(meta_path, "w") as f:
        f.write(f"{safe_name}\n{rule_id}")

    # 6. 执行检查
    try:
        report = run_check(
            filepath=filepath,
            rules_path=rules_path,
            session_id=session_id,
            filename=safe_name,
            rule_id=rule_id,
            rule_name=rule_name,
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
        # 清理自定义规则临时文件
        if custom_rules_tmpfile and os.path.exists(custom_rules_tmpfile.name):
            os.unlink(custom_rules_tmpfile.name)


# ========================================
# POST /fix — 执行修复并返回预览
# ========================================
@router.post("/fix", response_model=FixReport)
async def fix_file(
    request: FixRequest,
):
    """对已上传的文件执行格式修复。

    当请求体中 custom_rules_yaml 非空时，使用该自定义 YAML 规则内容进行修复。
    """
    _validate_session_id(request.session_id)
    session_dir = _safe_session_dir(request.session_id)

    # 验证 session 存在
    if not os.path.exists(session_dir):
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                error="SESSION_NOT_FOUND",
                message="会话不存在或已过期，请重新上传文件"
            ).model_dump(),
        )

    # 读取元信息
    meta_path = os.path.join(session_dir, "_meta.txt")
    if not os.path.exists(meta_path):
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                error="SESSION_NOT_FOUND",
                message="会话元数据丢失，请重新上传文件"
            ).model_dump(),
        )

    with open(meta_path, "r") as f:
        lines = f.read().strip().split("\n")
        filename = lines[0] if lines else "unknown.docx"

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

    # 处理规则来源（自定义 YAML 或服务端预置规则）
    custom_rules_tmpfile = None
    if request.custom_rules_yaml:
        # 使用自定义规则：写入临时 YAML 文件
        try:
            os.makedirs(TEMP_DIR, exist_ok=True)
            custom_rules_tmpfile = tempfile.NamedTemporaryFile(
                mode="w", suffix=".yaml", delete=False, dir=TEMP_DIR
            )
            custom_rules_tmpfile.write(request.custom_rules_yaml)
            custom_rules_tmpfile.close()
            rules_path = custom_rules_tmpfile.name
            rule_name = "自定义规则"
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="INVALID_CUSTOM_RULES",
                    message="自定义规则内容无效"
                ).model_dump(),
            )
    else:
        # 使用服务端预置规则
        rules_path = get_rule_path(request.rule_id)
        if rules_path is None:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="INVALID_RULE",
                    message=f"规则 '{request.rule_id}' 不存在"
                ).model_dump(),
            )
        rule_name = request.rule_id
        rules_list_data = get_rules_list()
        for r in rules_list_data:
            if r.id == request.rule_id:
                rule_name = r.name
                break

    # 执行修复
    try:
        report = run_fix(
            filepath=filepath,
            rules_path=rules_path,
            session_id=request.session_id,
            filename=filename,
            rule_name=rule_name,
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
        # 清理自定义规则临时文件
        if custom_rules_tmpfile and os.path.exists(custom_rules_tmpfile.name):
            os.unlink(custom_rules_tmpfile.name)


# ========================================
# GET /fix/download — 下载修复后文件
# ========================================
@router.get("/fix/download")
async def download_fixed_file(session_id: str):
    """下载修复后的 .docx 文件"""
    _validate_session_id(session_id)
    session_dir = _safe_session_dir(session_id)

    if not os.path.exists(session_dir):
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                error="SESSION_NOT_FOUND",
                message="会话不存在或已过期"
            ).model_dump(),
        )

    # 读取元信息获取文件名
    meta_path = os.path.join(session_dir, "_meta.txt")
    filename = "document.docx"
    if os.path.exists(meta_path):
        with open(meta_path, "r") as f:
            lines = f.read().strip().split("\n")
            filename = lines[0] if lines else "document.docx"

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


# ========================================
# POST /extract-rules — 从模板文档提取格式规则
# ========================================
@router.post("/extract-rules", response_model=ExtractRulesResponse)
async def extract_rules(
    file: UploadFile = File(...),
    name: str = Form(default=""),
):
    """上传 .docx 模板文件，自动提取格式规则并返回 YAML 内容。

    提取的 YAML 内容将直接返回给前端，由前端保存到浏览器本地存储（localStorage）中，
    不同用户的规则互不干扰，30天后过期自动删除。
    """
    # 1. 验证文件类型
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_FILE_TYPE",
                message="仅支持 .docx 格式文件"
            ).model_dump(),
        )

    # 2. 验证文件大小
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="FILE_TOO_LARGE",
                message=f"文件大小超过限制（最大 {MAX_FILE_SIZE // 1024 // 1024}MB）"
            ).model_dump(),
        )

    # 3. 保存文件到临时目录
    session_id = str(uuid.uuid4())
    session_dir = _safe_session_dir(session_id)
    os.makedirs(session_dir, exist_ok=True)
    safe_name = _safe_filename(file.filename)
    filepath = os.path.join(session_dir, safe_name)
    with open(filepath, "wb") as f:
        f.write(content)

    # 4. 执行提取
    try:
        result = run_extract(
            filepath=filepath,
            name=name or None,
            description=None,
        )

        # 空白模板检查：如果没有检测到任何有效格式规则
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
        # 清理临时文件（提取完成后不需要保留）
        shutil.rmtree(session_dir, ignore_errors=True)
