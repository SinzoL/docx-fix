"""
通用文本排版习惯检查器 — 兼容层

本文件已拆分为 text_convention/ 子包，此处仅保留重新导出，
确保所有现有导入路径（from scripts.checker.text_convention_checker import ...）不变。

实际实现位于：
- text_convention/constants.py       — 常量定义
- text_convention/models.py          — 数据模型
- text_convention/paragraph_iter.py  — 段落遍历器与辅助函数
- text_convention/punctuation_checks.py — 标点检查
- text_convention/spacing_checks.py  — 空格检查
- text_convention/dispatcher.py      — 核心调度
"""

# 从子包导入所有公开符号
from scripts.checker.text_convention import (  # noqa: F401
    # 数据模型
    ParagraphInfo,
    TextIssue,
    DocumentStats,
    # 段落遍历
    iter_all_paragraphs,
    # 辅助函数
    cjk_ratio,
    is_code_style,
    context_snippet,
    mask_urls,
    source_label,
    location_str,
    # 标点检查
    check_bracket_mismatch,
    check_quote_mismatch,
    check_duplicate_punctuation,
    check_halfwidth_punctuation_in_chinese,
    check_sentence_ending,
    _is_dot_in_special_context,
    _is_punct_in_special_context,
    # 空格检查
    check_extra_spaces_in_chinese,
    check_consecutive_spaces,
    check_leading_trailing_spaces,
    check_fullwidth_space,
    count_cjk_english_spacing,
    mark_cjk_spacing_disputes,
    # 底层常量
    DUPLICATE_PUNCT_RE,
    CJK_SPACE_CJK_RE,
    MULTI_SPACE_RE,
    FULLWIDTH_SPACE,
    # 调度器
    run_text_convention_checks,
    default_text_conventions,
)

# ===== 向后兼容别名 =====
# rule_scanner.py 等模块使用带下划线前缀的旧函数名
_cjk_ratio = cjk_ratio
_is_code_style = is_code_style
_mask_urls = mask_urls
_default_text_conventions = default_text_conventions
_check_bracket_mismatch = check_bracket_mismatch
_check_duplicate_punctuation = check_duplicate_punctuation
_check_extra_spaces_in_chinese = check_extra_spaces_in_chinese
_check_consecutive_spaces = check_consecutive_spaces
_check_leading_trailing_spaces = check_leading_trailing_spaces
_check_fullwidth_space = check_fullwidth_space
_check_halfwidth_punctuation_in_chinese = check_halfwidth_punctuation_in_chinese
_check_sentence_ending = check_sentence_ending

# 底层常量别名（带下划线前缀）
_DUPLICATE_PUNCT_RE = DUPLICATE_PUNCT_RE
_CJK_SPACE_CJK_RE = CJK_SPACE_CJK_RE
_MULTI_SPACE_RE = MULTI_SPACE_RE
_FULLWIDTH_SPACE = FULLWIDTH_SPACE
