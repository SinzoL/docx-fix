# Research: 检查引擎增强

**Feature**: 005-checker-enhance | **Date**: 2026-03-10

## Research Topic 1: OOXML 属性解析优先级链实现方案

### Question

如何在现有 `_get_style_xml_info()` 基础上，实现完整的 OOXML 属性解析优先级链（Run 直接格式 → 段落样式 rPr → basedOn 链 → docDefaults → Word 内置默认值），并正确区分"显式设置"和"继承值"？

### Research

**OOXML 属性优先级（参考 ISO/IEC 29500-1:2016, §17.7.2）**：

1. **Run 直接格式**（`w:r/w:rPr`）— 用户手动修改导致的覆盖
2. **段落样式的 Run 属性**（段落样式 → `w:style/w:rPr`）
3. **basedOn 链继承**（递归向上查找父样式的属性）
4. **docDefaults**（`w:docDefaults/w:rPrDefault/w:rPr` 和 `w:pPrDefault/w:pPr`）
5. **Word 内置默认值**（如字号 10pt、字体 Calibri）

**当前代码分析**：

- `_get_style_xml_info()` 已实现 步骤 2+3（读取样式的 pPr/rPr + basedOn 递归）
- `check_paragraph_formatting()` 直接读取 `run.font.size` 和 `run.font.name`，python-docx 会返回 Run 直接格式值（如果有）或 `None`（如果继承）
- **问题**：当 `run.font.size is None` 时，当前代码跳过检查，但实际上应该沿样式链找到继承值进行比对
- **缺失**：步骤 4（docDefaults）完全未实现

**实现方案**：

新增 `PropertyResolver` 类，职责是给定一个 Run/段落，返回其所有属性的"最终生效值"及"来源标注"：

```python
class PropertyResolver:
    """OOXML 属性解析器 — 实现完整优先级链"""

    MAX_BASED_ON_DEPTH = 10  # 防止循环引用

    def __init__(self, doc: Document):
        self.doc = doc
        self._doc_defaults = self._parse_doc_defaults()
        self._style_cache = {}  # style_id → resolved_props

    def resolve_run_properties(self, run, paragraph) -> dict:
        """解析 Run 的最终生效属性值，返回 {attr: (value, source)} 字典"""
        result = {}
        # Step 1: Word 内置默认值
        result.update(self._get_builtin_defaults())
        # Step 2: docDefaults
        result.update(self._doc_defaults)
        # Step 3: basedOn 链 + 段落样式 rPr
        style = paragraph.style
        if style:
            result.update(self._resolve_style_chain(style))
        # Step 4: Run 直接格式（最高优先级）
        result.update(self._get_run_direct_formatting(run))
        return result
```

### Decision

采用 **PropertyResolver 类** 封装属性解析链，独立模块文件 `property_resolver.py`。

### Rationale

1. 将属性解析逻辑从 `DocxChecker` 中分离，符合单一职责原则
2. 缓存机制（style_id → resolved_props）避免重复遍历 basedOn 链
3. 返回 `(value, source)` 元组，使上层检查代码可直接融入"来源标注"到 message 文案
4. 循环引用检测通过 `visited_set` 实现，深度限制通过 `MAX_BASED_ON_DEPTH` 控制

### Alternatives Considered

| 方案 | 评价 |
|------|------|
| 直接在现有 `_get_style_xml_info()` 中添加 docDefaults 和 Run 直接格式读取 | 方法职责膨胀，且无法返回"来源"信息 |
| 使用 python-docx 内部的 CT_RPr element 层级遍历 | python-docx 的内部 API 不稳定，且不暴露 docDefaults |

---

## Research Topic 2: checker.py 子包拆分方案

### Question

如何将 1323 行的 `checker.py` 拆分为 `checker/` 子包，在保持对外接口不变的前提下，合理划分模块边界？

### Research

**当前 checker.py 结构分析**（30 个函数/方法）：

| 分组 | 方法 | 行数（约） |
|------|------|-----------|
| 公共工具 | `fonts_match`, `Color`, `CheckResult`, `__init__`, `add_result` | 1-100 |
| 页面/页眉页脚 | `check_page_setup`, `check_header_footer` | 100-190 |
| 样式解析 | `_get_style_xml_info`, `_get_parent_style` | 190-270 |
| 样式检查 | `check_style_definitions` | 270-350 |
| 标题/结构相关 | `_get_para_outline_level`, `check_heading_styles`, `check_document_structure` | 350-445 |
| TOC/封面 | `check_toc`, `_is_cover_page_paragraph` | 445-500 |
| 段落格式检查 | `check_paragraph_formatting` | 500-580 |
| 编号系统 | `check_heading_numbering` ~ `check_heading_numbering_indent`（7个方法） | 580-1240 |
| 特殊检查 | `check_template_instructions`, `check_font_consistency`, `check_figure_table_captions` | 890-1140 |
| 入口 | `run_all_checks`, `print_report`, `main` | 1240-1323 |

**拆分方案**：

```text
checker/
├── __init__.py             # re-export DocxChecker, CheckResult, fonts_match
├── base.py                 # DocxChecker 类（骨架）+ CheckResult + Color + fonts_match + FONT_ALIASES
│                           # __init__, add_result, run_all_checks, print_report, main
│                           # check_page_setup, check_header_footer, check_toc
│                           # _is_cover_page_paragraph, _get_para_outline_level
├── property_resolver.py    # [新增] PropertyResolver 类 — 属性解析链
├── style_checker.py        # _get_style_xml_info, _get_parent_style, check_style_definitions
│                           # check_paragraph_formatting, check_font_consistency
│                           # check_template_instructions, check_figure_table_captions
├── heading_validator.py    # [新增] check_heading_hierarchy（标题层级树验证）
│                           # check_heading_styles, check_document_structure
└── numbering_checker.py    # check_heading_numbering, check_heading_lvl_text
                            # check_heading_numid_override, check_shared_abstract_num
                            # check_heading_style_and_manual_numbering
                            # check_heading_numbering_indent
                            # _get_numbering_part, _get_heading_abstract_num_id
```

**对外接口兼容**：`checker/__init__.py` 使用以下导出：

```python
from checker.base import DocxChecker, CheckResult, fonts_match
__all__ = ['DocxChecker', 'CheckResult', 'fonts_match']
```

所有外部调用方（`checker_service.py`、`fixer_service.py`、CLI `main()`）的 `from scripts.checker import DocxChecker` 无需改动。

### Decision

采用 5 文件拆分方案（base + property_resolver + style_checker + heading_validator + numbering_checker），按检查领域划分模块。

### Rationale

1. 每个模块 200-400 行，符合可维护性要求
2. 按检查领域而非层级划分，降低模块间耦合
3. `base.py` 保持 DocxChecker 类定义和 run_all_checks 编排，各模块以 Mixin 模式或独立函数集成
4. `__init__.py` re-export 保持向后兼容

### Alternatives Considered

| 方案 | 评价 |
|------|------|
| 仅提取 helper 函数到 utils.py | 不够彻底，checker.py 仍会膨胀 |
| 每个 check_* 方法一个文件 | 文件过多（16+ 个），管理成本高 |
| Mixin 类继承模式 | 适中，但多重继承在 Python 中调试困难 |

---

## Research Topic 3: 文档结构树验证算法

### Question

如何高效构建文档标题层级树，并验证标题连续性、深度限制、非章节标题排除？

### Research

**算法设计**（借鉴 unstructured 的元素层级栈算法）：

```python
def check_heading_hierarchy(self):
    """构建标题层级树并验证连续性"""
    headings = []  # [(para_index, outline_level, text, is_chapter)]

    # Step 1: 收集所有标题段落
    for i, para in enumerate(self.doc.paragraphs):
        level = self._get_para_outline_level(para)
        if level < 9:  # 9 = 非标题
            is_chapter = self._is_chapter_heading(para)
            headings.append((i, level, para.text.strip(), is_chapter))

    if not headings:
        self.add_result("文档结构", "标题层级", CheckResult.PASS, "无标题段落")
        return

    # Step 2: 验证层级连续性（仅对章节标题）
    chapter_headings = [(i, lvl, txt) for i, lvl, txt, is_ch in headings if is_ch]
    prev_level = None
    for para_idx, level, text in chapter_headings:
        if prev_level is not None and level > prev_level + 1:
            # 层级跳跃
            self.add_result("文档结构", f"标题层级跳跃",
                CheckResult.FAIL,
                f"'{text[:30]}'(H{level+1}) 出现在 H{prev_level+1} 之后，"
                f"缺少 H{prev_level+2} 级别的标题",
                f"段落{para_idx}")
        prev_level = level

    # Step 3: 验证最大深度
    max_depth = self.rules.get('structure', {}).get('max_heading_depth', 3)
    for para_idx, level, text, is_ch in headings:
        if level >= max_depth:  # level 从 0 开始
            self.add_result("文档结构", "标题深度",
                CheckResult.WARN,
                f"'{text[:30]}'(H{level+1}) 超过最大深度 {max_depth}",
                f"段落{para_idx}")
```

**非章节标题识别**：

当前规则 YAML 中，摘要、参考文献等非编号章节使用特殊样式（如 `非章节标题-摘要结论参考文献`）。通过样式名或规则配置中的 `non_chapter_styles` 列表来排除。

### Decision

使用线性扫描 + 前一标题级别比较的栈式算法，O(n) 时间复杂度。非章节标题通过样式名匹配排除。

### Rationale

1. 线性扫描足够高效，500+ 段落的文档也能在 < 10ms 内完成
2. 不需要构建完整的树结构（不需要父子引用），只需跟踪 prev_level 即可检测跳跃
3. 非章节标题排除逻辑复用现有的样式名匹配机制

### Alternatives Considered

| 方案 | 评价 |
|------|------|
| 构建完整 N-ary 树 | 过度设计，当前需求不需要树遍历 |
| 使用正则匹配标题文本中的编号 | 不可靠，标题文本格式多变 |

---

## Research Topic 4: 场景化预设规则设计

### Question

如何设计"通用学术论文"和"国标公文"两个预设规则文件？如何在 API 和前端中标注 `is_preset`？

### Research

**规则文件设计**：

参考现有 `hit_midterm_report.yaml`（530 行）和 `default.yaml`（55 行）的结构，新增预设规则复用完全相同的 YAML 结构。

**academic_paper.yaml 核心规则**（通用学术论文）：

- 页面：A4，上下边距 2.54cm，左右边距 3.17cm（GB/T 7713.1-2006 推荐）
- 正文：宋体小四 / Times New Roman 12pt，1.5 倍行距
- 标题：黑体，一级标题小二、二级标题小三、三级标题四号
- 结构：必须包含摘要、目录、正文、参考文献
- 特殊检查：开启字体一致性检查

**gov_document.yaml 核心规则**（国标公文 GB/T 9704-2012）：

- 页面：A4，上边距 3.7cm，下边距 3.5cm，左右边距 2.8cm
- 正文：仿宋三号（16pt），行距 28.95pt（固定值）
- 标题：方正小标宋简体 / 黑体 / 楷体（分级别）
- 结构：主送机关、正文、附件、发文机关、成文日期
- 页码：一般用 4 号半角阿拉伯数字

**is_preset 标注方案**：

1. **YAML 层**：在 `meta` 中添加 `is_preset: true`
2. **API 层**：`RuleInfo` schema 已有 `is_default` 字段，新增 `is_preset` 字段
3. **rules_service.py**：扫描时读取 `meta.is_preset`，填充到 RuleInfo
4. **前端**：UploadPanel 在渲染下拉选项时，对 `is_preset=true` 的规则项添加小字标签

### Decision

- 预设规则通过 `meta.is_preset: true` 自描述，rules_service 读取并传递给前端
- `RuleInfo` schema 新增 `is_preset: bool = False` 字段
- 两个新规则文件分别约 200-300 行，覆盖各自场景的核心格式要求

### Rationale

1. 自描述方式（YAML 中标注）最简单，不需要硬编码文件名列表
2. 新增字段向后兼容（默认 `False`，现有规则无需修改）
3. 规则内容参考国家标准和常见学术论文要求，具有通用性

### Alternatives Considered

| 方案 | 评价 |
|------|------|
| 硬编码预设规则文件名列表 | 不灵活，新增预设需改代码 |
| 使用独立的 presets/ 目录 | 增加目录管理复杂度，且规则结构完全相同无需分开 |
