"""
规则提取器子包

从 Word 模板文档自动提取格式规则，生成 YAML 规则配置文件。
通过解析 .docx 文件的 XML 结构（styles.xml、numbering.xml、document.xml），
自动提取所有格式信息并生成与 checker / fixer 兼容的 YAML 规则文件。

用法：
    python -m engine.rule_extractor <模板docx文件> [--output <输出yaml路径>] [--name <规则名称>]
"""

from .base import RuleExtractor, main
from .constants import (
    NSMAP, W, FONT_ALIASES, HALF_PT_TO_CN_SIZE,
    ALIGNMENT_MAP, OrderedDumper, Color,
)

__all__ = [
    'RuleExtractor',
    'main',
    'NSMAP',
    'W',
    'FONT_ALIASES',
    'HALF_PT_TO_CN_SIZE',
    'ALIGNMENT_MAP',
    'OrderedDumper',
    'Color',
]
