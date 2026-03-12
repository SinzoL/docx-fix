"""
checker 子包入口

保持与原 checker.py 完全兼容的对外接口。
外部调用方（checker_service.py、fixer_service.py）无需修改导入路径。

使用方式：
    from engine.checker import DocxChecker
"""
from engine.checker.base import DocxChecker, CheckResult
from engine.shared_constants import fonts_match, Color, FONT_ALIASES, NSMAP, W
from engine.checker.text_convention_checker import (
    run_text_convention_checks,
    iter_all_paragraphs,
    TextIssue,
    DocumentStats,
    ParagraphInfo,
)

__all__ = [
    'DocxChecker',
    'CheckResult',
    'fonts_match',
    'Color',
    'FONT_ALIASES',
    'NSMAP',
    'W',
    'run_text_convention_checks',
    'iter_all_paragraphs',
    'TextIssue',
    'DocumentStats',
    'ParagraphInfo',
]
