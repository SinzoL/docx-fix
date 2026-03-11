"""
文本排版检查 — 数据模型

包含 ParagraphInfo、TextIssue、DocumentStats 三个数据类。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ParagraphInfo:
    """段落遍历信息"""
    paragraph: object  # docx Paragraph 对象
    index: int         # 段落序号（全局从 0 开始）
    source: str        # "body" | "table" | "footnote" | "endnote"
    text: str          # 所有 Run 文本拼接
    style_name: str    # 样式名
    has_xml_indent: bool = False  # 是否有 XML 首行缩进


@dataclass
class TextIssue:
    """文本检查发现的问题"""
    rule: str               # 规则名（对应 YAML text_conventions 的 key）
    category: str           # 分类："通用·标点" / "通用·空格" / "通用·全半角"
    item: str               # 检查项名称
    status: str             # "FAIL" / "WARN"
    message: str            # 描述信息
    paragraph_index: int    # 段落序号
    paragraph_source: str   # 来源（body/table/footnote/endnote）
    char_offset: int = 0    # 字符偏移
    context: str = ""       # 上下文片段
    fixable: bool = False   # 是否可自动修复
    is_disputed: bool = False  # 是否为争议项（需 LLM 审查）


@dataclass
class DocumentStats:
    """文档级统计数据（用于 LLM 审查上下文）"""
    total_paragraphs: int = 0
    cjk_spaced_count: int = 0    # 中英交界有空格的数量
    cjk_unspaced_count: int = 0  # 中英交界无空格的数量
