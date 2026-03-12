"""
文本排版检查子包

检查文档文本内容层面的排版规范问题，包含确定性检查和争议候选检查。
"""

from .models import ParagraphInfo, TextIssue, DocumentStats
from .paragraph_iter import (
    iter_all_paragraphs,
    cjk_ratio,
    is_code_style,
    context_snippet,
    mask_urls,
    source_label,
    location_str,
)
from .punctuation_checks import (
    check_bracket_mismatch,
    check_quote_mismatch,
    check_duplicate_punctuation,
    check_halfwidth_punctuation_in_chinese,
    check_sentence_ending,
    _is_dot_in_special_context,
    _is_punct_in_special_context,
)
from .spacing_checks import (
    check_extra_spaces_in_chinese,
    check_consecutive_spaces,
    check_leading_trailing_spaces,
    check_fullwidth_space,
    count_cjk_english_spacing,
    mark_cjk_spacing_disputes,
    is_intentional_spaced_text,
)
from .constants import (
    DUPLICATE_PUNCT_RE,
    CJK_SPACE_CJK_RE,
    MULTI_SPACE_RE,
    FULLWIDTH_SPACE,
)
from .dispatcher import run_text_convention_checks, default_text_conventions

__all__ = [
    # 数据模型
    'ParagraphInfo', 'TextIssue', 'DocumentStats',
    # 段落遍历
    'iter_all_paragraphs',
    # 辅助函数
    'cjk_ratio', 'is_code_style', 'context_snippet',
    'mask_urls', 'source_label', 'location_str',
    # 标点检查
    'check_bracket_mismatch', 'check_quote_mismatch',
    'check_duplicate_punctuation', 'check_halfwidth_punctuation_in_chinese',
    'check_sentence_ending',
    # 空格检查
    'check_extra_spaces_in_chinese', 'check_consecutive_spaces',
    'check_leading_trailing_spaces', 'check_fullwidth_space',
    'count_cjk_english_spacing', 'mark_cjk_spacing_disputes',
    'is_intentional_spaced_text',
    # 调度器
    'run_text_convention_checks', 'default_text_conventions',
    # 底层常量和函数（供外部模块兼容使用）
    '_is_dot_in_special_context', '_is_punct_in_special_context',
    'DUPLICATE_PUNCT_RE', 'CJK_SPACE_CJK_RE', 'MULTI_SPACE_RE', 'FULLWIDTH_SPACE',
]
