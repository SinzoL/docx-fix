# Data Model: 通用文本排版习惯检查

**Feature**: 006-text-conventions | **Date**: 2026-03-10

## 运行时实体

### 1. ParagraphInfo（段落遍历信息）

```python
@dataclass
class ParagraphInfo:
    """段落遍历信息 — iter_all_paragraphs() 产出"""
    paragraph: object       # docx Paragraph 对象（脚注/尾注为 None）
    index: int              # 段落序号（全局从 0 开始）
    source: str             # "body" | "table" | "footnote" | "endnote"
    text: str               # 所有 Run 文本拼接
    style_name: str         # 样式名
    has_xml_indent: bool    # 是否有 XML 首行缩进（w:ind firstLine）
```

### 2. TextIssue（文本检查问题）

```python
@dataclass
class TextIssue:
    """文本检查发现的问题"""
    rule: str               # 规则名（对应 YAML text_conventions 的 key）
    category: str           # "通用·标点" | "通用·空格" | "通用·全半角"
    item: str               # 检查项名称（如"括号不对称"、"连续标点"）
    status: str             # "FAIL" | "WARN"
    message: str            # 描述信息
    paragraph_index: int    # 段落序号
    paragraph_source: str   # 来源（body/table/footnote/endnote）
    char_offset: int = 0    # 字符偏移
    context: str = ""       # 上下文片段（前后各 10 字符）
    fixable: bool = False   # 是否可自动修复
    is_disputed: bool = False  # 是否为争议项（需 LLM 审查）
```

### 3. DocumentStats（文档级统计）

```python
@dataclass
class DocumentStats:
    """文档级统计数据（用于 LLM 审查上下文）"""
    total_paragraphs: int = 0
    cjk_spaced_count: int = 0    # 中英交界有空格的数量
    cjk_unspaced_count: int = 0  # 中英交界无空格的数量
```

### 4. TextFixRecord（文本修复记录）

```python
@dataclass
class TextFixRecord:
    """单条文本修复记录"""
    category: str           # 分类（"文本排版"）
    description: str        # 修复描述（含段落位置和具体操作）
    paragraph_index: int    # 段落序号
    paragraph_source: str   # 来源（body/table/footnote/endnote）
```

### 5. CheckItemResult（现有 — 新增字段）

```python
class CheckItemResult(BaseModel):
    # 现有字段
    category: str
    item: str
    status: CheckStatus
    message: str
    location: Optional[str] = None
    fixable: bool = False
    # [新增] 006-text-conventions
    id: Optional[str] = None           # 文本检查项 ID（"tc-001"），AI 审查匹配用
    check_layer: str = "format"        # "format" | "text_convention"
    ai_review: Optional[AiReviewResult] = None  # LLM 审查结果
```

### 6. CheckReport（现有 — 新增字段）

```python
class CheckReport(BaseModel):
    # 现有字段不变 ...
    # [新增]
    text_convention_meta: Optional[TextConventionMeta] = None
```

## API Schema（新增 Pydantic 模型）

```python
class AiReviewResult(BaseModel):
    """LLM 审查结果"""
    verdict: str   # "confirmed" | "ignored" | "uncertain"
    reason: str = ""

class DisputedItem(BaseModel):
    """争议项"""
    id: str
    rule: str
    paragraph_index: int
    paragraph_source: str
    text_context: str
    issue_description: str

class TextConventionMeta(BaseModel):
    """文本习惯检查元数据"""
    disputed_items: list[DisputedItem] = []
    document_stats: dict = {}

class AiReviewConventionsRequest(BaseModel):
    session_id: str = ""
    disputed_items: list[AiReviewDisputedItem]
    document_stats: dict = {}

class AiReviewConventionsResponse(BaseModel):
    reviews: list[AiReviewItemResult]

class FixRequest(BaseModel):
    # 现有字段 ...
    include_text_fix: bool = False  # [新增]

class FixItemResult(BaseModel):
    category: str
    description: str
    fix_layer: str = "format"  # [新增] "format" | "text_convention"
```

## YAML 规则扩展

```yaml
text_conventions:
  bracket_mismatch:           { enabled: true }
  quote_mismatch:             { enabled: true }
  duplicate_punctuation:      { enabled: true }
  extra_spaces_in_chinese:    { enabled: true }
  consecutive_spaces:         { enabled: true }
  leading_trailing_spaces:    { enabled: true }
  fullwidth_space:            { enabled: true }
  cjk_english_spacing:        { enabled: true, require_space: null }
  fullwidth_halfwidth_punctuation: { enabled: true, context: "chinese" }
  sentence_ending_punctuation: { enabled: true }
  ai_review:                  { enabled: true }
```

## 数据流

```
docx 文件
    ↓
Document (python-docx)
    ↓
iter_all_paragraphs(doc)
    ├── doc.paragraphs (主体)
    ├── doc.tables → cell.paragraphs (表格)
    ├── footnotes_part (脚注)
    └── endnotes_part (尾注)
    ↓ ParagraphInfo 流
run_text_convention_checks(checker, doc, rules)
    ├── 确定性检查 × 7 → checker.add_result()
    ├── 争议候选 × 3 → TextIssue(is_disputed=True)
    └── 文档统计 → DocumentStats
    ↓
checker_service.run_check()
    ├── 格式检查项 → check_layer: "format"
    ├── 文本检查项 → check_layer: "text_convention" + id: "tc-XXX"
    ├── 争议项 → DisputedItem 列表
    └── CheckReport.text_convention_meta
    ↓
前端 CheckReport.tsx
    ├── 分层展示（格式检查 vs 通用排版习惯）
    ├── 自动发起 POST /api/ai/review-conventions
    └── AI 标签（confirmed ✓ / ignored ○ / uncertain ?）

修复流程:
    FixRequest(include_text_fix=true)
    → DocxFixer(格式修复)
    → run_text_convention_fixes(文本修复叠加)
    → FixItemResult(fix_layer="text_convention")
```
