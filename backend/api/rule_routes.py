"""
规则管理 API 路由

提供格式规则的查询端点：
- GET /rules           — 获取可用规则列表
- GET /rules/{rule_id} — 获取规则详情
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.schemas import (
    RulesListResponse,
    RuleDetailResponse,
    RuleDetailSection,
    RuleDetailItem,
    ErrorResponse,
)
from services.rules_service import get_rules_list, get_rule_detail

rule_router = APIRouter(tags=["Rules"])


# ========================================
# GET /rules — 获取可用规则列表
# ========================================
@rule_router.get("/rules", response_model=RulesListResponse)
async def list_rules():
    """获取所有可用的规则文件列表"""
    rules = get_rules_list()
    return RulesListResponse(rules=rules)


# ========================================
# GET /rules/{rule_id} — 获取规则详情
# ========================================
@rule_router.get("/rules/{rule_id}", response_model=RuleDetailResponse)
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
