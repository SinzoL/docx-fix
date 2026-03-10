# Feature Specification: DeepSeek LLM 接入 — 智能检查报告与格式建议

**Feature Branch**: `002-llm-integration`  
**Created**: 2026-03-09  
**Status**: Draft  
**Input**: 接入 DeepSeek 模型（deepseek-chat），通过 OpenAI 兼容 API 为现有文档格式检查系统增加 LLM 智能增强层。

## 背景与动机

当前 docx-fix 系统已具备完整的**规则驱动格式检查与修复**能力（checker.py + fixer.py + rule_extractor.py），所有确定性的格式操作（字体/字号/行距/页边距等）均已覆盖。

LLM 的接入**不是替代**现有确定性引擎，而是作为**上层增强**，补上纯规则无法覆盖的能力：

1. **检查报告自然语言化** — 把技术性的检查结果翻译为人类友好的修改建议
2. ~~**格式要求文档 → YAML 规则** — 从学校发布的自然语言格式说明文档自动生成 YAML 规则文件~~ → **已迁移至 [spec-003 模板提取与规则管理](../003-template-extraction/spec.md)**
3. **交互式格式问答** — 用户对检查结果有疑问时可即时提问

## Clarifications

### Session 2026-03-09

- Q: LLM 提供商？ → A: DeepSeek（deepseek-chat），通过 OpenAI 兼容 API 调用（`https://api.deepseek.com/v1`），使用 `openai` Python SDK。
- Q: API Key 管理？ → A: 后端通过环境变量读取（`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`），在 `docx-fix/backend/.env` 中配置。
- Q: LLM 调用是否阻塞？ → A: 报告总结使用 **流式 SSE** 返回（streaming），前端逐字渲染；规则生成使用非流式调用。
- Q: 成本控制？ → A: 对单次请求的 token 数做上限约束（max_tokens=2048），system prompt 保持精简。
- Q: 容错策略？ → A: LLM 调用失败时不影响主流程，报告总结区域显示"AI 总结暂不可用"，检查结果本身正常展示。

## 技术方案

### 架构设计

```
用户上传 docx → checker.py（确定性检查）→ CheckReport JSON
                                                  ↓
                                        ┌─────────────────────┐
                                        │  LLM 增强层（新增）  │
                                        │  ├─ 报告 AI 总结     │ → SSE 流式返回
                                        │  ├─ 格式问答        │ → SSE 流式返回
                                        │  └─ 规则生成        │ → JSON 返回
                                        └─────────────────────┘
```

### 依赖

- **后端**: `openai>=1.0.0`（Python SDK，兼容 DeepSeek API）
- **前端**: 无新依赖（使用原生 `EventSource` / `fetch` + `ReadableStream` 处理 SSE）

### 环境变量（后端 .env）

```env
DEEPSEEK_API_KEY=sk-879761b4e65347c9aa8cd1ecd4cef368
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 检查报告 AI 总结 (Priority: P1)

用户上传 docx 文件并完成格式检查后，在检查报告页面顶部自动显示一段 **AI 生成的自然语言总结**，将技术性的检查结果（如"Heading 1 字号当前=16.0磅, 要求=18.0磅"）翻译为通俗易懂的修改建议（如"所有一级标题字号偏小，请改为小二号(18磅)"）。总结内容以 SSE 流式方式逐字呈现，支持 Markdown 格式渲染。

**Why this priority**: 这是 LLM 接入最核心的价值——降低用户理解门槛。很多用户不懂"磅"、"行距值300"、"outlineLevel"这些技术术语。

**Independent Test**: 上传一个有多项格式问题的 docx 文件，检查完成后 AI 总结区域应在 3 秒内开始显示流式文字，总结内容覆盖主要问题类别，语言通俗无术语。

**Acceptance Scenarios**:

1. **Given** 用户完成格式检查且报告中有 FAIL/WARN 项, **When** 检查报告渲染完成, **Then** 页面顶部"AI 总结"卡片区域自动开始流式加载 AI 生成的文字总结
2. **Given** AI 总结正在流式加载, **When** 用户看到内容, **Then** 文字逐字/逐句出现（SSE 流式），支持 Markdown 渲染（加粗、列表等），同时显示"AI 正在分析..."加载指示器
3. **Given** AI 总结加载完成, **When** 用户阅读总结, **Then** 总结内容简洁（不超过 300 字），覆盖主要问题分类（如"字体问题 X 处、页面设置 X 处"），给出具体修改建议，不含技术术语
4. **Given** DeepSeek API 不可用（网络错误、Key 失效等）, **When** 系统尝试调用 LLM, **Then** AI 总结区域显示"AI 总结暂不可用"提示，不影响检查报告的正常展示
5. **Given** 检查报告全部为 PASS, **When** 检查完成, **Then** AI 总结区域显示一句简短的"恭喜"提示，不做冗长分析

---

### User Story 2 - 格式问答（对话式咨询） (Priority: P2)

在检查报告页面，用户可以点击"问一问"按钮打开对话面板，针对检查结果进行提问（如"为什么标题编号显示的是 1. 而不是 1？"、"图表标题应该放在上面还是下面？"）。系统将检查报告上下文 + 用户问题发送给 LLM，返回流式回答。

**Why this priority**: 用户看到报告后最常见的反应是"为什么"和"怎么办"，问答功能直接满足这一需求。

**Independent Test**: 在检查报告页面打开对话面板，输入一个格式相关问题，确认 AI 回答在 3 秒内开始流式显示，内容与当前文档检查结果相关。

**Acceptance Scenarios**:

1. **Given** 用户在检查报告页面, **When** 点击"问一问"按钮, **Then** 页面右侧弹出对话面板，包含输入框和发送按钮
2. **Given** 对话面板已打开, **When** 用户输入问题并发送, **Then** AI 基于当前检查报告上下文给出流式回答，支持 Markdown 渲染
3. **Given** 用户提问与格式无关（如"今天天气怎样"）, **When** AI 收到问题, **Then** AI 礼貌回绝并引导用户提问格式相关问题
4. **Given** 对话面板中已有对话历史, **When** 用户继续提问, **Then** AI 能参考之前的对话上下文进行回答（多轮对话）
5. **Given** LLM API 不可用, **When** 用户发送问题, **Then** 显示"AI 暂不可用，请稍后再试"的错误提示

---

### User Story 3 - 自然语言格式要求生成 YAML 规则 (Priority: P3)

> **⚠️ 已迁移至 [spec-003 模板提取与规则管理](../003-template-extraction/spec.md) User Story 3**
>
> 本 User Story 的完整定义、Acceptance Scenarios 和实现计划已整合到 spec-003 的规则管理体系中，
> 以便与模板提取功能统一管理。spec-002 仅保留 LLM API 端点（`POST /api/ai/generate-rules`）的后端实现。

---

## API 设计

### 1. POST /api/ai/summarize — AI 总结检查报告（SSE 流式）

**请求体**:
```json
{
  "session_id": "xxx",
  "check_report": { ... }   // CheckReport 完整 JSON
}
```

**响应**: `text/event-stream` (SSE)
```
data: {"token": "你的"}
data: {"token": "论文"}
data: {"token": "存在"}
...
data: {"token": "", "done": true}
```

### 2. POST /api/ai/chat — 格式问答（SSE 流式）

**请求体**:
```json
{
  "session_id": "xxx",
  "messages": [
    {"role": "user", "content": "为什么标题编号显示的是 1. 而不是 1？"}
  ],
  "check_report": { ... }   // 可选，首次发送即可
}
```

**响应**: `text/event-stream` (SSE)
```
data: {"token": "标题编号"}
data: {"token": "显示为"}
...
data: {"token": "", "done": true}
```

### 3. POST /api/ai/generate-rules — 从文本生成 YAML 规则

**请求体**:
```json
{
  "text": "正文用小四号宋体，1.25倍行距...",
  "name": "我的学校格式规则"
}
```

**响应**:
```json
{
  "yaml_content": "meta:\n  name: ...",
  "warnings": ["推断：英文字体默认使用 Times New Roman"],
  "rule_id": "generated_xxx"
}
```

## 文件结构（新增/修改）

```
docx-fix/backend/
  ├── services/
  │   ├── llm_service.py        [新增] LLM 调用封装（OpenAI SDK 兼容 DeepSeek）
  │   ├── ai_prompts.py         [新增] system prompt 模板
  │   └── ...
  ├── api/
  │   ├── routes.py             [修改] 新增 /api/ai/* 路由
  │   ├── ai_routes.py          [新增] AI 相关路由（分离）
  │   └── schemas.py            [修改] 新增 AI 相关 schema
  ├── .env                      [新增] DeepSeek 环境变量
  └── requirements.txt          [修改] 新增 openai 依赖

docx-fix/frontend/src/
  ├── components/
  │   ├── AiSummary.tsx         [新增] AI 总结卡片组件（流式渲染）
  │   ├── AiChatPanel.tsx       [新增] 对话面板组件
  │   ├── CheckReport.tsx       [修改] 嵌入 AiSummary 和对话入口
  │   └── ...
  ├── services/
  │   ├── api.ts                [修改] 新增 AI API 调用
  │   ├── sse.ts                [新增] SSE 流式请求工具函数
  │   └── ...
  └── types/
      └── index.ts              [修改] 新增 AI 相关类型
```

## 实现计划

| 序号 | 任务 | 依赖 | 预估 |
|------|------|------|------|
| 1 | 后端 `llm_service.py` — DeepSeek API 封装（流式/非流式） | 无 | — |
| 2 | 后端 `ai_prompts.py` — system prompt 模板 | 无 | — |
| 3 | 后端 `ai_routes.py` — SSE 流式端点 + JSON 端点 | 1, 2 | — |
| 4 | 后端 schemas + routes 集成 | 3 | — |
| 5 | 前端 `sse.ts` — SSE 流式请求工具 | 无 | — |
| 6 | 前端 `AiSummary.tsx` — AI 总结卡片 | 5 | — |
| 7 | 前端 `AiChatPanel.tsx` — 对话面板 | 5 | — |
| 8 | 前端集成到 CheckReport | 6, 7 | — |
| 9 | 端到端测试 | 全部 | — |

## 约束与风险

- **API 限流**: DeepSeek API 有 RPM 限制，需在后端做基本的速率保护
- **API Key 安全**: Key 仅存在后端环境变量中，绝不暴露给前端
- **内容安全**: system prompt 限定 AI 只回答格式相关问题，拒绝无关话题
- **降级策略**: LLM 功能全部可降级——API 不可用时主流程不受影响
