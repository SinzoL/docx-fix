"""
文本排版检查 — 空格检查

包含：
- 中文之间多余空格（排除设计性均匀间隔）
- 连续多个空格（排除设计性均匀间隔）
- 行首/行尾空格
- 全角空格混入
- 中英文间距统计与争议标记
"""

from __future__ import annotations

import re

from scripts.checker.base import CheckResult

from .constants import CJK_SPACE_CJK_RE, MULTI_SPACE_RE, FULLWIDTH_SPACE, CJK_IDEO_RE
from .models import ParagraphInfo, TextIssue, DocumentStats
from .paragraph_iter import context_snippet, cjk_ratio, mask_urls


# ============================================================
# 设计性均匀间隔文本检测
# ============================================================

# 匹配「字 字 字 字」模式：单个CJK字 + (空格 + 单个CJK字)×至少1次
_UNIFORM_SPACED_CJK_RE = re.compile(
    r'[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]'
    r'(?:\s+[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]){1,}'
)


def is_intentional_spaced_text(text: str, max_chars: int = 15) -> bool:
    """判断一段文本是否为设计性均匀间隔的中文短文本。

    典型案例：
    - 「指 导 教 师」「日 期」「摘 要」
    - 表头中的「成 绩」「评 语」

    判定逻辑：
    1. 去除首尾空格后，文本整体匹配「CJK(空格+CJK)+」模式
    2. 去掉空格后的纯中文字符数 ≤ max_chars（默认15字）
    3. 所有间隔空格宽度一致（均匀间隔）

    Args:
        text: 待检测文本（整段或子串）
        max_chars: 去掉空格后的中文字符数上限

    Returns:
        True 表示很可能是设计性间隔，不应自动修复
    """
    stripped = text.strip()
    if not stripped:
        return False

    # 必须整段匹配「CJK(空格CJK)+」模式
    m = _UNIFORM_SPACED_CJK_RE.fullmatch(stripped)
    if not m:
        return False

    # 提取纯中文部分，检查长度
    chars_only = re.sub(r'\s+', '', stripped)
    if len(chars_only) > max_chars:
        return False

    # 至少2个中文字符才算「间隔」
    if len(chars_only) < 2:
        return False

    # 检查所有间隔宽度是否一致
    gaps = re.findall(r'\s+', stripped)
    if gaps and len(set(len(g) for g in gaps)) == 1:
        return True

    return False


# ============================================================
# 中文之间多余空格
# ============================================================

def check_extra_spaces_in_chinese(
    para_info: ParagraphInfo,
    text: str,
) -> list[TextIssue]:
    """检查中文之间多余空格（排除设计性均匀间隔文本）"""
    # 如果整段是设计性均匀间隔，直接跳过
    if is_intentional_spaced_text(text):
        return []

    issues = []

    for m in CJK_SPACE_CJK_RE.finditer(text):
        pos = m.start(2)
        issues.append(TextIssue(
            rule="extra_spaces_in_chinese",
            category="通用·空格",
            item="中文之间多余空格",
            status=CheckResult.FAIL,
            message=f"中文字符之间不应有空格：'{m.group()}'",
            paragraph_index=para_info.index,
            paragraph_source=para_info.source,
            char_offset=pos,
            context=context_snippet(text, pos),
            fixable=True,
        ))

    return issues


# ============================================================
# 连续多个空格
# ============================================================

def check_consecutive_spaces(
    para_info: ParagraphInfo,
    text: str,
) -> list[TextIssue]:
    """检查连续多个空格（排除设计性均匀间隔文本）"""
    # 如果整段是设计性均匀间隔，直接跳过
    if is_intentional_spaced_text(text):
        return []

    issues = []

    for m in MULTI_SPACE_RE.finditer(text):
        pos = m.start()
        count = len(m.group())
        issues.append(TextIssue(
            rule="consecutive_spaces",
            category="通用·空格",
            item="连续多个空格",
            status=CheckResult.WARN,
            message=f"连续 {count} 个空格",
            paragraph_index=para_info.index,
            paragraph_source=para_info.source,
            char_offset=pos,
            context=context_snippet(text, pos),
            fixable=True,
        ))

    return issues


# ============================================================
# 行首/行尾空格
# ============================================================

def check_leading_trailing_spaces(
    para_info: ParagraphInfo,
    text: str,
) -> list[TextIssue]:
    """检查行首/行尾空格（排除 XML 首行缩进控制的段落）"""
    issues = []

    if text != text.lstrip(' ') and not para_info.has_xml_indent:
        leading = len(text) - len(text.lstrip(' '))
        issues.append(TextIssue(
            rule="leading_trailing_spaces",
            category="通用·空格",
            item="行首空格",
            status=CheckResult.WARN,
            message=f"段落开头有 {leading} 个空格",
            paragraph_index=para_info.index,
            paragraph_source=para_info.source,
            char_offset=0,
            fixable=True,
        ))

    if text != text.rstrip(' '):
        trailing = len(text) - len(text.rstrip(' '))
        issues.append(TextIssue(
            rule="leading_trailing_spaces",
            category="通用·空格",
            item="行尾空格",
            status=CheckResult.WARN,
            message=f"段落末尾有 {trailing} 个空格",
            paragraph_index=para_info.index,
            paragraph_source=para_info.source,
            char_offset=len(text) - trailing,
            fixable=True,
        ))

    return issues


# ============================================================
# 全角空格混入
# ============================================================

def check_fullwidth_space(
    para_info: ParagraphInfo,
    text: str,
) -> list[TextIssue]:
    """检查全角空格混入"""
    issues = []

    for i, ch in enumerate(text):
        if ch == FULLWIDTH_SPACE:
            issues.append(TextIssue(
                rule="fullwidth_space",
                category="通用·空格",
                item="全角空格",
                status=CheckResult.WARN,
                message="正文中出现全角空格（U+3000）",
                paragraph_index=para_info.index,
                paragraph_source=para_info.source,
                char_offset=i,
                context=context_snippet(text, i),
                fixable=True,
            ))

    return issues


# ============================================================
# 中英文间距统计
# ============================================================

def count_cjk_english_spacing(text: str) -> tuple[int, int]:
    """统计中英文交界处有空格和无空格的数量"""
    spaced = 0
    unspaced = 0

    for i in range(1, len(text)):
        prev_ch = text[i - 1]
        curr_ch = text[i]

        prev_cjk = bool(CJK_IDEO_RE.match(prev_ch))
        curr_cjk = bool(CJK_IDEO_RE.match(curr_ch))
        prev_latin = prev_ch.isascii() and prev_ch.isalpha()
        curr_latin = curr_ch.isascii() and curr_ch.isalpha()

        if (prev_cjk and curr_latin) or (prev_latin and curr_cjk):
            unspaced += 1
        elif prev_cjk and curr_ch == ' ':
            if i + 1 < len(text) and text[i + 1].isascii() and text[i + 1].isalpha():
                spaced += 1
        elif prev_latin and curr_ch == ' ':
            if i + 1 < len(text) and CJK_IDEO_RE.match(text[i + 1]):
                spaced += 1

    return spaced, unspaced


def mark_cjk_spacing_disputes(
    paragraphs: list[ParagraphInfo],
    all_issues: list[TextIssue],
    stats: DocumentStats,
    tc_rules: dict,
) -> None:
    """标记中英文间距不一致的争议项"""
    total = stats.cjk_spaced_count + stats.cjk_unspaced_count
    if total == 0:
        return

    majority_spaced = stats.cjk_spaced_count >= stats.cjk_unspaced_count
    require_space = tc_rules.get('cjk_english_spacing', {}).get('require_space')

    if require_space is True:
        majority_spaced = True
    elif require_space is False:
        majority_spaced = False

    for para_info in paragraphs:
        if cjk_ratio(para_info.text) < 0.1:
            continue
        text = mask_urls(para_info.text)

        for i in range(1, len(text)):
            prev_ch = text[i - 1]
            curr_ch = text[i]

            prev_cjk = bool(CJK_IDEO_RE.match(prev_ch))
            curr_cjk = bool(CJK_IDEO_RE.match(curr_ch))
            prev_latin = prev_ch.isascii() and prev_ch.isalpha()
            curr_latin = curr_ch.isascii() and curr_ch.isalpha()

            if majority_spaced:
                if (prev_cjk and curr_latin) or (prev_latin and curr_cjk):
                    all_issues.append(TextIssue(
                        rule="cjk_english_spacing",
                        category="通用·全半角",
                        item="中英文间距不一致",
                        status=CheckResult.WARN,
                        message=f"中英文之间缺少空格（文档中 {stats.cjk_spaced_count}/{total} 处有空格）",
                        paragraph_index=para_info.index,
                        paragraph_source=para_info.source,
                        char_offset=i,
                        context=context_snippet(text, i),
                        fixable=True,
                        is_disputed=True,
                    ))
            else:
                if prev_cjk and curr_ch == ' ':
                    if i + 1 < len(text) and text[i + 1].isascii() and text[i + 1].isalpha():
                        all_issues.append(TextIssue(
                            rule="cjk_english_spacing",
                            category="通用·全半角",
                            item="中英文间距不一致",
                            status=CheckResult.WARN,
                            message=f"中英文之间多余的空格（文档中 {stats.cjk_unspaced_count}/{total} 处无空格）",
                            paragraph_index=para_info.index,
                            paragraph_source=para_info.source,
                            char_offset=i,
                            context=context_snippet(text, i),
                            fixable=True,
                            is_disputed=True,
                        ))
