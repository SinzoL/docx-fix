"""
模板提取引擎封装服务

封装现有 rule_extractor.py 中的 RuleExtractor，
提供 Web API 友好的接口（JSON/YAML 序列化）。
"""

from __future__ import annotations

import io
from contextlib import redirect_stdout
from datetime import datetime, timezone
from typing import Optional

from engine.rule_extractor import RuleExtractor, rules_to_yaml


def run_extract(
    filepath: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> dict:
    """从 .docx 模板文件中提取格式规则。

    Args:
        filepath: 上传的模板 .docx 文件路径
        name: 规则名称（可选，默认由文件名生成）
        description: 规则描述（可选）

    Returns:
        包含以下字段的字典:
        - rules: dict — 提取的规则字典（与 YAML 规则文件结构一致）
        - yaml_content: str — 格式化的 YAML 字符串
        - summary: dict — 提取结果摘要
    """
    # #7: 使用 contextlib.redirect_stdout 替代手动 sys.stdout 操作
    # 这在多线程/多协程环境下比直接赋值 sys.stdout 更安全
    devnull = io.StringIO()
    with redirect_stdout(devnull):
        extractor = RuleExtractor(filepath)
        rules = extractor.extract_all(name=name, description=description)

    # 生成格式化的 YAML 字符串
    yaml_content = rules_to_yaml(rules)

    # 生成摘要信息
    summary = _build_summary(rules)

    # 收集审核上下文（供 LLM 审核使用）
    review_context = {
        "colored_text_paragraphs": getattr(extractor, "_colored_text_paragraphs", []),
        "heading_structure": getattr(extractor, "_heading_structure", []),
    }

    return {
        "rules": rules,
        "yaml_content": yaml_content,
        "summary": summary,
        "review_context": review_context,
    }


def _build_summary(rules: dict) -> dict:
    """根据提取的规则构建摘要信息。"""
    summary = {
        "has_page_setup": "page_setup" in rules,
        "has_header_footer": "header_footer" in rules,
        "has_numbering": "numbering" in rules,
        "has_structure": "structure" in rules,
        "has_special_checks": "special_checks" in rules,
        "has_heading_style_fix": "heading_style_fix" in rules,
        "style_count": len(rules.get("styles", {})),
        "extracted_at": datetime.now(timezone.utc).isoformat(),
    }

    # 页面设置摘要
    ps = rules.get("page_setup", {})
    if ps:
        summary["page_setup_info"] = {
            "paper_size": ps.get("paper_size", "未知"),
            "width_cm": ps.get("width_cm"),
            "height_cm": ps.get("height_cm"),
        }

    # 样式列表
    styles = rules.get("styles", {})
    if styles:
        summary["style_names"] = list(styles.keys())

    return summary
