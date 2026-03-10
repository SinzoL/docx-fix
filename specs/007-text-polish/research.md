# Research: 内容润色

**Feature**: 007-text-polish | **Date**: 2026-03-10

## Research Topic 1: 段落级文本提取与 Run 结构保留

### Question

如何从 Word 文档中提取段落文本用于 LLM 润色，同时保留完整的 Run 结构信息（每个 Run 的文本边界和格式属性），以便润色后精确回写？

### Research

**python-docx 的段落 → Run 结构**：

```python
# 一个段落由多个 Run 组成
paragraph.text = "这是一个非常重要的实验"
# 实际结构:
# Run 0: text="这是一个",  font=宋体 12pt
# Run 1: text="非常重要",  font=宋体 12pt 加粗
# Run 2: text="的实验",    font=宋体 12pt
```

**关键挑战**：LLM 只处理纯文本，不感知 Run 边界。润色后的文本需要"映射回"原始 Run 结构。

**提取策略**：

```python
@dataclass
class RunInfo:
    """Run 级别的信息快照"""
    text: str                # Run 文本
    start_offset: int        # 在段落纯文本中的起始偏移
    end_offset: int          # 结束偏移
    font_name: str | None    # 字体名
    font_size: int | None    # 字号（half-points）
    bold: bool | None        # 加粗
    italic: bool | None      # 斜体
    color_rgb: str | None    # 颜色
    # ... 其他格式属性

@dataclass
class ParagraphSnapshot:
    """段落快照 — 提取和回写的核心数据结构"""
    index: int               # 段落在 doc.paragraphs 中的位置
    text: str                # 纯文本（所有 Run 文本拼接）
    style_name: str          # 段落样式名
    runs: list[RunInfo]      # 每个 Run 的快照
    is_polishable: bool      # 是否适合润色
    skip_reason: str | None  # 跳过原因
```

**不可润色段落的识别**：

| 类型 | 识别方式 |
|------|---------|
| TOC 段落 | 样式名包含 "TOC" 或 "toc" |
| 图注 | 文本以 "图" 开头 + 数字编号模式（`图\d+-\d+`、`图\d+`） |
| 表注 | 文本以 "表" 开头 + 数字编号模式 |
| 公式段落 | 包含 OMath XML 元素（`<m:oMath>` 或 `<m:oMathPara>`）|
| 参考文献列表 | 文本以 `[数字]` 开头（如 `[1]`、`[12]`）|
| 短文本 | `len(text.strip()) < 5` |
| 纯空白/空段落 | `text.strip() == ""` |
| 标题段落 | 大纲级别 < 9（标题仅做简单润色或跳过）|

**分批策略**：

```python
def batch_paragraphs(snapshots: list[ParagraphSnapshot], batch_size: int = 5) -> list[list[ParagraphSnapshot]]:
    """将可润色段落分批，每批 batch_size 个"""
    polishable = [s for s in snapshots if s.is_polishable]
    return [polishable[i:i+batch_size] for i in range(0, len(polishable), batch_size)]
```

### Decision

采用 `ParagraphSnapshot` + `RunInfo` 数据结构记录完整的段落/Run 信息。提取时构建快照列表，回写时通过快照精确定位和修改。

### Rationale

1. RunInfo 记录每个 Run 在段落纯文本中的偏移量，回写时可精确定位修改范围
2. 不可润色段落的识别使用多种策略组合（样式名、正则匹配、XML 元素检测），覆盖常见场景
3. 分批策略简单可控，每批 5 段约 500-1000 tokens，在 LLM 上下文窗口内

### Alternatives Considered

| 方案 | 评价 |
|------|------|
| 全文一次性提取发给 LLM | Token 消耗巨大，无法精确定位修改 |
| 句子级提取 | 切分复杂（中文句子切分不可靠），上下文不足 |
| 使用 python-docx 的 XML 直接操作 | 过于底层，python-docx 的 Run 抽象已足够 |

---

## Research Topic 2: LLM 润色 Prompt 设计与双 Agent 架构

### Question

如何设计润色 Prompt 确保 LLM "只改表达不改内容"？双 Agent（polisher + reviewer）架构如何实现？

### Research

**Polisher Agent Prompt 设计原则**：

1. **明确能力范围**：列出允许的修改类型（语病/用词/标点/句式/学术规范）
2. **严格约束列表**：列出所有禁止修改的内容（论点、数据、公式、专有名词等）
3. **"不改则不动"原则**：如果原文已合适，必须返回原文不做修改
4. **结构化输出**：要求 JSON 格式输出，便于程序解析

**Polisher Prompt 核心结构**：

```
System: 你是专业的中文学术论文润色助手...
  - 能力范围: 语病/用词/标点/句式/学术规范
  - 严格约束: 不改论点/数据/公式/专有名词/引用编号
  - 输出格式: JSON {polished, changes[], modified}

User: 请润色以下段落（上下文 + 目标段落标记）
  [上下文-前]: 前两段文本
  [目标段落]: 待润色段落
  [上下文-后]: 后两段文本
```

**Reviewer Agent Prompt 设计**：

```
System: 你是学术文本语义一致性审查员...
  - 任务: 对比原文和润色后文本，判断语义是否一致
  - 判断标准: 论点/论据/数据/结论是否改变
  - 输出: JSON {semantic_preserved: bool, warning: str | null}
```

**双 Agent 流程**：

```
对每批段落:
  1. Polisher: 接收原文 → 返回润色后文本 + 修改说明
  2. Reviewer: 接收(原文, 润色后文本) → 判断语义一致性
  3. 合并: 如果 reviewer 标记语义偏移 → 在建议中附加 warning
```

**上下文窗口设计**：

```python
def build_polish_context(target_idx: int, all_paragraphs: list[str], window: int = 2) -> dict:
    """为目标段落构建上下文窗口"""
    start = max(0, target_idx - window)
    end = min(len(all_paragraphs), target_idx + window + 1)
    return {
        "context_before": all_paragraphs[start:target_idx],
        "target": all_paragraphs[target_idx],
        "context_after": all_paragraphs[target_idx+1:end],
    }
```

**LLM 输出格式**：

```json
{
  "paragraphs": [
    {
      "index": 0,
      "polished": "润色后的文本",
      "changes": [
        {"type": "grammar", "original": "表明了", "revised": "表明", "explanation": "去除多余的'了'"}
      ],
      "modified": true
    }
  ]
}
```

### Decision

采用双 Agent 架构（Polisher + Reviewer），每批段落先润色后审核。Prompt 使用严格的约束列表 + JSON 输出格式。Reviewer 为可选功能，可通过配置关闭。

### Rationale

1. 双 Agent 从不同角度保障质量（创作 vs 审核），降低单一 LLM 的语义偏移风险
2. JSON 输出格式便于程序解析，异常格式可通过重试机制处理
3. 上下文窗口（前后各 2 段）在 Token 消耗和语境理解之间取得平衡

### Alternatives Considered

| 方案 | 评价 |
|------|------|
| 单 Agent（只有 Polisher） | 更简单但语义偏移风险较高 |
| 三 Agent（+ 打分 Agent） | 过度设计，Token 消耗翻倍 |
| 使用 function calling 代替 JSON 输出 | DeepSeek 的 function calling 能力不如 JSON 稳定 |

---

## Research Topic 3: 格式保留回写算法

### Question

如何将 LLM 润色后的纯文本精确写回原段落的 Run 结构，保留每个 Run 的格式属性（字体、字号、加粗等）？

### Research

**核心挑战**：

LLM 只输出纯文本。原段落有多个 Run，每个 Run 有不同格式。回写时需要：
1. 确定润色修改涉及哪些 Run
2. 修改 Run 的 text 属性而不改变格式
3. 处理修改可能跨越 Run 边界的情况

**回写算法（基于字符偏移量对齐）**：

```python
def write_back(paragraph, original_text: str, polished_text: str, runs_info: list[RunInfo]):
    """
    策略: 使用 difflib 计算原文 → 润色文本的操作序列，
    然后将操作映射到 Run 边界
    """
    import difflib

    # Step 1: 计算字符级 diff
    matcher = difflib.SequenceMatcher(None, original_text, polished_text)
    opcodes = matcher.get_opcodes()

    # Step 2: 检查修改是否仅在单个 Run 内部
    for tag, i1, i2, j1, j2 in opcodes:
        if tag == 'equal':
            continue
        # 找到受影响的 Run
        affected_runs = find_affected_runs(runs_info, i1, i2)

        if len(affected_runs) == 1:
            # Case A: 修改在单个 Run 内部 — 最简单
            run = affected_runs[0]
            run_obj = paragraph.runs[run.index]
            # 直接替换 Run 中受影响的子串
            run_obj.text = compute_new_run_text(run, original_text, polished_text, i1, i2, j1, j2)
        else:
            # Case B: 修改跨越多个 Run — 合并策略
            # 保留第一个 Run 的格式，合并文本到第一个 Run
            first_run = affected_runs[0]
            merged_text = compute_merged_text(affected_runs, original_text, polished_text, i1, i2, j1, j2)
            paragraph.runs[first_run.index].text = merged_text
            # 清空其他受影响的 Run
            for run in affected_runs[1:]:
                paragraph.runs[run.index].text = ""
```

**简化方案（适用于绝大多数情况）**：

由于学术论文的格式通常比较规整（不像富文本编辑器那样复杂），一个更简单且可靠的策略是：

```python
def simple_write_back(paragraph, polished_text: str):
    """
    简化回写策略:
    1. 如果段落只有 1 个 Run → 直接替换 text
    2. 如果有多个 Run 但格式相同 → 合并为 1 个 Run + 替换
    3. 如果有多个 Run 且格式不同 → 使用字符偏移量对齐算法
    """
    runs = paragraph.runs
    if len(runs) == 0:
        return
    if len(runs) == 1:
        runs[0].text = polished_text
        return

    # 检查所有 Run 格式是否相同
    if all_runs_same_format(runs):
        # 合并到第一个 Run
        runs[0].text = polished_text
        for r in runs[1:]:
            r.text = ""
        return

    # 复杂情况: 使用偏移量对齐
    offset_aligned_write_back(paragraph, polished_text)
```

### Decision

采用分层回写策略：先尝试简化方案（单 Run / 同格式多 Run），对复杂情况使用字符偏移量对齐算法。所有策略都保留第一个受影响 Run 的格式。

### Rationale

1. 学术论文中大部分段落格式简单（1-3 个 Run，格式较统一），简化方案可覆盖 80%+ 场景
2. 字符偏移量对齐基于 difflib（Python 标准库），无需引入额外依赖
3. "保留第一个 Run 格式"的策略在跨 Run 修改时是最安全的选择

### Alternatives Considered

| 方案 | 评价 |
|------|------|
| 删除所有 Run，创建单个新 Run | 会丢失所有 Run 级格式（加粗、斜体等） |
| 使用 lxml 直接操作 XML | 过于底层，python-docx 的 Run API 已足够 |
| 要求 LLM 输出 Run 级别的修改指令 | LLM 不可靠，增加 Prompt 复杂度 |

---

## Research Topic 4: SSE 流式润色与前端渐进式渲染

### Question

如何实现润色过程的 SSE 流式推送，使前端可以在润色进行中实时看到已完成的建议？

### Research

**现有 SSE 基础设施**：

项目已在 `ai_routes.py` 中使用 SSE 实现了 AI 总结和对话的流式推送。润色功能可复用相同的模式。

**SSE 推送策略**：

```python
# 每完成一批段落的润色，推送一个 SSE 事件
async def polish_stream(doc_path: str, ...):
    """SSE 流式润色生成器"""
    # Phase 1: 提取段落
    snapshots = extract_paragraphs(doc_path)
    batches = batch_paragraphs(snapshots)

    yield sse_event("progress", {"total_batches": len(batches), "status": "extracting"})

    # Phase 2: 分批润色
    all_suggestions = []
    for i, batch in enumerate(batches):
        suggestions = await polish_batch(batch, context_paragraphs)
        all_suggestions.extend(suggestions)

        yield sse_event("batch_complete", {
            "batch_index": i,
            "total_batches": len(batches),
            "suggestions": [s.dict() for s in suggestions],
        })

    # Phase 3: 返回完整报告
    report = build_polish_report(all_suggestions, filename)
    yield sse_event("complete", report.dict())
```

**前端渐进式渲染**：

```typescript
// 前端通过 EventSource 接收 SSE
const eventSource = new EventSource('/api/polish?...');

eventSource.addEventListener('batch_complete', (e) => {
    const data = JSON.parse(e.data);
    // 追加新的润色建议到列表
    setSuggestions(prev => [...prev, ...data.suggestions]);
    setProgress(data.batch_index + 1, data.total_batches);
});

eventSource.addEventListener('complete', (e) => {
    const report = JSON.parse(e.data);
    setPolishReport(report);
    setStatus('POLISH_PREVIEW');
});
```

### Decision

使用与现有 AI 功能一致的 SSE 推送模式。每完成一批段落推送一个 `batch_complete` 事件，最终推送 `complete` 事件。前端渐进式追加建议到列表。

### Rationale

1. 复用现有 SSE 基础设施，无需引入 WebSocket 等新技术
2. 批次级推送粒度适中（不像 token 级那样频繁，也不像全部完成才推送那样延迟大）
3. 前端渐进式渲染让用户在等待时就能开始审阅，改善体验

### Alternatives Considered

| 方案 | 评价 |
|------|------|
| WebSocket 双向通信 | 过度设计，润色是单向推送不需要双向 |
| 轮询 `/api/polish/status` | 延迟大，不如 SSE 实时 |
| 全部完成后一次性返回 | 长文档等待时间过长，体验差 |

---

## Research Topic 5: 借鉴的开源项目技术点

### Question

之前分析的 tmp 参考项目中，哪些具体的技术实现可以直接借鉴到润色功能？

### Research

**1. ragflow — 场景化 Prompt 模板系统**

ragflow 的 `paper.py` 能识别论文结构（摘要/正文/致谢/参考文献），不同区域使用不同的处理策略。借鉴到润色功能：
- 摘要段落：更强调精炼度和学术规范
- 正文段落：全面润色（语病 + 用词 + 句式）
- 致谢段落：语气适当正式化但保留个人风格
- 参考文献列表：完全跳过

ragflow 的 `generator.py` 使用模板 + 变量注入的方式构建 Prompt。可参考其设计构建润色 Prompt 模板系统。

**2. awesome-llm-apps — Corrective RAG 模式**

"润色 → 检查语义一致性 → 不一致则标记" 的流程直接对应 Corrective RAG 中的 "检索 → 评估 → 纠正" 模式：
- Polisher = 生成器（生成润色文本）
- Reviewer = 评估器（评估是否保持语义）
- 标记/重试 = 纠正器（对问题建议进行标记或重新生成）

**3. dify — DOCX 段落精确提取**

dify 的 `word_extractor.py` 遍历段落时能正确处理：
- 嵌套表格中的段落
- 超链接 Run（保留 URL 信息）
- 图片占位符

借鉴其遍历逻辑，确保提取时不丢失段落信息。

**4. docling — Pipeline 阶段化设计**

docling 将文档处理分为 `_parse_document()` → `_assemble_document()` → `_enrich_document()` 三阶段。润色流程可参考：
- 提取阶段（parse）→ 润色阶段（enrich）→ 回写阶段（assemble）

**5. unstructured — 元素分类体系**

unstructured 区分 Title / NarrativeText / ListItem / Table / Header 等元素类型。借鉴到润色功能中的段落分类：
- Title → 跳过或仅做简单润色
- NarrativeText → 全面润色
- ListItem → 保留列表格式的润色
- Table → 首期跳过

### Decision

核心借鉴：ragflow 的场景化策略 + awesome-llm-apps 的 Corrective RAG 双 Agent + dify 的段落遍历 + docling 的 Pipeline 阶段化。这些技术点已整合到 spec 的设计方案中。

### Rationale

每个借鉴点都有明确的对应实现位置，不是泛泛的参考而是具体的技术方案迁移。
