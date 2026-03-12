"""
模板提取引擎封装服务

封装现有 rule_extractor.py 中的 RuleExtractor，
提供 Web API 友好的接口（JSON/YAML 序列化）。
"""

from __future__ import annotations

import io
from collections import OrderedDict
from contextlib import redirect_stdout
from datetime import datetime, timezone
from typing import Optional

import yaml
from engine.rule_extractor import RuleExtractor, OrderedDumper


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
    yaml_content = _rules_to_yaml(rules, OrderedDumper)

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


def _rules_to_yaml(rules: dict, ordered_dumper) -> str:
    """将规则字典转为分节注释的 YAML 字符串。

    与 rule_extractor.py 中的 save_yaml 方法逻辑一致，
    但直接返回字符串而非写入文件。
    """
    sections = [
        ('meta', '元信息'),
        ('page_setup', '一、页面设置'),
        ('header_footer', '二、页眉页脚'),
        ('styles', '三、样式定义规则\n# 每个样式包含：段落格式 + 字符格式'),
        ('structure', '四、文档结构规则'),
        ('numbering', '五、编号定义规则'),
        ('special_checks', '六、特殊检查规则'),
        ('heading_style_fix', '七、标题样式自动修复规则'),
    ]

    lines = []
    lines.append(f'# {"=" * 60}')
    lines.append(f'# {rules.get("meta", {}).get("name", "格式规则")}')
    lines.append(f'# {rules.get("meta", {}).get("description", "")}')
    lines.append(f'# {"=" * 60}')
    lines.append('')

    for key, comment in sections:
        if key not in rules:
            continue

        lines.append(f'# {"=" * 28}')
        lines.append(f'# {comment}')
        lines.append(f'# {"=" * 28}')

        section_data = OrderedDict([(key, rules[key])])
        yaml_str = yaml.dump(
            dict(section_data),
            Dumper=ordered_dumper,
            default_flow_style=False,
            allow_unicode=True,
            width=120,
            sort_keys=False,
        )
        lines.append(yaml_str)

    return '\n'.join(lines)


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
