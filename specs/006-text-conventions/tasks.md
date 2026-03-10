# Tasks: 通用文本排版习惯检查 — 标点·空格·全半角 + LLM 争议审查

**Input**: Design documents from `/specs/006-text-conventions/`
**Prerequisites**: plan.md ✅, spec.md ✅, data-model.md ✅

**Tests**: Spec Testing Strategy 中要求了后端单元测试和前端测试，故包含测试任务。

**Organization**: Tasks 按用户故事分组。US1（确定性检查）是基础，US2（LLM 审查）和 US3（修复）依赖 US1，US4（前端展示）依赖 US1+US2。

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (规则 & 基础设施)

**Purpose**: YAML 规则扩展 + schemas 扩展 + checker 注册

- [x] T001 [P] 在 `default.yaml` 中新增 `text_conventions` section（11 条子规则全部 enabled: true）— `backend/rules/default.yaml`
- [x] T002 [P] 在 `hit_midterm_report.yaml` 中新增 `text_conventions` section — `backend/rules/hit_midterm_report.yaml`
- [x] T003 [P] 在 `academic_paper.yaml` 中新增 `text_conventions` section — `backend/rules/academic_paper.yaml`
- [x] T004 [P] 在 `gov_document.yaml` 中新增 `text_conventions` section — `backend/rules/gov_document.yaml`
- [x] T005 在 `schemas.py` 中新增 `AiReviewResult`、`DisputedItem`、`TextConventionMeta` 模型；扩展 `CheckItemResult`（id/check_layer/ai_review）、`CheckReport`（text_convention_meta）、`FixRequest`（include_text_fix）、`FixItemResult`（fix_layer）— `backend/api/schemas.py`
- [x] T006 在 `schemas.py` 中新增 AI Review 请求/响应模型（`AiReviewDisputedItem`、`AiReviewConventionsRequest`、`AiReviewConventionsResponse`、`AiReviewItemResult`）— `backend/api/schemas.py`

**Checkpoint**: 所有 YAML 规则有 text_conventions；schemas 扩展完成

---

## Phase 2: User Story 1 — 确定性文本检查 (Priority: P1) 🎯 MVP

**Goal**: 实现 7 类确定性文本检查 + `iter_all_paragraphs()` 段落遍历器

**Independent Test**: 上传含 `（你好`、`。。`、`你 好` 的文档，3 类问题均检出

- [x] T007 [US1] 创建 `text_convention_checker.py` — `backend/scripts/checker/text_convention_checker.py`
  - `ParagraphInfo`、`TextIssue`、`DocumentStats` 数据类
  - `iter_all_paragraphs(doc)`: 遍历主体/表格/脚注/尾注，附加来源标记
  - `run_text_convention_checks(checker, doc, rules)`: 主函数
  - 确定性检查：括号不对称（含相邻段落宽松匹配）、引号不匹配、连续标点（排除 ！！/？？/……）、中文之间多余空格、连续多个空格、行首/行尾空格、全角空格
  - 争议候选：中英文间距不一致（文档级统计 + 位置标记）、全半角标点混用、句末标点缺失
  - 段落级 CJK 占比 < 10% 跳过中文检查；代码样式跳过空格/全半角检查；OMath 跳过；URL/邮箱遮罩
- [x] T008 [US1] 在 `base.py` 的 `run_all_checks()` 中注册文本检查，将结果保存为 `self._text_issues` 和 `self._text_stats` — `backend/scripts/checker/base.py`
- [x] T009 [US1] 修改 `checker_service.py` — `backend/services/checker_service.py`
  - 格式检查项统一标记 `check_layer: "format"`
  - 文本检查项标记 `check_layer: "text_convention"` + 分配 `id: "tc-XXX"`
  - 争议项生成 `DisputedItem` 列表
  - `CheckReport` 附加 `text_convention_meta`

**Checkpoint**: 确定性文本检查功能完整，格式检查无回归

---

## Phase 3: User Story 2 — LLM 争议审查 (Priority: P1)

**Goal**: 实现异步两步 LLM 争议审查（batch + 15s 超时）

**Independent Test**: 争议项经 LLM 审查后返回 confirmed/ignored/uncertain + reason

- [x] T010 [US2] 在 `ai_prompts.py` 新增 Section 4: `REVIEW_CONVENTIONS_SYSTEM_PROMPT` + `build_review_conventions_messages()` — `backend/services/ai_prompts.py`
- [x] T011 [US2] 在 `ai_routes.py` 新增 `POST /api/ai/review-conventions` 端点 — `backend/api/ai_routes.py`
  - batch 模式（多争议项合并为一次 LLM 调用）
  - 15s `asyncio.wait_for` 超时保护
  - LLM 不可用降级（uncertain + "AI 审查不可用"）
  - 超时降级（uncertain + "AI 审查超时"）
  - `_parse_review_response()` 容错解析（未覆盖项返回 uncertain）

**Checkpoint**: AI 审查端点正常工作，超时/不可用降级正确

---

## Phase 4: User Story 3 — 文本排版修复 (Priority: P2)

**Goal**: 实现确定性文本修复 + 修复流程集成

**Independent Test**: `。。` → `。`，`你 好` → `你好`，格式属性不变

- [x] T012 [US3] 创建 `text_convention_fixer.py` — `backend/scripts/text_convention_fixer.py`
  - `TextFixRecord` 数据类
  - 5 类修复：连续标点去重、中文间空格删除、全角空格替换、连续空格合并、行首/行尾空格删除
  - `_apply_text_to_runs()`: Run 级别文本回写（保留格式属性）
  - `run_text_convention_fixes(doc, rules)`: 主函数
- [x] T013 [US3] 修改 `fixer_service.py` 支持 `include_text_fix` 参数 — `backend/services/fixer_service.py`
  - `include_text_fix=True` 时在格式修复后叠加文本修复
  - 文本修复项标记 `fix_layer: "text_convention"`
  - 文本修复失败不影响格式修复结果（try/except 降级）

**Checkpoint**: 文本修复功能完整，修复后格式属性不变

---

## Phase 5: User Story 4 — 前端展示 (Priority: P1)

**Goal**: 前端分层展示 + AI 审查标签 + 异步加载态 + 文本修复开关

**Independent Test**: 同时有格式问题和文本问题的文档，两类分组展示，AI 标签正确

- [x] T014 [P] [US4] 扩展前端类型定义 — `frontend/src/types/index.ts`
  - `AiReviewResult` 接口
  - `CheckItemResult` 新增 id/check_layer/ai_review
  - `DisputedItem`、`TextConventionMeta` 接口
  - `CheckReport` 新增 text_convention_meta
  - `FixItemResult` 新增 fix_layer
- [x] T015 [US4] 新增 `reviewConventions()` API 函数 — `frontend/src/services/api.ts`
- [x] T016 [US4] 修改 `CheckReport.tsx` 实现分层展示 — `frontend/src/components/CheckReport.tsx`
  - 格式检查 vs 通用排版习惯两大区域（各可折叠）
  - 分层统计（格式 vs 排版习惯）
  - 自动发起 AI 审查（useEffect 监听 text_convention_meta）
  - AI 标签（confirmed ✓ 绿色 / ignored ○ 灰色 / uncertain ? 黄色）
  - 点击标签展开 LLM 分析理由
  - AI 审查进行中显示 spinner + "AI 审查中..."
  - 通过 id 匹配合并异步审查结果
  - "包含文本排版修复"开关（默认关闭）
- [x] T017 [US4] 修改 `FixPreview.tsx` 按 `fix_layer` 分组展示修复结果 — `frontend/src/components/FixPreview.tsx`

**Checkpoint**: 前端完整分层展示可用；AI 标签正确显示；修复开关正常工作

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 最终验证和回归测试

- [x] T018 运行完整后端测试套件确认无回归 — `cd backend && python -m pytest tests/ -v`
- [x] T019 运行完整前端测试套件确认无回归 — `cd frontend && npx vitest run`
- [x] T020 按 quickstart.md 执行端到端验证（确定性检查 / AI 审查 / 分层展示 / 文本修复）
- [x] T021 验证所有 4 个 YAML 规则文件均包含 text_conventions section

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖 — 立即开始
- **Phase 2 (US1 确定性检查)**: 依赖 Phase 1（schemas + YAML）
- **Phase 3 (US2 LLM 审查)**: 依赖 Phase 1（schemas）
- **Phase 4 (US3 修复)**: 依赖 Phase 2（text_convention_checker 的共享函数）
- **Phase 5 (US4 前端)**: 依赖 Phase 2 + Phase 3（后端 API 完成）
- **Phase 6 (Polish)**: 依赖全部 Phase 完成

### Parallel Opportunities

```bash
# Phase 1: YAML 文件并行
Task: T001 (default.yaml)
Task: T002 (hit_midterm_report.yaml)
Task: T003 (academic_paper.yaml)
Task: T004 (gov_document.yaml)

# Phase 2 + Phase 3: 可部分并行
Task: T010 (ai_prompts.py — 不依赖 Phase 2)
Task: T011 (ai_routes.py — 不依赖 Phase 2)
```

## Implementation Strategy

### MVP First (Phase 1 + 2: 规则 + 确定性检查)

1. Phase 1: YAML 扩展 + schemas 扩展
2. Phase 2: 文本检查器 + checker 集成
3. **STOP and VALIDATE**: 确定性检查可用，格式检查无回归

### Total Tasks: 21

| 阶段 | 任务数 | 说明 |
|------|--------|------|
| Phase 1 Setup | 6 | YAML + schemas |
| Phase 2 US1 (P1) | 3 | 确定性检查 |
| Phase 3 US2 (P1) | 2 | LLM 审查 |
| Phase 4 US3 (P2) | 2 | 文本修复 |
| Phase 5 US4 (P1) | 4 | 前端展示 |
| Phase 6 Polish | 4 | 验证 |
