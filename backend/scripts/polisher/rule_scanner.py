"""
RuleScanner — 规则扫描器

复用 text_convention_checker 的检测逻辑（标点/空格/全半角），
将检测到的确定性文本问题转换为 PolishSuggestion 格式，
使其能在润色预览中以逐条接受/拒绝的方式展示。

不依赖 checker 基础设施（不调用 add_result），直接使用底层函数。
"""

from __future__ import annotations

import re
import logging
from dataclasses import dataclass
from typing import Optional

from docx import Document

from scripts.checker.text_convention_checker import (
    iter_all_paragraphs,
    ParagraphInfo,
    TextIssue,
    _cjk_ratio,
    _is_code_style,
    _mask_urls,
    _default_text_conventions,
    _check_bracket_mismatch,
    _check_duplicate_punctuation,
    _check_extra_spaces_in_chinese,
    _check_consecutive_spaces,
    _check_leading_trailing_spaces,
    _check_fullwidth_space,
    _check_halfwidth_punctuation_in_chinese,
    _check_sentence_ending,
    _is_dot_in_special_context,
    _is_punct_in_special_context,
    _DUPLICATE_PUNCT_RE,
    _CJK_SPACE_CJK_RE,
    _MULTI_SPACE_RE,
    _FULLWIDTH_SPACE,
)
from scripts.polisher.text_extractor import ParagraphSnapshot

logger = logging.getLogger(__name__)

# 规则 → 润色修改类型映射
_RULE_TO_CHANGE_TYPE = {
    "bracket_mismatch": "rule_punctuation",
    "quote_mismatch": "rule_punctuation",
    "duplicate_punctuation": "rule_punctuation",
    "extra_spaces_in_chinese": "rule_space",
    "consecutive_spaces": "rule_space",
    "leading_trailing_spaces": "rule_space",
    "fullwidth_space": "rule_fullwidth",
    "fullwidth_halfwidth_punctuation": "rule_fullwidth",
    "sentence_ending_punctuation": "rule_punctuation",
}


def _apply_fix_to_text(rule: str, text: str, issue: TextIssue) -> Optional[str]:
    """对单条检测问题生成修复后的文本。

    仅处理可自动修复（fixable=True）的确定性问题。

    Args:
        rule: 规则名
        text: 原始段落文本
        issue: 检测到的问题

    Returns:
        修复后的段落文本，如果无法修复则返回 None
    """
    if not issue.fixable:
        return None

    if rule == "duplicate_punctuation":
        # 连续标点 → 保留第一个
        return _DUPLICATE_PUNCT_RE.sub(lambda m: m.group()[0], text)

    elif rule == "extra_spaces_in_chinese":
        # 中文之间多余空格 → 删除
        return _CJK_SPACE_CJK_RE.sub(lambda m: m.group(1) + m.group(3), text)

    elif rule == "consecutive_spaces":
        # 连续多个空格 → 合并为一个
        return _MULTI_SPACE_RE.sub(' ', text)

    elif rule == "leading_trailing_spaces":
        # 行首/行尾空格 → 删除
        result = text
        if "行首" in issue.message:
            result = result.lstrip(' ')
        if "行尾" in issue.message or "末尾" in issue.message:
            result = result.rstrip(' ')
        return result

    elif rule == "fullwidth_space":
        # 全角空格 → 半角
        return text.replace(_FULLWIDTH_SPACE, ' ')

    elif rule == "fullwidth_halfwidth_punctuation":
        # 半角标点 → 全角（在中文语境中）
        pos = issue.char_offset
        if 0 <= pos < len(text):
            ch = text[pos]

            # 安全保护：'.' 在特殊语境中不替换（文件扩展名/小数/版本号/缩写等）
            if ch == '.' and _is_dot_in_special_context(text, pos):
                return None

            # 安全保护：其他标点在特殊语境中不替换（英文短语中的逗号等）
            if ch != '.' and _is_punct_in_special_context(text, pos, ch):
                return None

            # 半角→全角映射
            hw_map = {
                ',': '，', '.': '。', ';': '；', ':': '：',
                '!': '！', '?': '？', '(': '（', ')': '）',
            }
            replacement = hw_map.get(ch)
            if replacement:
                return text[:pos] + replacement + text[pos + 1:]
        return None

    return None


class RuleScanner:
    """规则扫描器 — 对文档进行规则检测并生成润色建议"""

    def scan_document(
        self,
        doc: Document,
        snapshots: list[ParagraphSnapshot],
    ) -> list[dict]:
        """扫描文档，将规则检出的文本问题转换为润色建议。

        仅处理可自动修复的确定性问题（非争议项），
        将每个问题转换为与 PolishSuggestion 相同格式的 dict，
        以便与 LLM 润色结果合并展示。

        Args:
            doc: python-docx Document 对象
            snapshots: TextExtractor 提取的段落快照列表

        Returns:
            建议列表（dict 格式，与 PolishEngine._suggestion_to_dict 输出兼容）
        """
        tc_rules = _default_text_conventions()
        suggestions: list[dict] = []

        # 收集所有段落（使用 text_convention_checker 的遍历器）
        paragraphs = list(iter_all_paragraphs(doc))

        # 按段落索引分组 issues
        para_issues: dict[int, list[TextIssue]] = {}

        for i, para_info in enumerate(paragraphs):
            text = para_info.text
            style_name = para_info.style_name
            is_code = _is_code_style(style_name)
            cjk_r = _cjk_ratio(text)
            is_cjk_para = cjk_r >= 0.1
            masked_text = _mask_urls(text)

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

            issues: list[TextIssue] = []

            # 确定性检查（仅收集可自动修复的）

            # 1. 连续标点
            if tc_rules.get('duplicate_punctuation', {}).get('enabled', True):
                issues.extend(_check_duplicate_punctuation(para_info, masked_text))

            if not is_code:
                # 2. 中文之间多余空格
                if is_cjk_para and tc_rules.get('extra_spaces_in_chinese', {}).get('enabled', True):
                    issues.extend(_check_extra_spaces_in_chinese(para_info, masked_text))

                # 3. 连续多个空格
                if tc_rules.get('consecutive_spaces', {}).get('enabled', True):
                    issues.extend(_check_consecutive_spaces(para_info, masked_text))

                # 4. 行首/行尾空格
                if tc_rules.get('leading_trailing_spaces', {}).get('enabled', True):
                    issues.extend(_check_leading_trailing_spaces(para_info, text))

                # 5. 全角空格
                if tc_rules.get('fullwidth_space', {}).get('enabled', True):
                    issues.extend(_check_fullwidth_space(para_info, text))

                # 6. 全半角标点混用（争议项，但这里也生成建议供用户选择）
                if is_cjk_para and tc_rules.get('fullwidth_halfwidth_punctuation', {}).get('enabled', True):
                    issues.extend(_check_halfwidth_punctuation_in_chinese(para_info, masked_text))

            # 过滤：仅保留可自动修复的
            fixable_issues = [iss for iss in issues if iss.fixable]
            if fixable_issues:
                para_issues[para_info.index] = fixable_issues

        # 将每个段落的 issues 合并为一条建议（段落级粒度）
        for para_idx, issues in para_issues.items():
            # 找到对应的段落文本
            para_text = None
            para_source = "body"
            for pi in paragraphs:
                if pi.index == para_idx:
                    para_text = pi.text
                    para_source = pi.source
                    break

            if para_text is None:
                continue

            # 逐条应用修复，生成修复后文本
            fixed_text = para_text
            change_details = []

            # 按类型分组，同类型的 issues 只做一次修复
            processed_rules: set[str] = set()
            for issue in issues:
                if issue.rule in processed_rules:
                    continue

                new_text = _apply_fix_to_text(issue.rule, fixed_text, issue)
                if new_text and new_text != fixed_text:
                    change_type = _RULE_TO_CHANGE_TYPE.get(issue.rule, "rule_punctuation")
                    change_details.append({
                        "type": change_type,
                        "original": issue.context if issue.context else "",
                        "revised": "",  # 将在修复后对比中体现
                        "explanation": issue.message,
                    })
                    fixed_text = new_text
                    processed_rules.add(issue.rule)

            # 如果有实际修改，生成建议
            if fixed_text != para_text and change_details:
                # 确定主要修改类型
                main_type = change_details[0]["type"]
                explanation = "; ".join(cd["explanation"] for cd in change_details)

                # 找到 snapshots 中对应的段落索引（可能不同于 paragraph_info.index）
                snapshot_idx = self._find_snapshot_index(para_idx, snapshots)

                suggestions.append({
                    "paragraph_index": snapshot_idx if snapshot_idx >= 0 else para_idx,
                    "original_text": para_text,
                    "polished_text": fixed_text,
                    "change_type": main_type,
                    "changes": change_details,
                    "explanation": explanation,
                    "confidence": 0.95,  # 规则检出的置信度很高
                    "semantic_warning": False,
                    "semantic_warning_text": None,
                    "source": "rule",  # 标记来源为规则引擎
                })

        logger.info(f"规则扫描完成：检出 {len(suggestions)} 条可修复建议")
        return suggestions

    @staticmethod
    def _find_snapshot_index(
        para_idx: int,
        snapshots: list[ParagraphSnapshot],
    ) -> int:
        """将 text_convention_checker 的段落索引映射到 TextExtractor 的快照索引。

        text_convention_checker 遍历 body + table + footnote + endnote，
        而 TextExtractor 只遍历 doc.paragraphs（body）。
        这里做最佳匹配：如果索引在 snapshots 范围内则直接使用，否则返回 -1。
        """
        if 0 <= para_idx < len(snapshots):
            return para_idx
        return -1
