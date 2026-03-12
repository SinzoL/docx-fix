# Feature Specification: 模板提取 LLM 智能审核

**Feature Branch**: `009-extract-review`  
**Created**: 2026-03-11  
**Status**: Draft  
**Input**: 模板提取功能使用纯规则驱动的方式，在模板本身存在问题时可能提取出错误信息。需要增加 LLM 审核层，主动识别标题级别错误、特殊颜色字体隐含规则、规则内部矛盾等问题，并以建议的形式呈现给用户。

## 背景与动机

当前 docx-fix 系统的模板提取功能（spec-003）基于 `RuleExtractor` 对 `.docx` 文件的 XML 结构进行**纯规则驱动**的解析，提取 8 个模块（元信息、页面设置、页眉页脚、样式定义、文档结构、编号定义、特殊检查、标题修复）。

这种方式"忠实记录"了模板中的格式定义，但存在以下盲区：

1. **模板本身有错误**：标题级别设置错误（如"第一章 绪论"用了 Heading 3 而非 Heading 1），导致目录生成失败。提取器只会忠实记录这个错误的级别，不会判断其合理性。
2. **特殊颜色字体的隐含规则**：许多模板用红色、蓝色等特殊颜色字体标注说明文字（如"此处应为小四号宋体，1.25 倍行距"）。当前 `_is_instruction_style()` 仅检测样式级别的 `FF0000`/`CC0000`/`FF3333` 三种红色并标记 `should_not_exist=true`，存在两个问题：①未检测 run 级别（直接格式化）的颜色字体；②**未解析特殊颜色文字中包含的格式要求语义**。这些特殊颜色字体可能包含隐含的格式要求，也可能只是普通标注，需要 LLM 智能识别。
3. **规则内部矛盾**：样式定义中 Normal 的字号为 12pt，但 `body_font_consistency` 检查期望的是 10.5pt（小五号），提取器不做交叉验证。
4. **语义合理性判断**：编号定义不完整、样式未覆盖预期的层级等，提取器无法识别。

### 核心设计理念

**LLM 审核不改变原始提取结果**，而是产出一份**独立的"审核建议列表"**。用户可以逐条选择接受或忽略，**默认全部忽略**。只有用户主动点击"接受"后，对应的建议才会合并到最终的 YAML 规则中。

**关键原则**：
- **入口统一、层次分明**：审核入口挂在现有的 `/api/extract-rules` 路由下（`POST /api/extract-rules/review`），保持 API 结构清晰
- **LLM 只做内容评判**：LLM 负责分析问题、描述发现、给出建议内容；ID 生成、格式组装等工程逻辑由后端完成
- **严格控制 LLM 输出格式**：通过精确的 JSON Schema 约束 LLM 输出，后端做二次校验和容错，确保不影响原始提取规则
- **建议可直接融入规则文件**：`suggested_yaml_patch` 以 `section_path`（YAML 节路径）+ `yaml_snippet`（可直接嵌入的 YAML 片段）的方式输出，保证接受后能准确合并到原始 YAML 的正确位置

这种设计保证了：
- 原始提取流程不受任何影响
- LLM 不可用时完全降级（无建议列表）
- 用户对最终规则拥有完全控制权
- 工程稳定性：LLM 输出的任何异常都不会破坏已有功能

## Clarifications

### Session 2026-03-11

- Q: 审核是否与提取同步执行？ → A: 两步分离。提取完成后，前端自动发起审核请求（`POST /api/extract-rules/review`），审核失败不影响提取结果展示。
- Q: LLM 不可用时如何处理？ → A: 审核接口返回空列表 `review_items: []`，前端不展示审核建议区域。
- Q: 建议的默认状态？ → A: 所有建议默认"忽略"状态，用户主动点击"接受"后才生效。
- Q: 审核是否需要流式？ → A: 不需要。审核结果为结构化 JSON，非流式返回。
- Q: 特殊颜色字体文本如何获取？ → A: 在提取阶段增强 `RuleExtractor`，遍历文档段落的每个 run，检测 run 级别和样式级别的颜色（非黑色、非 auto），收集特殊颜色字体段落的文本内容和上下文（段落索引、颜色值、前后段落文本）。
- Q: LLM 输入如何控制？ → A: 不传整个文档，只传：①提取后的 YAML 内容；②特殊颜色字体段落文本列表（含颜色值）；③文档标题结构摘要（标题文字 + 所用样式 + 级别）。

### Session 2026-03-11 (Clarify Round)

- Q1（临时文件生命周期）: → A: **确认**。`review_context` 在提取阶段一次性收集完毕，通过提取响应返回给前端，前端再传给审核接口。不需要后续文件访问。
- Q2（run 级颜色字体检测）: → A: **泛化为"特殊颜色字体"**。不仅限于红色，所有非黑色（非 `000000`、非 `auto`）的颜色字体都需要收集。收集时遍历每个段落的 `runs`，检测 `run.font.color` 和样式级别颜色。这些特殊颜色可能有隐含格式要求含义，也可能没有，由 LLM 智能识别并输出判断结果。
- Q3（`run_extract()` 返回值增强）: → A: **同意**。在 `extract_all()` 执行完后，通过 `extractor` 实例属性 `_colored_text_paragraphs` 和 `_heading_structure` 获取。提取过程中作为实例变量保存。
- Q4（`max_tokens` 设置）: → A: **允许 token 扩展**。审核接口的 `max_tokens` 设为 4096，通过 config.py 新增 `LLM_REVIEW_MAX_TOKENS = 4096` 配置。不限死固定值，后续可按需调整。
- Q5（JSON 解析策略）: → A: **复用现有工具**。项目中已有 markdown 代码块提取的 JSON 解析模式（去除 ` ```json ... ``` ` 包裹），复用同样的策略。
- Q6（`suggested_yaml_patch` 合并策略）: → A: **结构化设计**。LLM 输出 `section_path`（如 `styles.Normal.paragraph`）和 `yaml_snippet`（该路径下的完整 YAML 片段）。后端负责校验路径合法性。前端合并策略：使用 `js-yaml` 解析原始 YAML 和 patch，按路径做 deep merge，合并后重新序列化。如果路径不存在则创建；如果已存在则覆盖对应子节点。冲突时（如类型不兼容）标记该条建议为"无法应用"。
- Q7（审核加载 UI）: → A: 审核请求期间，在 YAML 预览下方展示 "🤖 AI 正在审核提取结果..." 的加载条。审核完成后替换为建议列表或"未发现问题"。
- Q8（YAML 预览更新方式）: → A: **直接替换 `yaml_content` state**。接受建议后，在内存中合并 patch 到原始 YAML，重新渲染整个预览。不做 diff 展示（复杂度高，收益低）。
- Q9（审核建议面板组件设计）: → A: **独立组件** `ExtractReviewPanel.tsx`，通过 props 传入，在 `ExtractResult.tsx` 中引用。保持组件职责清晰。
- Q10（`outline_level` 值域）: → A: 传给 LLM 时做 **+1 转换**并附加说明。如 `outline_level=0` 在 prompt 中标注为"一级标题（outline_level=0, 即 Heading 1）"，减少 LLM 理解偏差。
- Q11（ID 生成策略）: → A: **后端统一生成**，格式 `f"rev-{i+1:03d}"`。LLM 输出中不包含 ID 字段，后端解析 LLM 输出后自动编号。
- Q12（与 008-unified-flow 的关系）: → A: **独立 scope**。审核功能仅在"提取模板"Tab 中生效，不参与 008 的统一检查→修复→润色工作流。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 自动识别模板问题并给出审核建议 (Priority: P1)

用户上传 `.docx` 模板完成规则提取后，系统自动调用 LLM 对提取结果进行智能审核。审核完成后，在提取预览页面下方展示"审核建议"区域，列出 LLM 发现的问题。每条建议包含问题描述、影响的规则位置、建议的修改方案。用户可逐条决定是否接受。

审核覆盖四个维度：
1. **标题级别异常**：检测标题文字与大纲级别不匹配（如"第一章"对应 Heading 3）
2. **特殊颜色字体隐含规则**：识别特殊颜色字体标注中是否包含格式要求，如果有则解析并生成对应规则补丁；如果只是普通标注则忽略
3. **规则内部矛盾**：交叉验证样式定义与一致性检查之间是否存在冲突
4. **综合质量评估**：检测编号定义不完整、样式覆盖不全等问题

**Why this priority**: 这是本 spec 的核心功能。LLM 审核是模板提取从"忠实记录"到"智能识别"的关键升级，也是项目的差异化亮点。

**Independent Test**: 上传一个已知包含标题级别错误和特殊颜色字体说明的模板文件，确认 LLM 审核能正确识别这些问题并给出结构化建议。

**Acceptance Scenarios**:

1. **Given** 用户完成模板提取, **When** 系统自动发起审核请求, **Then** 审核建议区域在提取预览下方展示，显示加载状态（"🤖 AI 正在审核提取结果..."）后渲染建议列表
2. **Given** 模板中 "第一章 绪论" 使用了 Heading 3 样式, **When** LLM 审核, **Then** 产出一条 `heading_error` 类别的建议，描述级别不匹配问题并给出修正方案
3. **Given** 模板中有红色字体写着 "正文部分使用小四号宋体，1.25 倍行距", **When** LLM 审核, **Then** 产出一条 `hidden_rule` 类别的建议，解析出行距规则并生成可直接融入规则文件的 YAML 补丁
4. **Given** 模板中有蓝色字体写着普通注释（无格式要求含义）, **When** LLM 审核, **Then** LLM 判断该文本不含隐含格式要求，不生成建议
5. **Given** Normal 样式定义字号 12pt 但 body_font_consistency 检查期望 10.5pt, **When** LLM 审核, **Then** 产出一条 `contradiction` 类别的建议，指出矛盾并给出解决方案
6. **Given** LLM 审核完成后, **When** 用户查看建议列表, **Then** 所有建议默认为"忽略"状态，需用户主动点击"接受修改"才生效
7. **Given** LLM 审核发现 0 条问题, **When** 审核完成, **Then** 审核区域显示"审核通过，未发现问题"提示

---

### User Story 2 - 接受/忽略审核建议 (Priority: P2)

用户在审核建议列表中可以逐条点击"接受修改"或"忽略"。接受后，建议中的 YAML 补丁会按 `section_path` 合并到提取的 YAML 规则中（前端合并，非后端）。用户也可以撤销接受操作（再次点击变回忽略）。最终保存规则时，只有被接受的建议会被合并。

**Why this priority**: 审核建议的价值必须通过用户交互来兑现。没有接受/忽略机制，建议只是展示，无法影响最终规则。

**Independent Test**: 接受一条审核建议后，查看 YAML 预览是否实时更新；撤销接受后，YAML 恢复原始内容。

**Acceptance Scenarios**:

1. **Given** 审核建议列表中有多条建议, **When** 用户点击某条建议的"接受修改"按钮, **Then** 该建议状态变为"已接受"，YAML 预览区域实时更新（按 section_path 合并 yaml_snippet）
2. **Given** 用户已接受某条建议, **When** 用户再次点击（撤销接受）, **Then** 建议状态恢复为"忽略"，YAML 预览恢复为合并前的内容
3. **Given** 用户接受了 2 条建议、忽略了 1 条, **When** 点击"保存规则", **Then** 保存到 localStorage 的 YAML 内容包含 2 条被接受建议的修改，不包含被忽略的
4. **Given** 审核建议列表底部, **When** 用户点击"全部忽略", **Then** 所有建议恢复为"忽略"状态
5. **Given** 某条建议的 `section_path` 在原始 YAML 中不存在, **When** 用户点击"接受修改", **Then** 自动在 YAML 中创建对应路径并插入补丁

---

### User Story 3 - LLM 不可用时的降级体验 (Priority: P3)

当 DeepSeek API 不可用（网络错误、Key 失效、配置缺失）时，审核功能静默降级：不展示审核建议区域，不影响原有的模板提取和规则保存流程。

**Why this priority**: 容错是必须的，但优先级低于核心功能。

**Independent Test**: 配置错误的 API Key 后上传模板，确认提取功能正常，审核区域不显示或显示"审核不可用"。

**Acceptance Scenarios**:

1. **Given** DeepSeek API 不可用, **When** 前端发起审核请求, **Then** 后端返回 `review_items: []`，前端不展示审核建议区域
2. **Given** DeepSeek API 不可用, **When** 用户完成模板提取, **Then** 提取结果正常展示，保存规则功能正常
3. **Given** API Key 未配置, **When** 审核接口被调用, **Then** 返回 200 + 空审核列表（不返回 500 错误）

---

### Edge Cases

- LLM 审核返回格式不合法时（如 JSON 解析失败），系统应静默降级，不展示审核建议，同时记录后端日志
- LLM 产出的 `yaml_snippet` 在合并到原始 YAML 时发生冲突（如类型不兼容），前端应跳过该条建议并提示"此建议无法应用"
- 审核请求超时（30 秒）时，前端应终止请求并显示"审核超时"，不阻塞提取结果展示
- 模板中无特殊颜色字体、标题结构简单（无明显问题）时，审核可能返回 0 条建议，属于正常情况
- 用户在审核请求尚未完成时就点击"保存规则"，应允许保存（仅包含原始提取结果，不含审核建议）
- LLM 对特殊颜色字体的判断可能存在误判（将普通标注误判为格式要求，或反之），通过默认"忽略"状态和用户手动接受来控制风险

## Requirements *(mandatory)*

### Functional Requirements

#### 后端 — 信息收集增强

- **FR-001**: `RuleExtractor` MUST 在提取过程中遍历文档每个段落的 runs，检测 run 级别和样式级别的特殊颜色字体（非黑色 `000000`、非 `auto`），收集段落文本、颜色值和上下文信息（段落索引、前后段落文本），存入 `_colored_text_paragraphs` 实例属性
- **FR-002**: `RuleExtractor` MUST 在提取过程中额外收集文档标题结构摘要（标题文字、所用样式名、大纲级别、段落索引），存入 `_heading_structure` 实例属性
- **FR-003**: `extractor_service.run_extract()` MUST 在提取完成后从 `extractor` 实例读取 `_colored_text_paragraphs` 和 `_heading_structure`，组装 `review_context` 并返回，供前端传给审核接口

#### 后端 — LLM 审核服务

- **FR-004**: 系统 MUST 新增 `POST /api/extract-rules/review` 端点，挂在 `extract_router` 下保持入口统一，接受提取结果上下文并调用 LLM 进行智能审核
- **FR-005**: 审核服务 MUST 将以下信息传给 LLM：①提取后的 YAML 内容；②特殊颜色字体段落文本列表（含颜色值）；③文档标题结构摘要（标题文字 + 样式 + 级别，级别做 +1 转换附加 Heading N 说明）
- **FR-006**: 后端 MUST 解析 LLM 的 JSON 输出后，统一生成建议 ID（格式 `rev-001`、`rev-002`...），LLM 不负责生成 ID
- **FR-007**: 后端 MUST 对 LLM 输出做二次校验：①JSON 格式合法性；②每条建议的必填字段完整性；③`category` 和 `severity` 值域校验；④`section_path` 路径格式校验。不合法的条目静默丢弃并记录日志
- **FR-008**: LLM 不可用时，审核接口 MUST 返回 200 + 空列表，不返回错误
- **FR-009**: 审核请求 MUST 有 30 秒超时限制

#### 后端 — Prompt 工程

- **FR-010**: system prompt MUST 引导 LLM 聚焦四个审核维度：标题级别异常、特殊颜色字体隐含规则、规则内部矛盾、综合质量评估
- **FR-011**: system prompt MUST 要求 LLM 以指定的 JSON Schema 格式输出审核结果，严格控制输出格式。LLM 输出中**不包含 ID 字段**，仅包含 `category`、`severity`、`description`、`section_path`、`yaml_snippet`、`source_text` 字段
- **FR-012**: system prompt MUST 明确告知 LLM：不要修改原始 YAML，只产出建议性的补丁；`yaml_snippet` 必须是合法 YAML 且可直接融入规则文件对应 `section_path` 下的内容
- **FR-013**: system prompt MUST 告知 LLM：特殊颜色字体可能包含隐含格式要求也可能没有，需要 LLM 自行判断。如果判断有隐含规则则输出 `hidden_rule` 类别建议；如果判断没有则不输出

#### 前端 — 审核建议 UI

- **FR-014**: 前端 MUST 在模板提取完成后自动发起审核请求
- **FR-015**: 审核加载期间 MUST 在 YAML 预览下方展示 "🤖 AI 正在审核提取结果..." 加载状态
- **FR-016**: 审核建议 MUST 以卡片列表形式展示，作为独立组件 `ExtractReviewPanel.tsx`，每张卡片包含：严重程度图标（🔴错误/🟡警告/🔵信息）、问题描述、影响的 YAML 路径、"接受修改"/"忽略"按钮
- **FR-017**: 所有建议 MUST 默认为"忽略"状态
- **FR-018**: 用户点击"接受修改"后，前端 MUST 按 `section_path` 将 `yaml_snippet` deep merge 到原始 YAML 中，YAML 预览实时更新
- **FR-019**: 用户 MUST 能撤销接受操作（恢复原始 YAML）
- **FR-020**: 保存规则时，MUST 只合并被接受的建议

### Key Entities

- **审核建议（ExtractReviewItem）**: 后端组装的单条审核发现，包含：ID（后端生成，如 "rev-001"）、类别（heading_error / hidden_rule / contradiction / quality）、严重程度（error / warning / info）、描述（LLM 的分析文本）、section_path（影响的 YAML 节路径，如 "styles.Normal.paragraph"）、yaml_snippet（可直接融入该路径的 YAML 片段）、source_text（原始段落文本，仅 hidden_rule 类别）
- **特殊颜色字体段落（ColoredTextParagraph）**: 提取阶段收集的特殊颜色字体段落信息，包含：段落索引、段落文本、颜色值（如 "FF0000"）、前一段落文本、后一段落文本
- **标题结构摘要（HeadingStructureItem）**: 提取阶段收集的文档标题信息，包含：段落索引、标题文字、样式名、大纲级别

## API 设计

### POST /api/extract-rules/review — LLM 审核提取结果

> 挂在 `extract_router` 下，保持入口统一。

**请求体**: `application/json`

```json
{
  "yaml_content": "# ============...\nmeta:\n  name: ...\n...",
  "colored_text_paragraphs": [
    {
      "index": 5,
      "text": "（此处填写正文内容，要求小四号宋体，1.25倍行距）",
      "color": "FF0000",
      "prev_text": "一、研究背景",
      "next_text": ""
    },
    {
      "index": 12,
      "text": "注：以下为参考格式",
      "color": "0000FF",
      "prev_text": "参考文献",
      "next_text": "[1] ..."
    }
  ],
  "heading_structure": [
    {
      "index": 0,
      "text": "第一章 绪论",
      "style_name": "Heading 3",
      "outline_level": 2
    },
    {
      "index": 10,
      "text": "1.1 研究背景",
      "style_name": "Heading 4",
      "outline_level": 3
    }
  ]
}
```

**响应** (200 OK):

```json
{
  "review_items": [
    {
      "id": "rev-001",
      "category": "heading_error",
      "severity": "error",
      "description": "\"第一章 绪论\" 使用了 Heading 3 样式（对应三级标题），但根据标题文字中的\"第一章\"判断，这应该是一级标题（Heading 1）。建议修正标题样式映射。",
      "section_path": "structure.heading_style_mapping",
      "yaml_snippet": "level_1: Heading 3",
      "source_text": ""
    },
    {
      "id": "rev-002",
      "category": "hidden_rule",
      "severity": "warning",
      "description": "模板中红色字体标注了格式要求：\"正文部分使用小四号宋体，1.25倍行距\"。当前提取的正文样式中未包含行距规则，建议补充。",
      "section_path": "styles.Normal.paragraph",
      "yaml_snippet": "line_spacing: 300\nline_spacing_rule: auto",
      "source_text": "（此处填写正文内容，要求小四号宋体，1.25倍行距）"
    },
    {
      "id": "rev-003",
      "category": "contradiction",
      "severity": "warning",
      "description": "Normal 样式定义的字号为 12pt（小四号），但 body_font_consistency 检查中未明确指定字号。建议在 body_font_consistency 中明确字号为 12pt 以保持一致。",
      "section_path": "special_checks.body_font_consistency",
      "yaml_snippet": "expected_size_pt: 12.0",
      "source_text": ""
    }
  ]
}
```

**错误响应**:

| HTTP Code | error | message | 触发条件 |
|-----------|-------|---------|----------|
| 400 | `INVALID_REQUEST` | "缺少必要的审核上下文" | yaml_content 为空 |

> 注意：LLM 不可用时不返回错误，而是返回 `review_items: []`。

### POST /api/extract-rules（增强）

在现有响应基础上，新增 `review_context` 字段，供前端在调用审核接口时使用：

```json
{
  "yaml_content": "...",
  "summary": { ... },
  "filename": "模板.docx",
  "review_context": {
    "colored_text_paragraphs": [...],
    "heading_structure": [...]
  }
}
```

> `review_context` 仅当提取成功时才包含。LLM 不可用不影响此字段的生成（它是纯规则提取阶段的产物）。

## 数据模型

### 后端 Schema（新增）

```python
class ColoredTextParagraph(BaseModel):
    """特殊颜色字体段落信息"""
    index: int                     # 段落在文档中的索引
    text: str                      # 特殊颜色字体段落的文本内容
    color: str                     # 颜色值（如 "FF0000"、"0000FF"）
    prev_text: str = ""            # 前一段落文本（上下文）
    next_text: str = ""            # 后一段落文本（上下文）

class HeadingStructureItem(BaseModel):
    """文档标题结构摘要"""
    index: int                     # 段落在文档中的索引
    text: str                      # 标题文字
    style_name: str                # 所用样式名（如 "Heading 1"）
    outline_level: int             # 大纲级别（0=一级，1=二级...）

class ExtractReviewItem(BaseModel):
    """LLM 审核发现的单条建议（后端组装，ID 由后端生成）"""
    id: str                        # 后端生成，如 "rev-001"
    category: str                  # "heading_error" | "hidden_rule" | "contradiction" | "quality"
    severity: str                  # "error" | "warning" | "info"
    description: str               # LLM 的分析描述
    section_path: str              # 影响的 YAML 节路径（如 "styles.Normal.paragraph"）
    yaml_snippet: str = ""         # 可直接融入 section_path 对应位置的 YAML 片段
    source_text: str = ""          # 原始段落文本（仅 hidden_rule 类别）

class ExtractReviewRequest(BaseModel):
    """POST /api/extract-rules/review 请求体"""
    yaml_content: str
    colored_text_paragraphs: list[ColoredTextParagraph] = []
    heading_structure: list[HeadingStructureItem] = []

class ExtractReviewResponse(BaseModel):
    """POST /api/extract-rules/review 响应"""
    review_items: list[ExtractReviewItem]

class ExtractReviewContext(BaseModel):
    """提取响应中的审核上下文"""
    colored_text_paragraphs: list[ColoredTextParagraph] = []
    heading_structure: list[HeadingStructureItem] = []
```

### LLM 输出 Schema（内部，不暴露给 API）

LLM 的 JSON 输出格式（不包含 ID，由后端后处理添加）：

```json
[
  {
    "category": "heading_error",
    "severity": "error",
    "description": "...",
    "section_path": "structure.heading_style_mapping",
    "yaml_snippet": "level_1: Heading 3",
    "source_text": ""
  }
]
```

后端解析后：
1. 遍历数组，为每条建议生成 `id`（`f"rev-{i+1:03d}"`）
2. 校验 `category` ∈ `{heading_error, hidden_rule, contradiction, quality}`
3. 校验 `severity` ∈ `{error, warning, info}`
4. 校验 `section_path` 非空且格式合法（点分路径）
5. 尝试用 `yaml.safe_load()` 校验 `yaml_snippet` 是合法 YAML
6. 不合法条目静默丢弃，记录日志

### 前端类型（新增）

```typescript
interface ExtractReviewItem {
  id: string;
  category: "heading_error" | "hidden_rule" | "contradiction" | "quality";
  severity: "error" | "warning" | "info";
  description: string;
  section_path: string;          // 影响的 YAML 节路径
  yaml_snippet: string;          // 可直接融入对应路径的 YAML 片段
  source_text: string;
}

interface ColoredTextParagraph {
  index: number;
  text: string;
  color: string;                 // 颜色值（如 "FF0000"）
  prev_text: string;
  next_text: string;
}

interface HeadingStructureItem {
  index: number;
  text: string;
  style_name: string;
  outline_level: number;
}

interface ExtractReviewContext {
  colored_text_paragraphs: ColoredTextParagraph[];
  heading_structure: HeadingStructureItem[];
}

// ExtractRulesResponse 扩展
interface ExtractRulesResponse {
  yaml_content: string;
  summary: ExtractRulesSummary;
  filename: string;
  review_context?: ExtractReviewContext;  // 新增
}
```

## 文件结构（新增/修改）

```
docx-fix/
  ├── backend/
  │   ├── scripts/rule_extractor/
  │   │   ├── base.py                  [修改] extract_all 增强：在实例上保存 _colored_text_paragraphs 和 _heading_structure
  │   │   ├── style_extractor.py       [修改] 新增 run 级颜色字体检测和段落文本收集方法
  │   │   └── structure_extractor.py   [修改] 新增标题结构摘要收集方法
  │   ├── services/
  │   │   ├── extractor_service.py     [修改] run_extract 从 extractor 实例读取审核上下文并返回 review_context
  │   │   └── extract_review_service.py [新增] LLM 审核服务（调用 LLM、解析输出、生成 ID、二次校验）
  │   ├── api/
  │   │   ├── extract_routes.py        [修改] 在 extract_router 下新增 POST /extract-rules/review 端点
  │   │   └── schemas.py              [修改] 新增审核相关 Schema
  │   ├── services/
  │   │   └── ai_prompts.py           [修改] 新增审核专用 prompt 模板（REVIEW_EXTRACT_SYSTEM_PROMPT）
  │   └── config.py                    [修改] 新增 LLM_REVIEW_MAX_TOKENS = 4096
  │
  ├── frontend/src/
  │   ├── components/
  │   │   ├── ExtractResult.tsx       [修改] 引入 ExtractReviewPanel 组件
  │   │   └── ExtractReviewPanel.tsx  [新增] 审核建议面板独立组件
  │   ├── services/
  │   │   └── api.ts                  [修改] 新增 reviewExtractRules API 调用
  │   ├── utils/
  │   │   └── yamlMerge.ts            [新增] YAML deep merge 工具函数（section_path + yaml_snippet → 合并到原始 YAML）
  │   └── types/
  │       └── index.ts                [修改] 新增审核相关类型
  │
  └── specs/
      └── 009-extract-review/
          └── spec.md                 [本文件]
```

## LLM Prompt 设计要点

### System Prompt 核心指令

```
你是一个专业的 Word 文档格式规范审核专家。你的任务是审核从 Word 模板中自动提取的格式规则（YAML），
识别其中可能的错误、遗漏和矛盾。

你将收到三类输入：
1. 提取后的 YAML 规则内容
2. 模板中特殊颜色字体段落的文本列表（含颜色值，这些文字可能包含模板作者的格式说明，也可能只是普通标注）
3. 文档的标题结构摘要（标题文字、所用样式、大纲级别，其中 outline_level=0 对应一级标题 Heading 1）

请从以下四个维度进行审核：

【维度一：标题级别异常】
- 检查标题文字是否与其大纲级别匹配
- "第X章" 通常对应一级标题（Heading 1, outline_level=0），"X.X" 通常对应二级标题（Heading 2, outline_level=1）
- 如果发现不匹配，给出具体的修正建议

【维度二：特殊颜色字体隐含规则】
- 分析特殊颜色字体中的文本，判断是否包含隐含的格式要求
- 如果包含格式要求（如字体、字号、行距、缩进、对齐方式等），提取出来并生成对应的 YAML 补丁
- 如果只是普通标注、注释，不含格式要求，则不要生成建议
- 常见的格式说明关键词：字体、字号、号、行距、缩进、对齐、居中、加粗等

【维度三：规则内部矛盾】
- 交叉验证 styles 定义与 special_checks 中的一致性检查
- 检查 page_setup 与 header_footer 的配合是否合理
- 检查 numbering 定义与 structure 中的映射是否一致

【维度四：综合质量评估】
- 检查是否有常见的缺失项（如缺少正文行距规则）
- 检查编号定义是否完整
- 标注其他可疑问题

请严格以 JSON 数组格式输出审核结果，不要输出任何额外文字。每条建议的格式如下：

```json
[
  {
    "category": "heading_error | hidden_rule | contradiction | quality",
    "severity": "error | warning | info",
    "description": "问题描述，使用通俗中文",
    "section_path": "影响的YAML节路径，如 styles.Normal.paragraph",
    "yaml_snippet": "可直接融入 section_path 对应位置的合法 YAML 片段",
    "source_text": "原始段落文本（仅 hidden_rule 类别需要填写，其他为空字符串）"
  }
]
```

约束：
- 不要输出 ID 字段
- yaml_snippet 必须是合法的 YAML 格式，能直接作为 section_path 所指位置的子内容
- 如果没有发现任何问题，输出空数组 []
- 不要修改或重新输出原始 YAML，只输出建议性补丁
```

> 完整 prompt 在实现阶段细化，此处展示设计方向和格式约束。

## Testing Strategy *(mandatory)*

### 后端测试 (pytest)

- `tests/test_extract_review_service.py` — LLM 审核服务单元测试（mock LLM 调用，验证 JSON 解析、ID 生成、二次校验、非法条目过滤）
- `tests/test_extractor_colored_text.py` — RuleExtractor 特殊颜色字体段落收集测试（run 级颜色 + 样式级颜色 + 多种颜色）
- `tests/test_extractor_heading_structure.py` — RuleExtractor 标题结构摘要收集测试
- `tests/test_api_extract_review.py` — POST /api/extract-rules/review API 集成测试（正常审核、LLM 不可用降级、参数校验）

### 前端测试 (Vitest)

- `__tests__/components/ExtractReviewPanel.test.tsx` — 审核建议面板组件测试（渲染、接受/忽略交互、YAML 合并）
- `__tests__/utils/yamlMerge.test.ts` — YAML deep merge 工具函数测试（路径创建、覆盖、冲突处理）

### 回归测试

每完成一个 Task 后，MUST 运行完整的测试套件确保不引入回归问题。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 对于包含标题级别错误的模板，LLM 审核能在 90% 的情况下正确识别错误并给出合理建议
- **SC-002**: 对于包含特殊颜色字体格式说明的模板，LLM 审核能提取出 80% 以上的隐含格式要求
- **SC-003**: 对于不含格式要求的普通颜色标注，LLM 误判率 ≤ 20%
- **SC-004**: 审核请求响应时间 ≤ 30 秒（含 LLM 调用时间）
- **SC-005**: LLM 不可用时，模板提取流程不受任何影响（0 回归）
- **SC-006**: 用户接受审核建议后，合并的 YAML 规则可被 checker.py 正常加载和使用
- **SC-007**: 审核建议的 JSON 结构化解析成功率 ≥ 95%（LLM 输出格式合规）
- **SC-008**: 后端 ID 生成和二次校验 100% 覆盖所有 LLM 输出条目

## 约束与风险

- **LLM 依赖**：审核功能完全依赖 DeepSeek API 可用性，MUST 确保降级方案完备
- **工程稳定性**：LLM 只做内容评判，ID 生成、格式校验等工程逻辑全部由后端完成。LLM 输出的任何异常（格式错误、字段缺失、非法值）都会被后端二次校验拦截，不会影响已有功能
- **LLM 输出格式控制**：通过精确的 JSON Schema + 示例 + 约束在 prompt 中严格控制输出格式；后端做 `yaml.safe_load()` 校验 `yaml_snippet` 合法性，不合法条目静默丢弃
- **Token 成本**：审核输入（YAML + 颜色文字 + 标题结构）可能较长，允许 token 扩展（`LLM_REVIEW_MAX_TOKENS=4096`），超长时做截断。输入侧也做截断控制
- **审核误报**：LLM 可能产出不必要的建议（误报），这是预期行为——通过默认"忽略"状态和用户手动接受来控制
- **YAML 合并安全性**：前端使用 `section_path` + `yaml_snippet` 做 deep merge，合并前后都通过 `yaml.load/dump` 做合法性校验；合并失败的建议标记为"无法应用"，不破坏原始 YAML
- **与 spec-003 的关系**：本 spec 扩展 spec-003 的模板提取功能，不修改其核心提取逻辑，仅增加审核增强层
- **与 spec-008 的关系**：审核功能仅在"提取模板"Tab 中生效，不参与统一工作流
