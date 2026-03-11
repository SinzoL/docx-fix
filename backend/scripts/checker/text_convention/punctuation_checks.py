"""
文本排版检查 — 标点检查

包含：
- 括号不对称检查
- 引号不匹配检查
- 连续标点检查
- 半角标点混用检查（争议项）
- 句末标点缺失检查（争议项）
"""

from __future__ import annotations

from scripts.checker.base import CheckResult

from .constants import (
    OPEN_BRACKETS, CLOSE_BRACKETS, BRACKET_PAIRS,
    DUPLICATE_PUNCT_RE, EN_PUNCT_IN_CN, CJK_IDEO_RE,
)
from .models import ParagraphInfo, TextIssue
from .paragraph_iter import context_snippet, cjk_ratio


# ============================================================
# 括号不对称
# ============================================================

def check_bracket_mismatch(
    para_info: ParagraphInfo,
    text: str,
    next_para_start: str,
) -> list[TextIssue]:
    """检查括号不对称（段落级 + 相邻段落宽松匹配）"""
    issues = []
    stack: list[tuple[str, int]] = []

    for i, ch in enumerate(text):
        if ch in OPEN_BRACKETS:
            stack.append((ch, i))
        elif ch in CLOSE_BRACKETS:
            expected_open = BRACKET_PAIRS.get(ch)
            if stack and stack[-1][0] == expected_open:
                stack.pop()
            else:
                issues.append(TextIssue(
                    rule="bracket_mismatch",
                    category="通用·标点",
                    item="括号不对称",
                    status=CheckResult.FAIL,
                    message=f"多余的右括号 '{ch}'",
                    paragraph_index=para_info.index,
                    paragraph_source=para_info.source,
                    char_offset=i,
                    context=context_snippet(text, i),
                    fixable=False,
                ))

    for bracket, pos in stack:
        expected_close = BRACKET_PAIRS.get(bracket, '')
        if expected_close and expected_close in next_para_start:
            continue
        issues.append(TextIssue(
            rule="bracket_mismatch",
            category="通用·标点",
            item="括号不对称",
            status=CheckResult.FAIL,
            message=f"未闭合的左括号 '{bracket}'",
            paragraph_index=para_info.index,
            paragraph_source=para_info.source,
            char_offset=pos,
            context=context_snippet(text, pos),
            fixable=False,
        ))

    return issues


# ============================================================
# 引号不匹配
# ============================================================

def check_quote_mismatch(
    para_info: ParagraphInfo,
    text: str,
) -> list[TextIssue]:
    """检查引号不匹配"""
    issues = []

    open_double = text.count('\u201c')
    close_double = text.count('\u201d')
    if open_double != close_double:
        issues.append(TextIssue(
            rule="quote_mismatch",
            category="通用·标点",
            item="引号不匹配",
            status=CheckResult.WARN,
            message=f"中文双引号不匹配：左引号 {open_double} 个，右引号 {close_double} 个",
            paragraph_index=para_info.index,
            paragraph_source=para_info.source,
            fixable=False,
        ))

    open_single = text.count('\u2018')
    close_single = text.count('\u2019')
    if open_single != close_single:
        issues.append(TextIssue(
            rule="quote_mismatch",
            category="通用·标点",
            item="引号不匹配",
            status=CheckResult.WARN,
            message=f"中文单引号不匹配：左引号 {open_single} 个，右引号 {close_single} 个",
            paragraph_index=para_info.index,
            paragraph_source=para_info.source,
            fixable=False,
        ))

    return issues


# ============================================================
# 连续标点
# ============================================================

def check_duplicate_punctuation(
    para_info: ParagraphInfo,
    text: str,
) -> list[TextIssue]:
    """检查连续标点。

    报告：。。 ，， 、、 ；； ：： .. (非省略号)
    不报告：！！ ？？ …… 单个…  ...
    """
    issues = []

    for m in DUPLICATE_PUNCT_RE.finditer(text):
        matched = m.group()
        pos = m.start()
        issues.append(TextIssue(
            rule="duplicate_punctuation",
            category="通用·标点",
            item="连续标点",
            status=CheckResult.FAIL,
            message=f"连续标点 '{matched}'",
            paragraph_index=para_info.index,
            paragraph_source=para_info.source,
            char_offset=pos,
            context=context_snippet(text, pos),
            fixable=True,
        ))

    return issues


# ============================================================
# 半角标点混用（争议项）
# ============================================================

def _is_dot_in_special_context(text: str, pos: int) -> bool:
    """判断 pos 位置的 '.' 是否处于特殊语境"""
    prev_ch = text[pos - 1] if pos > 0 else ''
    next_ch = text[pos + 1] if pos + 1 < len(text) else ''

    if next_ch.isascii() and next_ch.isalpha():
        return True
    if prev_ch.isascii() and (prev_ch.isalpha() or prev_ch.isdigit()):
        return True
    if prev_ch.isdigit() and next_ch.isdigit():
        return True
    if prev_ch.isdigit() and (next_ch == ' ' or next_ch == ''):
        return True
    return False


def _is_punct_in_special_context(text: str, pos: int, ch: str) -> bool:
    """判断半角标点是否处于特殊语境（不应替换为全角）"""
    prev_ch = text[pos - 1] if pos > 0 else ''
    next_ch = text[pos + 1] if pos + 1 < len(text) else ''

    if ch in ',;:':
        prev_is_ascii = prev_ch.isascii() and (prev_ch.isalpha() or prev_ch.isdigit())
        next_is_ascii = next_ch.isascii() and (next_ch.isalpha() or next_ch == ' ')
        if prev_is_ascii and next_is_ascii:
            return True

    return False


def check_halfwidth_punctuation_in_chinese(
    para_info: ParagraphInfo,
    text: str,
) -> list[TextIssue]:
    """检查中文段落中的半角标点（争议项）"""
    issues = []

    for i, ch in enumerate(text):
        if ch not in EN_PUNCT_IN_CN:
            continue

        if ch == '.' and _is_dot_in_special_context(text, i):
            continue
        if ch != '.' and _is_punct_in_special_context(text, i, ch):
            continue

        prev_ch = text[i - 1] if i > 0 else ''
        next_ch = text[i + 1] if i + 1 < len(text) else ''
        if CJK_IDEO_RE.match(prev_ch) or CJK_IDEO_RE.match(next_ch):
            issues.append(TextIssue(
                rule="fullwidth_halfwidth_punctuation",
                category="通用·全半角",
                item="全半角标点混用",
                status=CheckResult.WARN,
                message=f"中文语境中出现半角标点 '{ch}'",
                paragraph_index=para_info.index,
                paragraph_source=para_info.source,
                char_offset=i,
                context=context_snippet(text, i),
                fixable=True,
                is_disputed=True,
            ))

    return issues


# ============================================================
# 句末标点缺失（争议项）
# ============================================================

def check_sentence_ending(
    para_info: ParagraphInfo,
    text: str,
) -> list[TextIssue]:
    """检查句末标点缺失（争议项）"""
    issues = []
    stripped = text.strip()
    if not stripped:
        return issues

    last_char = stripped[-1]
    if last_char in '。！？…—）】》\u201d\u2019.!?)]}':
        return issues
    style_lower = para_info.style_name.lower()
    if 'heading' in style_lower or '标题' in para_info.style_name or '目录' in para_info.style_name:
        return issues
    if cjk_ratio(stripped) < 0.1:
        return issues
    if len(stripped) < 10:
        return issues

    issues.append(TextIssue(
        rule="sentence_ending_punctuation",
        category="通用·标点",
        item="句末标点缺失",
        status=CheckResult.WARN,
        message=f"段落末尾缺少句号，末字符 '{last_char}'",
        paragraph_index=para_info.index,
        paragraph_source=para_info.source,
        char_offset=len(stripped) - 1,
        context=context_snippet(stripped, len(stripped) - 1),
        fixable=False,
        is_disputed=True,
    ))

    return issues
