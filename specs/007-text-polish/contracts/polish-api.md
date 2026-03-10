# Contract: 润色 API 接口

**Feature**: 007-text-polish | **Date**: 2026-03-10

## 1. polisher/ 子包对外接口

### `polisher/__init__.py` — 对外导出

```python
"""
polisher 子包入口

提供内容润色功能的核心模块。
"""
from polisher.text_extractor import TextExtractor, ParagraphSnapshot, RunInfo
from polisher.polish_engine import PolishEngine, PolishSuggestion, ChangeDetail
from polisher.diff_calculator import DiffCalculator
from polisher.text_writer import TextWriter

__all__ = [
    'TextExtractor', 'ParagraphSnapshot', 'RunInfo',
    'PolishEngine', 'PolishSuggestion', 'ChangeDetail',
    'DiffCalculator',
    'TextWriter',
]
```

---

## 2. TextExtractor 接口

### `polisher/text_extractor.py`

```python
class TextExtractor:
    """文档段落提取器 — 提取可润色段落并记录 Run 结构"""

    def __init__(self, doc: Document) -> None:
        """
        Args:
            doc: python-docx Document 对象
        """

    def extract_paragraphs(self) -> list[ParagraphSnapshot]:
        """提取文档所有段落的快照

        遍历 doc.paragraphs，对每个段落：
        1. 分类为可润色/不可润色
        2. 记录 Run 结构信息（文本 + 格式 + 偏移量）

        Returns:
            段落快照列表（保持文档中的原始顺序）
        """

    def get_polishable_paragraphs(self) -> list[ParagraphSnapshot]:
        """获取所有可润色段落

        Returns:
            is_polishable=True 的段落快照列表
        """

    @staticmethod
    def batch_paragraphs(
        snapshots: list[ParagraphSnapshot],
        batch_size: int = 5,
    ) -> list[list[ParagraphSnapshot]]:
        """将可润色段落分批

        Args:
            snapshots: 段落快照列表
            batch_size: 每批段落数（默认 5）

        Returns:
            分批后的段落快照列表
        """
```

---

## 3. PolishEngine 接口

### `polisher/polish_engine.py`

```python
class PolishEngine:
    """LLM 润色引擎 — 分批润色 + 可选 Reviewer 审核"""

    MAX_RETRIES = 2  # LLM 调用最大重试次数

    def __init__(
        self,
        enable_reviewer: bool = True,
        batch_size: int = 5,
        context_window: int = 2,
    ) -> None:
        """
        Args:
            enable_reviewer: 是否启用 Reviewer Agent 语义审核
            batch_size: 每批润色的段落数
            context_window: 上下文窗口大小（前后各 N 段）
        """

    async def polish_batch(
        self,
        batch: list[ParagraphSnapshot],
        all_paragraphs: list[ParagraphSnapshot],
    ) -> list[PolishSuggestion]:
        """润色一批段落

        Args:
            batch: 待润色的段落快照列表
            all_paragraphs: 全部段落快照（用于构建上下文窗口）

        Returns:
            该批段落的润色建议列表（仅包含有修改的段落）

        Raises:
            Exception: LLM 调用失败且重试耗尽
        """

    async def polish_document(
        self,
        snapshots: list[ParagraphSnapshot],
    ) -> AsyncGenerator[dict, None]:
        """润色整个文档（SSE 流式生成器）

        分批处理所有可润色段落，每完成一批 yield 一个事件。

        Args:
            snapshots: 全部段落快照

        Yields:
            SSE 事件 dict:
            - {"event": "progress", "data": {...}}
            - {"event": "batch_complete", "data": {...}}
            - {"event": "complete", "data": {...}}
            - {"event": "error", "data": {...}}
        """

    async def _call_polisher(
        self,
        batch: list[ParagraphSnapshot],
        context: dict,
    ) -> list[dict]:
        """调用 Polisher Agent（带重试）

        Returns:
            LLM 返回的 JSON 解析后的列表
        """

    async def _call_reviewer(
        self,
        original_texts: list[str],
        polished_texts: list[str],
    ) -> list[dict]:
        """调用 Reviewer Agent 审核语义一致性

        Returns:
            [{"semantic_preserved": bool, "warning": str | None}, ...]
        """
```

---

## 4. DiffCalculator 接口

### `polisher/diff_calculator.py`

```python
class DiffCalculator:
    """字级别 Diff 计算器"""

    @staticmethod
    def compute_diff(original: str, polished: str) -> list[DiffOperation]:
        """计算原文与润色后文本的字级别差异

        Args:
            original: 原始文本
            polished: 润色后文本

        Returns:
            差异操作列表 [DiffOperation(tag, i1, i2, j1, j2), ...]
            tag: "equal" | "replace" | "insert" | "delete"
        """

    @staticmethod
    def compute_run_mapping(
        runs_info: list[RunInfo],
        original: str,
        polished: str,
    ) -> list[RunModification]:
        """计算 Run 级别的修改映射

        将字符级 diff 映射到 Run 边界，确定每个 Run 需要的修改操作。

        Args:
            runs_info: 段落的 Run 信息列表
            original: 原始段落文本
            polished: 润色后段落文本

        Returns:
            Run 修改操作列表
        """
```

---

## 5. TextWriter 接口

### `polisher/text_writer.py`

```python
class TextWriter:
    """润色文本回写器 — 精确修改 Run 文本，保留格式"""

    def __init__(self, doc: Document) -> None:
        """
        Args:
            doc: python-docx Document 对象
        """

    def apply_suggestions(
        self,
        suggestions: list[PolishSuggestion],
        snapshots: list[ParagraphSnapshot],
    ) -> int:
        """应用润色建议到文档

        Args:
            suggestions: 要应用的润色建议列表（仅用户接受的）
            snapshots: 段落快照列表（用于 Run 映射）

        Returns:
            成功应用的修改数量
        """

    def save(self, output_path: str, backup_suffix: str = ".polish.bak") -> str:
        """保存修改后的文档

        自动创建备份文件。

        Args:
            output_path: 输出文件路径
            backup_suffix: 备份文件后缀

        Returns:
            保存的文件路径
        """

    def _write_paragraph(
        self,
        paragraph,
        original_text: str,
        polished_text: str,
        runs_info: list[RunInfo],
    ) -> bool:
        """回写单个段落

        分层策略：
        1. 单 Run → 直接替换 text
        2. 多 Run 同格式 → 合并到第一个 Run
        3. 多 Run 不同格式 → 字符偏移量对齐

        Returns:
            是否成功回写
        """
```

---

## 6. API 路由契约

### POST /api/polish — 执行润色（SSE 流式）

**请求**: `multipart/form-data`

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `file` | File | ✅ | .docx 文件 |
| `enable_reviewer` | bool | ❌ | 是否启用 Reviewer Agent（默认 true） |

**响应**: `text/event-stream` (SSE)

```
event: progress
data: {"total_batches": 10, "status": "extracting", "total_paragraphs": 50, "polishable_paragraphs": 42}

event: batch_complete
data: {"batch_index": 0, "total_batches": 10, "suggestions": [...]}

event: batch_complete
data: {"batch_index": 1, "total_batches": 10, "suggestions": [...]}

... (重复直到所有批次完成)

event: complete
data: {"session_id": "uuid", "filename": "论文.docx", "suggestions": [...], "summary": {...}, "polished_at": "..."}
```

**SSE 事件类型**：

| 事件名 | 数据 | 说明 |
|--------|------|------|
| `progress` | `{total_batches, status, total_paragraphs, polishable_paragraphs}` | 初始进度信息 |
| `batch_complete` | `{batch_index, total_batches, suggestions[]}` | 单批润色完成 |
| `complete` | `PolishReport` 完整 JSON | 全部润色完成 |
| `error` | `{message, batch_index?}` | 错误信息 |

**错误响应**:

```json
// 400
{"error": "bad_request", "message": "请上传 .docx 格式的文件"}

// 503
{"error": "llm_unavailable", "message": "LLM 服务不可用，请检查 API Key 配置"}
```

---

### POST /api/polish/apply — 应用润色修改

**请求**: `application/json`

```json
{
  "session_id": "uuid-v4",
  "accepted_indices": [0, 2, 5, 7, 8]
}
```

**响应**: `application/json`

```json
{
  "session_id": "uuid-v4",
  "filename": "论文.docx",
  "applied_count": 5,
  "download_url": "/api/polish/download/uuid-v4"
}
```

**错误响应**:

```json
// 400
{"error": "bad_request", "message": "session_id 格式不正确"}

// 404
{"error": "not_found", "message": "润色会话不存在或已过期"}

// 409
{"error": "conflict", "message": "该会话的修改已被应用"}
```

**安全校验**:
- `session_id` MUST 为合法 UUID v4 格式
- `accepted_indices` 中的索引 MUST 在有效范围内（0 ≤ index < len(suggestions)）

---

### GET /api/polish/download/{session_id} — 下载润色后文档

**路径参数**: `session_id` (UUID v4)

**响应**: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

返回润色后的 .docx 文件。

**响应 Headers**:
```
Content-Disposition: attachment; filename="论文_polished.docx"
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
```

**错误响应**:

```json
// 400
{"error": "bad_request", "message": "session_id 格式不正确"}

// 404
{"error": "not_found", "message": "文件不存在或已过期"}
```

---

## 7. AI Prompt 模板新增

### `services/ai_prompts.py` — 新增 Section

```python
# ============================================================
# 5. 内容润色 — Polisher Agent
# ============================================================

POLISH_SYSTEM_PROMPT = """你是一个专业的中文学术论文润色助手..."""

def build_polish_messages(
    target_paragraphs: list[str],
    context_before: list[str],
    context_after: list[str],
) -> list[dict]:
    """构建润色请求的消息列表"""


# ============================================================
# 6. 内容润色 — Reviewer Agent
# ============================================================

REVIEWER_SYSTEM_PROMPT = """你是学术文本语义一致性审查员..."""

def build_reviewer_messages(
    original_texts: list[str],
    polished_texts: list[str],
) -> list[dict]:
    """构建语义审核请求的消息列表"""
```

---

## 8. 现有 Schema 扩展

### `api/schemas.py` — 新增

```python
# ========================================
# 润色相关
# ========================================

class ChangeDetailSchema(BaseModel):
    type: str
    original: str
    revised: str
    explanation: str

class PolishSuggestionSchema(BaseModel):
    paragraph_index: int
    original_text: str
    polished_text: str
    change_type: str
    changes: list[ChangeDetailSchema]
    explanation: str
    confidence: float
    semantic_warning: bool = False
    semantic_warning_text: Optional[str] = None

class PolishSummarySchema(BaseModel):
    total_paragraphs: int
    polishable_paragraphs: int
    skipped_paragraphs: int
    modified_paragraphs: int
    total_suggestions: int
    by_type: dict[str, int]
    semantic_warnings: int

class PolishReportSchema(BaseModel):
    session_id: str
    filename: str
    suggestions: list[PolishSuggestionSchema]
    summary: PolishSummarySchema
    polished_at: str

class PolishApplyRequestSchema(BaseModel):
    session_id: str
    accepted_indices: list[int]

class PolishApplyResponseSchema(BaseModel):
    session_id: str
    filename: str
    applied_count: int
    download_url: str
```

### `frontend/src/types/index.ts` — 新增

```typescript
// ========================================
// 润色相关
// ========================================

export type PolishChangeType = "grammar" | "wording" | "punctuation" | "structure" | "academic";

export interface ChangeDetail { ... }       // 见 data-model.md
export interface PolishSuggestion { ... }   // 见 data-model.md
export interface PolishSummary { ... }      // 见 data-model.md
export interface PolishReport { ... }       // 见 data-model.md
export interface PolishApplyRequest { ... } // 见 data-model.md
export interface PolishApplyResponse { ... } // 见 data-model.md

// AppState 扩展新增: "POLISHING" | "POLISH_PREVIEW" | "POLISH_APPLYING"
```

---

## 9. 向后兼容性

| 变更 | 影响 | 兼容性 |
|------|------|--------|
| 新增 `/api/polish` 路由 | 新接口 | ✅ 不影响现有接口 |
| 新增 `/api/polish/apply` 路由 | 新接口 | ✅ 不影响现有接口 |
| 新增 `/api/polish/download` 路由 | 新接口 | ✅ 不影响现有接口 |
| `schemas.py` 新增 Schema 类 | 新增 | ✅ 不影响现有 Schema |
| `ai_prompts.py` 新增 Prompt | 新增 | ✅ 不影响现有 Prompt |
| `frontend/types/index.ts` 扩展 AppState | 新增联合类型成员 | ✅ 向后兼容 |
| `UploadPanel.tsx` 新增 Tab | 组件修改 | ✅ 默认 Tab 为"格式检查"，现有功能不变 |

**注意**：润色功能完全独立于格式检查/修复流程，不修改任何现有接口或行为。
