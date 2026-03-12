"""
文本排版检查 — 核心调度器

协调所有检查函数，遍历段落并分发到各个检查模块。
"""

from __future__ import annotations

from docx.document import Document

from engine.checker.base import CheckResult

from .models import ParagraphInfo, TextIssue, DocumentStats
from .paragraph_iter import (
    iter_all_paragraphs,
    cjk_ratio, is_code_style, mask_urls, location_str,
)
from .punctuation_checks import (
    check_bracket_mismatch,
    check_quote_mismatch,
    check_duplicate_punctuation,
    check_halfwidth_punctuation_in_chinese,
    check_sentence_ending,
)
from .spacing_checks import (
    check_extra_spaces_in_chinese,
    check_consecutive_spaces,
    check_leading_trailing_spaces,
    check_fullwidth_space,
    count_cjk_english_spacing,
    mark_cjk_spacing_disputes,
)


def run_text_convention_checks(
    checker,
    doc: Document,
    rules: dict,
) -> tuple[list[TextIssue], DocumentStats]:
    """执行所有文本排版习惯检查。

    Args:
        checker: DocxChecker 实例（用于 add_result）
        doc: python-docx Document 对象
        rules: YAML 规则字典（完整的 rules）

    Returns:
        (issues, stats) — 所有检查问题列表 + 文档统计
    """
    tc_rules = rules.get('text_conventions', {})
    if not tc_rules:
        tc_rules = default_text_conventions()

    all_issues: list[TextIssue] = []
    stats = DocumentStats()

    paragraphs = list(iter_all_paragraphs(doc))
    stats.total_paragraphs = len(paragraphs)

    for i, para_info in enumerate(paragraphs):
        text = para_info.text
        style_name = para_info.style_name
        is_code = is_code_style(style_name)
        cjk_r = cjk_ratio(text)
        is_cjk_para = cjk_r >= 0.1

        masked_text = mask_urls(text)

        # 跳过公式段落
        if para_info.paragraph is not None:
            try:
                omath = para_info.paragraph._element.findall(
                    './/{http://schemas.openxmlformats.org/officeDocument/2006/math}oMath'
                )
                if omath:
                    continue
            except Exception:
                pass

        # === 确定性检查 ===

        if tc_rules.get('bracket_mismatch', {}).get('enabled', True):
            next_text = paragraphs[i + 1].text[:5] if i + 1 < len(paragraphs) else ""
            issues = check_bracket_mismatch(para_info, masked_text, next_text)
            all_issues.extend(issues)

        if tc_rules.get('quote_mismatch', {}).get('enabled', True):
            issues = check_quote_mismatch(para_info, masked_text)
            all_issues.extend(issues)

        if tc_rules.get('duplicate_punctuation', {}).get('enabled', True):
            issues = check_duplicate_punctuation(para_info, masked_text)
            all_issues.extend(issues)

        if not is_code:
            if is_cjk_para and tc_rules.get('extra_spaces_in_chinese', {}).get('enabled', True):
                issues = check_extra_spaces_in_chinese(para_info, masked_text)
                all_issues.extend(issues)

            if tc_rules.get('consecutive_spaces', {}).get('enabled', True):
                issues = check_consecutive_spaces(para_info, masked_text)
                all_issues.extend(issues)

            if tc_rules.get('leading_trailing_spaces', {}).get('enabled', True):
                issues = check_leading_trailing_spaces(para_info, text)
                all_issues.extend(issues)

            if tc_rules.get('fullwidth_space', {}).get('enabled', True):
                issues = check_fullwidth_space(para_info, text)
                all_issues.extend(issues)

        # === 争议候选检查 ===

        if not is_code and is_cjk_para:
            if tc_rules.get('cjk_english_spacing', {}).get('enabled', True):
                s, u = count_cjk_english_spacing(masked_text)
                stats.cjk_spaced_count += s
                stats.cjk_unspaced_count += u

            if tc_rules.get('fullwidth_halfwidth_punctuation', {}).get('enabled', True):
                issues = check_halfwidth_punctuation_in_chinese(para_info, masked_text)
                all_issues.extend(issues)

            if tc_rules.get('sentence_ending_punctuation', {}).get('enabled', True):
                issues = check_sentence_ending(para_info, text)
                all_issues.extend(issues)

    # 争议候选：中英文间距不一致（文档级判断）
    if tc_rules.get('cjk_english_spacing', {}).get('enabled', True):
        total = stats.cjk_spaced_count + stats.cjk_unspaced_count
        if total > 0:
            minority = min(stats.cjk_spaced_count, stats.cjk_unspaced_count)
            if minority > 0 and minority / total > 0.05:
                mark_cjk_spacing_disputes(paragraphs, all_issues, stats, tc_rules)

    # 将确定性问题注册到 checker
    for issue in all_issues:
        if not issue.is_disputed:
            checker.add_result(
                category=issue.category,
                item=issue.item,
                status=issue.status,
                message=issue.message,
                location=location_str(
                    ParagraphInfo(None, issue.paragraph_index, issue.paragraph_source,
                                  "", "", False),
                    issue.char_offset if issue.char_offset > 0 else -1
                ),
                fixable=issue.fixable,
                check_layer="text_convention",
            )

    return all_issues, stats


def default_text_conventions() -> dict:
    """代码 fallback 默认配置"""
    return {
        'bracket_mismatch': {'enabled': True},
        'quote_mismatch': {'enabled': True},
        'duplicate_punctuation': {'enabled': True},
        'extra_spaces_in_chinese': {'enabled': True},
        'consecutive_spaces': {'enabled': True},
        'leading_trailing_spaces': {'enabled': True},
        'fullwidth_space': {'enabled': True},
        'cjk_english_spacing': {'enabled': True, 'require_space': None},
        'fullwidth_halfwidth_punctuation': {'enabled': True, 'context': 'chinese'},
        'sentence_ending_punctuation': {'enabled': True},
        'ai_review': {'enabled': True},
    }
