"""
Word 文档格式自动修复引擎

根据 YAML 规则配置文件，自动修复文档的格式问题。
仅修复格式，不改动文档内容。
"""

from .constants import fonts_match, NSMAP, W, FONT_ALIASES
from .base import DocxFixer

__all__ = ["DocxFixer", "fonts_match", "NSMAP", "W", "FONT_ALIASES"]
