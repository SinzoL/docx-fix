"""
通用文本排版习惯修复器

修复文档文本内容层面的确定性排版问题：
1. 连续标点 → 去重保留第一个
2. 中文之间多余空格 → 删除
3. 连续多个空格 → 合并为一个
4. 行首/行尾空格 → 删除
5. 全角空格 → 替换为半角

争议项（中英文间距、全半角标点、句末标点）不在此处自动修复，
需 LLM 审查确认后才操作，当前版本暂不修复争议项。

架构说明：
  本模块与 text_convention_checker.py 配套使用。
  在 fixer_service.py 中，先执行格式修复（DocxFixer），再叠加文本修复。
  修复操作直接修改 python-docx Run 对象的文本内容。
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from docx.document import Document

from scripts.checker.text_convention_checker import (
    iter_all_paragraphs,
    _cjk_ratio,
    _is_code_style,
    _default_text_conventions,
    _CJK_SPACE_CJK_RE,
    _MULTI_SPACE_RE,
    _FULLWIDTH_SPACE,
    _DUPLICATE_PUNCT_RE,
)


# ============================================================
# 数据类
# ============================================================

@dataclass
class TextFixRecord:
    """单条文本修复记录"""
    category: str       # 分类（如 "文本排版"）
    description: str    # 修复描述
    paragraph_index: int  # 段落序号
    paragraph_source: str  # 来源（body/table/footnote/endnote）


# ============================================================
# 修复函数
# ============================================================

def _fix_duplicate_punctuation(text: str) -> tuple[str, list[str]]:
    """修复连续标点 → 去重保留第一个。

    Returns:
        (修复后文本, 修复描述列表)
    """
    descriptions: list[str] = []

    def _replace(m: re.Match) -> str:
        matched = m.group()
        # 保留第一个字符
        first_char = matched[0]
        descriptions.append(f"连续标点 '{matched}' → '{first_char}'")
        return first_char

    result = _DUPLICATE_PUNCT_RE.sub(_replace, text)
    return result, descriptions


def _fix_extra_spaces_in_chinese(text: str) -> tuple[str, list[str]]:
    """修复中文之间多余空格 → 删除。

    Returns:
        (修复后文本, 修复描述列表)
    """
    descriptions: list[str] = []

    def _replace(m: re.Match) -> str:
        descriptions.append(f"删除中文之间空格 '{m.group()}'")
        return m.group(1) + m.group(3)  # CJK + CJK, 去掉中间空格

    result = _CJK_SPACE_CJK_RE.sub(_replace, text)
    return result, descriptions


def _fix_consecutive_spaces(text: str) -> tuple[str, list[str]]:
    """修复连续多个空格 → 合并为一个。

    Returns:
        (修复后文本, 修复描述列表)
    """
    descriptions: list[str] = []

    def _replace(m: re.Match) -> str:
        count = len(m.group())
        descriptions.append(f"合并 {count} 个连续空格为 1 个")
        return ' '

    result = _MULTI_SPACE_RE.sub(_replace, text)
    return result, descriptions


def _fix_leading_trailing_spaces(text: str, has_xml_indent: bool) -> tuple[str, list[str]]:
    """修复行首/行尾空格 → 删除。

    Args:
        text: 原文本
        has_xml_indent: 是否有 XML 首行缩进（有则不修复行首空格）

    Returns:
        (修复后文本, 修复描述列表)
    """
    descriptions: list[str] = []
    result = text

    # 行首空格（排除 XML 首行缩进）
    if not has_xml_indent:
        stripped = result.lstrip(' ')
        if len(stripped) < len(result):
            count = len(result) - len(stripped)
            descriptions.append(f"删除行首 {count} 个空格")
            result = stripped

    # 行尾空格
    stripped = result.rstrip(' ')
    if len(stripped) < len(result):
        count = len(result) - len(stripped)
        descriptions.append(f"删除行尾 {count} 个空格")
        result = stripped

    return result, descriptions


def _fix_fullwidth_spaces(text: str) -> tuple[str, list[str]]:
    """修复全角空格 → 替换为半角空格。

    Returns:
        (修复后文本, 修复描述列表)
    """
    count = text.count(_FULLWIDTH_SPACE)
    if count == 0:
        return text, []
    result = text.replace(_FULLWIDTH_SPACE, ' ')
    return result, [f"替换 {count} 个全角空格为半角空格"]


# ============================================================
# 段落文本修复（直接修改 Run 对象）
# ============================================================

def _apply_text_to_runs(paragraph, new_text: str) -> bool:
    """将修复后的文本回写到段落的 Run 对象中。

    策略：
    - 保留所有 Run 的格式属性
    - 将新文本按原 Run 的字符长度分配
    - 如果文本变短，最后的 Run 可能变空或被截断

    Args:
        paragraph: python-docx Paragraph 对象
        new_text: 修复后的完整文本

    Returns:
        是否成功应用
    """
    if paragraph is None:
        return False

    runs = paragraph.runs
    if not runs:
        return False

    # 检查原始文本是否匹配
    original = ''.join(r.text for r in runs)
    if original == new_text:
        return False  # 无变化

    # 将新文本分配到各 Run
    remaining = new_text

    for i, run in enumerate(runs):
        old_len = len(run.text)
        if i == len(runs) - 1:
            # 最后一个 Run：放入所有剩余文本
            run.text = remaining
        else:
            # 非最后 Run：按原长度分配（如果剩余文本够长）
            if len(remaining) >= old_len:
                run.text = remaining[:old_len]
                remaining = remaining[old_len:]
            else:
                # 剩余文本不够，全部放入当前 Run，后续 Run 清空
                run.text = remaining
                remaining = ''

    return True


# ============================================================
# 来源标签
# ============================================================

_SOURCE_LABELS = {
    "body": "主体", "table": "表格",
    "footnote": "脚注", "endnote": "尾注",
}


# ============================================================
# 主函数
# ============================================================

def run_text_convention_fixes(
    doc: Document,
    rules: dict,
) -> list[TextFixRecord]:
    """执行所有文本排版习惯修复。

    仅修复确定性问题（不修复争议项）。

    Args:
        doc: python-docx Document 对象（已经是 _fixed 副本）
        rules: YAML 规则字典

    Returns:
        修复记录列表
    """
    tc_rules = rules.get('text_conventions', {})
    if not tc_rules:
        tc_rules = _default_text_conventions()

    all_records: list[TextFixRecord] = []

    # 收集所有段落
    paragraphs = list(iter_all_paragraphs(doc))

    for para_info in paragraphs:
        text = para_info.text
        style_name = para_info.style_name
        is_code = _is_code_style(style_name)
        cjk_r = _cjk_ratio(text)
        is_cjk_para = cjk_r >= 0.1

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

        # 跳过脚注/尾注段落（paragraph 为 None，无法修改 Run）
        if para_info.paragraph is None:
            continue

        current_text = text
        para_descriptions: list[str] = []

        # 1. 连续标点修复
        if tc_rules.get('duplicate_punctuation', {}).get('enabled', True):
            fixed, descs = _fix_duplicate_punctuation(current_text)
            if descs:
                current_text = fixed
                para_descriptions.extend(descs)

        if not is_code:
            # 2. 中文之间多余空格（仅 CJK 段落）
            if is_cjk_para and tc_rules.get('extra_spaces_in_chinese', {}).get('enabled', True):
                fixed, descs = _fix_extra_spaces_in_chinese(current_text)
                if descs:
                    current_text = fixed
                    para_descriptions.extend(descs)

            # 3. 全角空格 → 半角（在合并空格之前处理）
            if tc_rules.get('fullwidth_space', {}).get('enabled', True):
                fixed, descs = _fix_fullwidth_spaces(current_text)
                if descs:
                    current_text = fixed
                    para_descriptions.extend(descs)

            # 4. 连续多个空格 → 合并
            if tc_rules.get('consecutive_spaces', {}).get('enabled', True):
                fixed, descs = _fix_consecutive_spaces(current_text)
                if descs:
                    current_text = fixed
                    para_descriptions.extend(descs)

            # 5. 行首/行尾空格（最后处理）
            if tc_rules.get('leading_trailing_spaces', {}).get('enabled', True):
                fixed, descs = _fix_leading_trailing_spaces(
                    current_text, para_info.has_xml_indent
                )
                if descs:
                    current_text = fixed
                    para_descriptions.extend(descs)

        # 应用修复
        if para_descriptions and current_text != text:
            success = _apply_text_to_runs(para_info.paragraph, current_text)
            if success:
                source_label = _SOURCE_LABELS.get(
                    para_info.paragraph_source
                    if hasattr(para_info, 'paragraph_source')
                    else para_info.source,
                    para_info.source,
                )

                for desc in para_descriptions:
                    all_records.append(TextFixRecord(
                        category="文本排版",
                        description=f"段落{para_info.index + 1} [{source_label}] {desc}",
                        paragraph_index=para_info.index,
                        paragraph_source=para_info.source,
                    ))

    return all_records
