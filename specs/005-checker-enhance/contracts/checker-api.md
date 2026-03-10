# Contract: checker 子包接口

**Feature**: 005-checker-enhance | **Date**: 2026-03-10

## 1. checker/ 子包对外接口

### `checker/__init__.py` — 对外导出（向后兼容）

```python
"""
checker 子包入口

保持与原 checker.py 完全兼容的对外接口。
外部调用方（checker_service.py、fixer_service.py）无需修改导入路径。
"""
from checker.base import DocxChecker, CheckResult, fonts_match, Color, FONT_ALIASES, NSMAP, W

__all__ = ['DocxChecker', 'CheckResult', 'fonts_match', 'Color', 'FONT_ALIASES', 'NSMAP', 'W']
```

**兼容性保证**：以下导入在重构前后行为完全一致：

```python
# checker_service.py / fixer_service.py 现有代码
from scripts.checker import DocxChecker  # ✅ 不变
```

---

## 2. PropertyResolver 接口

### `checker/property_resolver.py`

```python
class PropertyResolver:
    """OOXML 属性解析器"""

    MAX_BASED_ON_DEPTH = 10

    def __init__(self, doc: Document) -> None:
        """
        Args:
            doc: python-docx Document 对象
        """

    def resolve_run_properties(self, run, paragraph) -> dict[str, ResolvedProperty]:
        """解析 Run 的所有最终生效属性

        按优先级链解析：Run 直接格式 → 段落样式 rPr → basedOn 链 → docDefaults → 内置默认

        Args:
            run: python-docx Run 对象
            paragraph: Run 所属的 Paragraph 对象

        Returns:
            {attr_name: ResolvedProperty(value, source, source_style)}
            attr_name 包括: font_ascii, font_eastAsia, font_hAnsi,
                           fontSize_half_pt, bold, italic,
                           alignment, spacing_line, spacing_lineRule, ...
        """

    def resolve_style_properties(self, style) -> dict[str, ResolvedProperty]:
        """解析样式的完整属性（含 basedOn 链继承）

        带缓存：同一 style_id 只解析一次。

        Args:
            style: python-docx Style 对象

        Returns:
            同 resolve_run_properties
        """

    def format_source_message(self, prop: ResolvedProperty, attr_display: str,
                              actual_display: str, expected_display: str) -> str:
        """生成融入来源标注的检查消息文案

        Args:
            prop: 解析后的属性
            attr_display: 属性显示名（如 "字号"、"中文字体"）
            actual_display: 实际值的人可读形式
            expected_display: 期望值的人可读形式

        Returns:
            如: "Run 直接格式覆盖：字号当前 14pt，要求 12pt"
            如: "样式继承(Normal)：字号当前 10pt，要求 12pt"

        Examples:
            >>> prop = ResolvedProperty(value=14, source=PropertySource.RUN_DIRECT)
            >>> resolver.format_source_message(prop, "字号", "14pt", "12pt")
            "Run 直接格式覆盖：字号当前 14pt，要求 12pt"

            >>> prop = ResolvedProperty(value="宋体", source=PropertySource.BASED_ON, source_style="Normal")
            >>> resolver.format_source_message(prop, "中文字体", "宋体", "黑体")
            "样式继承(Normal)：中文字体当前 宋体，要求 黑体"
        """
```

---

## 3. HeadingValidator 接口

### `checker/heading_validator.py`

```python
def check_heading_hierarchy(checker: DocxChecker) -> None:
    """检查文档标题层级连续性和深度限制

    作为独立函数接收 checker 实例，通过 checker.add_result() 报告结果。
    在 DocxChecker.run_all_checks() 中调用。

    检查项:
    - 标题层级跳跃（FAIL）: H1 后直接出现 H3，缺少 H2
    - 标题深度超限（WARN）: 标题层级超过 max_heading_depth
    - 无标题（PASS）: 文档无标题段落时跳过

    Args:
        checker: DocxChecker 实例，用于访问 doc、rules、add_result
    """


def check_heading_styles(checker: DocxChecker) -> None:
    """检查标题段落的样式是否正确（从 base.py 迁移）"""


def check_document_structure(checker: DocxChecker) -> None:
    """检查必要章节是否存在（从 base.py 迁移）"""
```

---

## 4. API 变更契约

### GET /api/rules — 响应扩展

```json
{
  "rules": [
    {
      "id": "default",
      "filename": "default.yaml",
      "name": "通用默认检查",
      "description": "仅检查基础格式设置",
      "is_default": true,
      "is_preset": false
    },
    {
      "id": "academic_paper",
      "filename": "academic_paper.yaml",
      "name": "通用学术论文",
      "description": "适用于一般性学术论文，覆盖中文学术论文的常见格式要求（GB/T 7713.1-2006 参考）",
      "is_default": false,
      "is_preset": true
    },
    {
      "id": "gov_document",
      "filename": "gov_document.yaml",
      "name": "国标公文 (GB/T 9704)",
      "description": "适用于党政机关公文格式（GB/T 9704-2012）",
      "is_default": false,
      "is_preset": true
    },
    {
      "id": "hit_midterm_report",
      "filename": "hit_midterm_report.yaml",
      "name": "哈工大(深圳)毕业论文中期报告",
      "description": "基于模板文件提取的格式检查规则",
      "is_default": false,
      "is_preset": false
    }
  ]
}
```

**变更点**：

| 字段 | 类型 | 变更 | 说明 |
|------|------|------|------|
| `is_preset` | `bool` | **新增** | 是否为场景化预设规则，默认 `false` |

**向后兼容**：新增字段有默认值，不影响现有客户端。

### POST /api/check — 无变更

检查接口保持不变。检查引擎增强是内部实现变化，不影响 API 契约。CheckItemResult 的 `message` 字段内容会更丰富（融入来源标注），但字段结构不变。

### CheckItemResult.message 文案风格变更

**变更前**：

```json
{
  "message": "\"第一章\" 字号=14.0磅, 要求=12.0磅"
}
```

**变更后**（增强来源标注）：

```json
{
  "message": "Run 直接格式覆盖：\"第一章\" 字号当前 14pt，要求 12pt"
}
```

或

```json
{
  "message": "样式继承(Normal)：\"第一章\" 字号当前 10pt，要求 12pt"
}
```

**注意**：这是 message 文案变化，非结构变化。前端无需代码适配。
