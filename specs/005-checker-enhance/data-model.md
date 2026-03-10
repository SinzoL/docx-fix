# Data Model: 检查引擎增强

**Feature**: 005-checker-enhance | **Date**: 2026-03-10

## 运行时实体

### 1. PropertyResolver（属性解析器）

```python
class PropertyResolver:
    """OOXML 属性解析器 — 实现 Run 直接格式 → 样式链 → docDefaults → 内置默认 的优先级链"""

    MAX_BASED_ON_DEPTH: int = 10  # basedOn 链最大递归深度

    # 构造时解析
    doc: Document                              # python-docx Document 对象
    _doc_defaults_rPr: dict[str, str]          # 从 w:docDefaults/w:rPrDefault 解析
    _doc_defaults_pPr: dict[str, str]          # 从 w:docDefaults/w:pPrDefault 解析
    _style_cache: dict[str, dict[str, tuple]]  # style_id → {attr: (value, source)}

    # 返回格式
    # {attr_name: ResolvedProperty}
```

### 2. ResolvedProperty（解析后的属性值）

```python
@dataclass
class ResolvedProperty:
    """一个属性的解析结果"""
    value: str | int | float | bool  # 属性值
    source: PropertySource           # 来源层级
    source_style: str | None = None  # 来源样式名（如来自样式链时有值）
```

### 3. PropertySource（属性来源枚举）

```python
class PropertySource(Enum):
    """属性值的来源层级"""
    RUN_DIRECT = "run_direct"       # Run 直接格式（用户手动修改）
    PARAGRAPH_STYLE = "para_style"  # 段落样式 rPr
    BASED_ON = "based_on"           # basedOn 链继承
    DOC_DEFAULTS = "doc_defaults"   # docDefaults
    BUILTIN = "builtin"             # Word 内置默认值
```

### 4. HeadingInfo（标题信息）

```python
@dataclass
class HeadingInfo:
    """文档标题段落信息"""
    para_index: int        # 段落索引（在 doc.paragraphs 中的位置）
    outline_level: int     # 大纲级别（0-based: 0=H1, 1=H2, ...）
    text: str              # 标题文本
    is_chapter: bool       # 是否为编号章节标题（vs 非章节标题如摘要/参考文献）
    style_name: str        # 样式名称
```

### 5. CheckResult（现有 — 无变更）

```python
class CheckResult:
    """单条检查结果 — 现有实体，无结构变更"""
    PASS = "PASS"
    WARN = "WARN"
    FAIL = "FAIL"

    category: str      # 检查类别（如 "段落格式"、"文档结构"）
    item: str          # 检查项（如 "Normal_字号"、"标题层级跳跃"）
    status: str        # PASS / WARN / FAIL
    message: str       # 消息文案（增强后融入来源标注，如 "Run 直接格式覆盖：..."）
    location: str      # 位置（如 "段落 35"）
    fixable: bool      # 是否可自动修复
```

### 6. RuleInfo（现有 — 新增字段）

```python
class RuleInfo(BaseModel):
    """规则文件的元信息 — 新增 is_preset 字段"""
    id: str
    filename: str
    name: str
    description: str
    is_default: bool
    is_preset: bool = False  # [新增] 是否为场景化预设规则
```

## 数据流

```
docx 文件
    ↓
Document (python-docx)
    ↓
PropertyResolver (新增)
    ├── _parse_doc_defaults() → _doc_defaults_rPr, _doc_defaults_pPr
    ├── _resolve_style_chain(style) → {attr: ResolvedProperty}  [缓存]
    └── resolve_run_properties(run, para) → {attr: ResolvedProperty}
    ↓
DocxChecker
    ├── check_paragraph_formatting()  [修改: 使用 PropertyResolver]
    │   → 比对 resolved.value vs rule_expected
    │   → message 融入 resolved.source 信息
    ├── check_heading_hierarchy()     [新增]
    │   → 收集 HeadingInfo 列表
    │   → 线性扫描验证层级连续性/深度
    └── ... (其他检查方法不变)
    ↓
CheckResult 列表
    ↓
checker_service.py → CheckReport JSON → 前端
```

## YAML 规则扩展

### 新增字段

```yaml
meta:
  is_preset: true             # [新增] 标识为预设规则，前端不可编辑/删除

structure:
  max_heading_depth: 3        # [新增] 标题最大深度（默认 3）
  non_chapter_styles:         # [新增] 非章节标题的样式名列表
    - "非章节标题-摘要结论参考文献"
    - "TOC Heading"
```

### 兼容性

- `is_preset` 默认 `False`，现有规则无需修改
- `max_heading_depth` 默认 `3`，现有规则不配置时使用默认值
- `non_chapter_styles` 默认空列表，不配置时所有标题均参与层级检查
