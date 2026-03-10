# Data Model: 内容润色

**Feature**: 007-text-polish | **Date**: 2026-03-10

## 运行时实体

### 1. ParagraphSnapshot（段落快照）

```python
@dataclass
class ParagraphSnapshot:
    """段落快照 — 记录段落的完整信息，用于提取和回写"""
    index: int                    # 段落在 doc.paragraphs 中的位置
    text: str                     # 纯文本内容（所有 Run 拼接）
    style_name: str               # 段落样式名
    element_type: str             # "title" | "narrative" | "list" | "toc" | "caption" | "reference" | "formula"
    runs: list[RunInfo]           # 每个 Run 的快照
    is_polishable: bool           # 是否适合润色
    skip_reason: str | None       # 跳过原因（当 is_polishable=False 时）
```

### 2. RunInfo（Run 信息快照）

```python
@dataclass
class RunInfo:
    """Run 级别的信息快照"""
    index: int                    # Run 在段落中的索引
    text: str                     # Run 文本
    start_offset: int             # 在段落纯文本中的起始字符偏移
    end_offset: int               # 结束字符偏移
    # 格式属性
    font_name: str | None         # 字体名（ascii）
    font_name_east_asia: str | None  # 中文字体名
    font_size_pt: float | None    # 字号（磅）
    bold: bool | None             # 加粗
    italic: bool | None           # 斜体
    underline: bool | None        # 下划线
    color_rgb: str | None         # 颜色（RGB 十六进制）
    superscript: bool | None      # 上标
    subscript: bool | None        # 下标
```

### 3. PolishSuggestion（润色建议）

```python
@dataclass
class PolishSuggestion:
    """单条润色建议"""
    paragraph_index: int          # 段落索引（在 doc.paragraphs 中的位置）
    original_text: str            # 原始文本
    polished_text: str            # 润色后文本
    change_type: str              # "grammar" | "wording" | "punctuation" | "structure" | "academic"
    changes: list[ChangeDetail]   # 具体修改点列表
    explanation: str              # 总体修改说明
    confidence: float             # 置信度 0.0-1.0
    semantic_warning: bool        # Reviewer 是否标记语义偏移
    semantic_warning_text: str | None  # 语义偏移说明
```

### 4. ChangeDetail（修改详情）

```python
@dataclass
class ChangeDetail:
    """单个修改点的详情"""
    type: str                     # "grammar" | "wording" | "punctuation" | "structure" | "academic"
    original: str                 # 被修改的原始片段
    revised: str                  # 修改后的片段
    explanation: str              # 修改理由
```

### 5. PolishSummary（润色统计）

```python
@dataclass
class PolishSummary:
    """润色报告统计信息"""
    total_paragraphs: int         # 文档总段落数
    polishable_paragraphs: int    # 可润色段落数
    skipped_paragraphs: int       # 跳过的段落数
    modified_paragraphs: int      # 有修改建议的段落数
    total_suggestions: int        # 总建议条数
    by_type: dict[str, int]       # 按修改类型统计 {"grammar": 3, "wording": 4, ...}
    semantic_warnings: int        # 语义偏移警告数
```

### 6. PolishReport（润色报告）

```python
@dataclass
class PolishReport:
    """完整润色报告"""
    session_id: str               # 会话 ID
    filename: str                 # 文件名
    suggestions: list[PolishSuggestion]  # 所有润色建议
    summary: PolishSummary        # 统计信息
    polished_at: str              # 润色时间（ISO 8601）
```

### 7. PolishApplyRequest（应用请求）

```python
@dataclass
class PolishApplyRequest:
    """用户确认后的应用请求"""
    session_id: str               # 会话 ID
    accepted_indices: list[int]   # 用户接受的建议在 suggestions 列表中的索引
```

## API Schema（Pydantic 模型）

### 请求/响应模型

```python
# --- SSE 事件数据 ---

class PolishProgressEvent(BaseModel):
    """SSE: 润色进度事件"""
    total_batches: int
    status: str  # "extracting" | "polishing" | "reviewing"

class PolishBatchCompleteEvent(BaseModel):
    """SSE: 批次完成事件"""
    batch_index: int
    total_batches: int
    suggestions: list[PolishSuggestionSchema]

class PolishCompleteEvent(BaseModel):
    """SSE: 润色完成事件"""
    report: PolishReportSchema

# --- Schema ---

class ChangeDetailSchema(BaseModel):
    """修改详情"""
    type: str
    original: str
    revised: str
    explanation: str

class PolishSuggestionSchema(BaseModel):
    """润色建议（API 响应）"""
    paragraph_index: int
    original_text: str
    polished_text: str
    change_type: str
    changes: list[ChangeDetailSchema]
    explanation: str
    confidence: float
    semantic_warning: bool = False
    semantic_warning_text: str | None = None

class PolishSummarySchema(BaseModel):
    """润色统计（API 响应）"""
    total_paragraphs: int
    polishable_paragraphs: int
    skipped_paragraphs: int
    modified_paragraphs: int
    total_suggestions: int
    by_type: dict[str, int]
    semantic_warnings: int

class PolishReportSchema(BaseModel):
    """完整润色报告（API 响应）"""
    session_id: str
    filename: str
    suggestions: list[PolishSuggestionSchema]
    summary: PolishSummarySchema
    polished_at: str

class PolishApplyRequestSchema(BaseModel):
    """应用润色修改请求"""
    session_id: str
    accepted_indices: list[int]

class PolishApplyResponseSchema(BaseModel):
    """应用润色修改响应"""
    session_id: str
    filename: str
    applied_count: int
    download_url: str
```

## 前端类型定义

```typescript
// --- 润色相关类型 ---

export type PolishChangeType = "grammar" | "wording" | "punctuation" | "structure" | "academic";

export interface ChangeDetail {
  type: PolishChangeType;
  original: string;
  revised: string;
  explanation: string;
}

export interface PolishSuggestion {
  paragraph_index: number;
  original_text: string;
  polished_text: string;
  change_type: PolishChangeType;
  changes: ChangeDetail[];
  explanation: string;
  confidence: number;
  semantic_warning: boolean;
  semantic_warning_text: string | null;
}

export interface PolishSummary {
  total_paragraphs: number;
  polishable_paragraphs: number;
  skipped_paragraphs: number;
  modified_paragraphs: number;
  total_suggestions: number;
  by_type: Record<string, number>;
  semantic_warnings: number;
}

export interface PolishReport {
  session_id: string;
  filename: string;
  suggestions: PolishSuggestion[];
  summary: PolishSummary;
  polished_at: string;
}

export interface PolishApplyRequest {
  session_id: string;
  accepted_indices: number[];
}

export interface PolishApplyResponse {
  session_id: string;
  filename: string;
  applied_count: number;
  download_url: string;
}

// --- 状态机扩展 ---
export type AppState =
  | "IDLE"
  | "UPLOADING"
  | "CHECKING"
  | "REPORT_READY"
  | "FIXING"
  | "FIX_PREVIEW"
  | "DOWNLOADED"
  // 润色状态
  | "POLISHING"
  | "POLISH_PREVIEW"
  | "POLISH_APPLYING";
```

## 数据流

```
docx 文件
    ↓
Document (python-docx)
    ↓
TextExtractor
    ├── extract_paragraphs(doc) → list[ParagraphSnapshot]
    │   ├── 遍历 doc.paragraphs
    │   ├── 对每个段落: 分类(is_polishable) + 记录 RunInfo
    │   └── 返回快照列表
    ↓
PolishEngine
    ├── batch_paragraphs(snapshots) → list[list[ParagraphSnapshot]]
    ├── for each batch:
    │   ├── Polisher Agent: polish_batch(batch, context) → list[PolishSuggestion]
    │   └── Reviewer Agent: review_batch(original, polished) → semantic_warnings
    │       (optional, configurable)
    └── SSE: yield batch_complete events
    ↓
PolishReport (all suggestions + summary)
    ↓
    ├── [前端预览] → 用户逐条接受/拒绝
    ↓
PolishApplyRequest (accepted_indices)
    ↓
TextWriter
    ├── load document + load polish_report
    ├── for each accepted suggestion:
    │   ├── 定位段落 (by paragraph_index)
    │   ├── 计算 Run 映射 (difflib)
    │   └── 回写修改 (保留格式)
    ├── 自动备份原文件
    └── 保存修改后文件
    ↓
下载润色后文档
```
