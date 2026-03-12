# Implementation Plan: 模板提取 LLM 智能审核

**Branch**: `009-extract-review` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-extract-review/spec.md`

## Summary

为模板提取功能新增 LLM 智能审核层。提取完成后，系统自动调用 DeepSeek API 对提取结果进行四维度审核（标题级别异常、特殊颜色字体隐含规则、规则内部矛盾、综合质量评估），产出独立的审核建议列表。用户可逐条接受或忽略建议，接受后 YAML 补丁自动合并到规则文件中。LLM 只做内容评判，ID 生成和格式校验由后端完成，确保工程稳定性。

## Technical Context

**Language/Version**: Python ≥ 3.12（后端）、TypeScript 5.x（前端）  
**Primary Dependencies**:
- 后端: FastAPI, python-docx, lxml, pyyaml, openai（已有）
- 前端: React 18, TDesign React v1.12.0, TailwindCSS 3.4.17, Vite, js-yaml
**Storage**: 无新增持久化需求（审核结果为一次性数据，前端内存中管理）  
**Testing**: pytest（后端）、Vitest + @testing-library/react（前端）  
**Target Platform**: Web 应用（macOS/Linux/Windows 浏览器）  
**Project Type**: Web 应用（FastAPI 后端 + React SPA 前端）  
**Performance Goals**: 审核请求响应时间 ≤ 30 秒（含 LLM 调用）  
**Constraints**: LLM 不可用时完全降级、LLM 输出需后端二次校验、审核不影响原始提取结果  
**Scale/Scope**: 单次审核输入 ≤ 4096 token（YAML + 颜色文字 + 标题结构），单次审核输出 ≤ 4096 token

## Constitution Check

*GATE: Must pass before implementation.*

| 原则 | 状态 | 说明 |
|------|------|------|
| **I. 规则驱动** | ✅ PASS | 审核建议的 `yaml_snippet` 可直接融入 YAML 规则文件，与现有 checker/fixer 引擎兼容 |
| **II. 只改格式，不动内容** | ✅ PASS | 本 spec 不涉及文档修改，仅审核已提取的格式规则 |
| **III. 检查与修复分离** | ✅ PASS | 审核是独立的建议层，不修改检查/修复逻辑 |
| **IV. Word XML 精确操作** | ✅ PASS | 特殊颜色字体收集基于 run 级 XML 解析（`run.font.color`），遵循精确操作原则 |
| **V. 双入口：CLI + Web** | ✅ PASS | 信息收集增强在 `RuleExtractor`（核心引擎），审核服务在 `backend/services/`，API 在 `backend/api/`，遵循共享模式 |
| **VI. 简洁优先** | ✅ PASS | 无新依赖（复用 openai）；前端新增 js-yaml（必要依赖，做 YAML deep merge）；审核结果不持久化 |
| **VII. 安全防御** | ✅ PASS | 审核接口接受 JSON body（非文件上传），无路径穿越风险；LLM 输出经后端二次校验，`yaml.safe_load()` 防注入 |

**Gate Result**: ✅ 全部通过，无违规项。

## Project Structure

### Documentation (this feature)

```text
specs/009-extract-review/
├── plan.md              # This file
├── spec.md              # Feature specification (已完成)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# 后端（Python / FastAPI）
backend/
├── scripts/rule_extractor/
│   ├── base.py                  [修改] extract_all 增强：保存 _colored_text_paragraphs 和 _heading_structure 实例属性
│   ├── style_extractor.py       [修改] 新增 run 级特殊颜色字体检测和段落文本收集
│   └── structure_extractor.py   [修改] 新增标题结构摘要收集方法
├── services/
│   ├── extractor_service.py     [修改] run_extract 返回 review_context
│   ├── extract_review_service.py [新增] LLM 审核服务（调用 LLM → 解析 JSON → 生成 ID → 二次校验）
│   ├── llm_service.py           [不变] 复用现有 LLM 调用封装
│   └── ai_prompts.py            [修改] 新增 REVIEW_EXTRACT_SYSTEM_PROMPT
├── api/
│   ├── extract_routes.py        [修改] 新增 POST /extract-rules/review 端点
│   └── schemas.py               [修改] 新增审核相关 Schema
├── config.py                    [修改] 新增 LLM_REVIEW_MAX_TOKENS = 4096
└── tests/
    ├── test_extract_review_service.py   [新增] 审核服务单元测试
    ├── test_extractor_colored_text.py   [新增] 特殊颜色字体收集测试
    ├── test_extractor_heading_structure.py [新增] 标题结构摘要测试
    └── test_api_extract_review.py       [新增] 审核 API 集成测试

# 前端（React + TypeScript）
frontend/src/
├── components/
│   ├── ExtractResult.tsx       [修改] 引入 ExtractReviewPanel
│   └── ExtractReviewPanel.tsx  [新增] 审核建议面板独立组件
├── services/
│   └── api.ts                  [修改] 新增 reviewExtractRules API 调用
├── utils/
│   └── yamlMerge.ts            [新增] YAML deep merge 工具函数
├── types/
│   └── index.ts                [修改] 新增审核相关类型
└── __tests__/
    ├── components/
    │   └── ExtractReviewPanel.test.tsx  [新增]
    └── utils/
        └── yamlMerge.test.ts           [新增]
```

**Structure Decision**: 遵循现有 Web 应用结构。后端审核服务作为新增 service（`extract_review_service.py`），API 端点挂在现有 `extract_router` 下保持入口统一。前端审核面板作为独立组件，YAML 合并逻辑抽取为工具函数。

---

## Phase 分解概览

本 plan 分为 3 个 Phase，按 spec 中的 User Story 优先级递进：

### Phase 1: 后端信息收集增强 + LLM 审核服务

> **目标**：在 RuleExtractor 提取过程中收集审核所需的上下文信息（特殊颜色字体段落、标题结构摘要），实现 LLM 审核服务和 API 端点。

**涉及文件**:
- `backend/scripts/rule_extractor/base.py` — 增强 `extract_all()` 保存实例属性
- `backend/scripts/rule_extractor/style_extractor.py` — 新增特殊颜色字体段落收集
- `backend/scripts/rule_extractor/structure_extractor.py` — 新增标题结构摘要收集
- `backend/services/extractor_service.py` — `run_extract()` 返回 `review_context`
- `backend/api/schemas.py` — 新增 6 个 Schema
- `backend/config.py` — 新增 `LLM_REVIEW_MAX_TOKENS`
- `backend/services/ai_prompts.py` — 新增审核专用 prompt
- `backend/services/extract_review_service.py` — 新增审核服务（核心）
- `backend/api/extract_routes.py` — 新增 `POST /extract-rules/review`

**完成标准**:
- `RuleExtractor` 实例在 `extract_all()` 后拥有 `_colored_text_paragraphs` 和 `_heading_structure` 属性
- `POST /api/extract-rules` 响应新增 `review_context` 字段
- `POST /api/extract-rules/review` 能正确调用 LLM、解析输出、生成 ID、二次校验
- LLM 不可用时返回 `review_items: []`

### Phase 2: 前端审核建议 UI

> **目标**：在提取结果页面下方展示审核建议面板，支持接受/忽略建议，YAML 实时合并预览。

**涉及文件**:
- `frontend/src/types/index.ts` — 新增审核相关类型
- `frontend/src/services/api.ts` — 新增 `reviewExtractRules()` API 调用
- `frontend/src/utils/yamlMerge.ts` — YAML deep merge 工具函数
- `frontend/src/components/ExtractReviewPanel.tsx` — 审核建议面板组件
- `frontend/src/components/ExtractResult.tsx` — 集成审核面板

**完成标准**:
- 提取完成后自动发起审核请求，展示加载状态
- 审核建议以卡片列表展示，支持接受/忽略/撤销
- 接受建议后 YAML 预览实时更新
- 保存规则时只合并被接受的建议

### Phase 3: 降级体验 + 测试 + 收尾

> **目标**：完善 LLM 不可用时的降级体验，编写测试用例，边界情况处理。

**涉及文件**:
- 后端测试文件 × 4
- 前端测试文件 × 2
- 边界情况修补

**完成标准**:
- LLM 不可用时，提取流程 0 回归
- 审核超时、JSON 解析失败、YAML 合并冲突等边界情况均有覆盖
- 所有测试通过

---

## 关键设计决策

### 1. LLM 只做内容评判，后端做工程逻辑

LLM 输出不包含 ID 字段，后端解析后统一生成 `rev-001`、`rev-002` 格式的 ID。后端还负责：
- JSON 格式校验
- `category` / `severity` 值域校验
- `section_path` 路径格式校验
- `yaml_snippet` 合法性校验（`yaml.safe_load()`）
- 不合法条目静默丢弃

### 2. 特殊颜色字体泛化检测

不仅限红色，所有非黑色（非 `000000`、非 `auto`）的 run 级和样式级颜色字体都需要收集。LLM 自行判断是否包含隐含格式要求。

### 3. YAML 补丁结构化设计

每条审核建议包含 `section_path`（如 `styles.Normal.paragraph`）和 `yaml_snippet`（该路径下的 YAML 片段）。前端使用 js-yaml 解析后按路径做 deep merge，保证补丁能准确融入规则文件的正确位置。

### 4. 审核入口统一

`POST /api/extract-rules/review` 挂在 `extract_router` 下，与 `POST /api/extract-rules` 保持路由层级一致。

---

## Complexity Tracking

> 无 Constitution 违规项需要解释。

---

## 风险关注点

1. **LLM 输出格式稳定性**：DeepSeek 可能不严格遵守 JSON Schema，需要 prompt 中给出精确示例和严格约束。后端的二次校验是最后防线。
2. **YAML deep merge 复杂度**：前端 `section_path` 解析和 deep merge 需要处理多种边界情况（路径不存在→创建、类型冲突→标记无法应用）。
3. **Token 用量**：复杂模板的 YAML 可能较长，需要做输入截断控制，确保不超过 LLM 上下文窗口。
4. **run 级颜色检测性能**：遍历所有段落的所有 run 可能增加提取时间。预期影响较小（遍历是 O(n)），但需要验证。

... EOF no more lines ...
