"""
OOXML 属性解析器

实现完整的属性解析优先级链：
Run 直接格式 → 段落样式 rPr → basedOn 链 → docDefaults → Word 内置默认值

每个解析结果都包含属性值和来源信息，支持在检查消息中融入来源标注。
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional, Union

from scripts.checker.base import NSMAP, W


class PropertySource(Enum):
    """属性值的来源层级"""
    RUN_DIRECT = "run_direct"       # Run 直接格式（用户手动修改）
    PARAGRAPH_STYLE = "para_style"  # 段落样式 rPr
    BASED_ON = "based_on"           # basedOn 链继承
    DOC_DEFAULTS = "doc_defaults"   # docDefaults
    BUILTIN = "builtin"             # Word 内置默认值


@dataclass
class ResolvedProperty:
    """一个属性的解析结果"""
    value: Union[str, int, float, bool]
    source: PropertySource
    source_style: Optional[str] = None  # 来源样式名（如来自样式链时有值）


class PropertyResolver:
    """OOXML 属性解析器

    封装完整 5 层优先级链解析逻辑，返回 (value, source) 支持来源标注。
    """

    MAX_BASED_ON_DEPTH = 10

    def __init__(self, doc):
        """
        Args:
            doc: python-docx Document 对象
        """
        self.doc = doc
        self._doc_defaults_rPr = {}  # {attr: value}
        self._doc_defaults_pPr = {}
        self._style_cache = {}       # style_id → {attr: ResolvedProperty}
        self._style_map = {}         # style_id → style 对象

        # 构建 style_id → style 映射
        for s in self.doc.styles:
            if hasattr(s, 'style_id') and s.style_id:
                self._style_map[s.style_id] = s

        # 解析 docDefaults
        self._parse_doc_defaults()

    def _parse_doc_defaults(self):
        """从 w:docDefaults 解析默认属性"""
        styles_el = self.doc.styles.element
        doc_defaults = styles_el.find('w:docDefaults', NSMAP)
        if doc_defaults is None:
            return

        # rPrDefault
        rPr_default = doc_defaults.find('w:rPrDefault', NSMAP)
        if rPr_default is not None:
            rPr = rPr_default.find('w:rPr', NSMAP)
            if rPr is not None:
                self._doc_defaults_rPr = self._extract_rpr_attrs(rPr)

        # pPrDefault
        pPr_default = doc_defaults.find('w:pPrDefault', NSMAP)
        if pPr_default is not None:
            pPr = pPr_default.find('w:pPr', NSMAP)
            if pPr is not None:
                self._doc_defaults_pPr = self._extract_ppr_attrs(pPr)

    def _extract_rpr_attrs(self, rPr):
        """从 rPr XML 元素中提取属性字典"""
        attrs = {}
        if rPr is None:
            return attrs

        # 字体
        rFonts = rPr.find('w:rFonts', NSMAP)
        if rFonts is not None:
            for attr in ['ascii', 'eastAsia', 'hAnsi']:
                v = rFonts.get(f'{{{W}}}{attr}')
                if v is not None:
                    attrs[f'font_{attr}'] = v

        # 字号
        sz = rPr.find('w:sz', NSMAP)
        if sz is not None:
            val = sz.get(f'{{{W}}}val')
            if val is not None:
                attrs['fontSize_half_pt'] = int(val)

        # 加粗
        b = rPr.find('w:b', NSMAP)
        if b is not None:
            val = b.get(f'{{{W}}}val', 'true')
            attrs['bold'] = val not in ('0', 'false')

        # 斜体
        i = rPr.find('w:i', NSMAP)
        if i is not None:
            val = i.get(f'{{{W}}}val', 'true')
            attrs['italic'] = val not in ('0', 'false')

        return attrs

    def _extract_ppr_attrs(self, pPr):
        """从 pPr XML 元素中提取属性字典"""
        attrs = {}
        if pPr is None:
            return attrs

        # 对齐
        jc = pPr.find('w:jc', NSMAP)
        if jc is not None:
            attrs['alignment'] = jc.get(f'{{{W}}}val')

        # 行距
        spacing = pPr.find('w:spacing', NSMAP)
        if spacing is not None:
            for attr in ['before', 'after', 'line', 'lineRule']:
                v = spacing.get(f'{{{W}}}{attr}')
                if v is not None:
                    attrs[f'spacing_{attr}'] = v

        return attrs

    def _get_style_by_id(self, style_id):
        """根据 style_id 获取样式对象"""
        return self._style_map.get(style_id)

    def _resolve_style_rpr(self, style, depth=0, visited=None):
        """解析样式的 rPr 属性（含 basedOn 链继承）

        Args:
            style: python-docx Style 对象
            depth: 当前递归深度
            visited: 已访问的 style_id 集合（用于循环检测）

        Returns:
            {attr: (value, source_style_name)}
        """
        if visited is None:
            visited = set()

        style_id = style.style_id if hasattr(style, 'style_id') else None
        if not style_id:
            return {}

        # 循环引用检测
        if style_id in visited:
            return {}
        visited.add(style_id)

        # 深度限制
        if depth >= self.MAX_BASED_ON_DEPTH:
            return {}

        # 检查缓存（仅缓存完整解析结果，不缓存中间状态）
        if style_id in self._style_cache and depth == 0:
            return self._style_cache[style_id]

        # 提取当前样式的 rPr
        own_attrs = {}
        rPr = style.element.find('w:rPr', NSMAP)
        if rPr is not None:
            raw = self._extract_rpr_attrs(rPr)
            style_name = style.name if hasattr(style, 'name') else style_id
            for attr, val in raw.items():
                own_attrs[attr] = (val, style_name)

        # basedOn 链继承
        based_on = style.element.find('w:basedOn', NSMAP)
        if based_on is not None:
            parent_id = based_on.get(f'{{{W}}}val')
            if parent_id:
                parent_style = self._get_style_by_id(parent_id)
                if parent_style is not None:
                    parent_attrs = self._resolve_style_rpr(parent_style, depth + 1, visited)
                    # 合并：当前样式优先
                    for attr, val_info in parent_attrs.items():
                        if attr not in own_attrs:
                            own_attrs[attr] = val_info

        # 缓存顶层结果
        if depth == 0:
            self._style_cache[style_id] = own_attrs

        return own_attrs

    def resolve_style_properties(self, style):
        """解析样式的完整属性（含 basedOn 链继承）

        带缓存：同一 style_id 只解析一次。

        Args:
            style: python-docx Style 对象

        Returns:
            {attr_name: ResolvedProperty}
        """
        raw = self._resolve_style_rpr(style)
        result = {}
        for attr, (val, style_name) in raw.items():
            # 判断来源：如果 style_name 等于当前样式名则为 PARAGRAPH_STYLE，否则为 BASED_ON
            current_name = style.name if hasattr(style, 'name') else None
            if style_name == current_name:
                source = PropertySource.PARAGRAPH_STYLE
            else:
                source = PropertySource.BASED_ON
            result[attr] = ResolvedProperty(value=val, source=source, source_style=style_name)
        return result

    def resolve_run_properties(self, run, paragraph):
        """解析 Run 的所有最终生效属性

        按优先级链解析：Run 直接格式 → 段落样式 rPr → basedOn 链 → docDefaults → 内置默认

        Args:
            run: python-docx Run 对象
            paragraph: Run 所属的 Paragraph 对象

        Returns:
            {attr_name: ResolvedProperty}
        """
        result = {}

        # 第 1 层：Run 直接格式
        run_rPr = run._element.find('w:rPr', NSMAP)
        if run_rPr is not None:
            run_attrs = self._extract_rpr_attrs(run_rPr)
            for attr, val in run_attrs.items():
                result[attr] = ResolvedProperty(
                    value=val,
                    source=PropertySource.RUN_DIRECT,
                )

        # 第 2-3 层：段落样式 + basedOn 链
        if paragraph.style is not None:
            style_attrs = self._resolve_style_rpr(paragraph.style)
            for attr, (val, style_name) in style_attrs.items():
                if attr not in result:
                    current_name = paragraph.style.name if hasattr(paragraph.style, 'name') else None
                    if style_name == current_name:
                        source = PropertySource.PARAGRAPH_STYLE
                    else:
                        source = PropertySource.BASED_ON
                    result[attr] = ResolvedProperty(
                        value=val,
                        source=source,
                        source_style=style_name,
                    )

        # 第 4 层：docDefaults
        for attr, val in self._doc_defaults_rPr.items():
            if attr not in result:
                result[attr] = ResolvedProperty(
                    value=val,
                    source=PropertySource.DOC_DEFAULTS,
                )

        return result

    def format_source_message(self, prop, attr_display, actual_display, expected_display):
        """生成融入来源标注的检查消息文案

        Args:
            prop: ResolvedProperty 解析后的属性
            attr_display: 属性显示名（如 "字号"、"中文字体"）
            actual_display: 实际值的人可读形式
            expected_display: 期望值的人可读形式

        Returns:
            如: "Run 直接格式覆盖：字号当前 14pt，要求 12pt"
        """
        source_prefix = {
            PropertySource.RUN_DIRECT: "Run 直接格式覆盖",
            PropertySource.PARAGRAPH_STYLE: f"段落样式({prop.source_style or ''})",
            PropertySource.BASED_ON: f"样式继承({prop.source_style or ''})",
            PropertySource.DOC_DEFAULTS: "文档默认值(docDefaults)",
            PropertySource.BUILTIN: "Word 内置默认",
        }

        prefix = source_prefix.get(prop.source, "未知来源")
        return f"{prefix}：{attr_display}当前 {actual_display}，要求 {expected_display}"
