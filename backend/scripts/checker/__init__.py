"""
checker 子包入口

保持与原 checker.py 完全兼容的对外接口。
外部调用方（checker_service.py、fixer_service.py）无需修改导入路径。

使用方式：
    from scripts.checker import DocxChecker
"""
from scripts.checker.base import (
    DocxChecker,
    CheckResult,
    fonts_match,
    Color,
    FONT_ALIASES,
    NSMAP,
    W,
)

__all__ = [
    'DocxChecker',
    'CheckResult',
    'fonts_match',
    'Color',
    'FONT_ALIASES',
    'NSMAP',
    'W',
]
