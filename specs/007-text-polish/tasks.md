# Tasks: 内容润色 — LLM 驱动的学术文本表达优化

**Input**: Design documents from `/specs/007-text-polish/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Spec Testing Strategy 中明确要求了后端单元测试（段落提取、润色引擎、回写、Diff）和前端测试（PolishPanel、PolishPreview），故包含测试任务。

**Organization**: Tasks 按用户故事分组。US1（段落润色）是核心基础，US2（预览审阅）和 US3（格式保留回写）均为 P1 但关注不同层面，US4（双 Agent）为 P2 增强，US5（前端入口）为 P1 前端。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Project Structure)

**Purpose**: 创建 polisher/ 子包骨架、API 路由骨架和前端类型定义

- [ ] T001 [P] 创建 `backend/scripts/polisher/` 子包目录和 `__init__.py`，导出 TextExtractor、PolishEngine、DiffCalculator、TextWriter — `backend/scripts/polisher/__init__.py`
- [ ] T002 [P] 在 `backend/api/schemas.py` 中新增润色相关 Pydantic Schema（ChangeDetailSchema、PolishSuggestionSchema、PolishSummarySchema、PolishReportSchema、PolishApplyRequestSchema、PolishApplyResponseSchema）— `backend/api/schemas.py`
- [ ] T003 [P] 在 `frontend/src/types/index.ts` 中新增润色相关类型定义（PolishChangeType、ChangeDetail、PolishSuggestion、PolishSummary、PolishReport、PolishApplyRequest、PolishApplyResponse）+ 扩展 AppState 新增 "POLISHING" | "POLISH_PREVIEW" | "POLISH_APPLYING" — `frontend/src/types/index.ts`

**Checkpoint**: 所有骨架文件创建完成；现有测试不受影响

---

## Phase 2: Foundational (核心模块)

**Purpose**: 实现段落提取器和 Diff 计算器，这是 US1 和 US3 的共同前置

**⚠️ CRITICAL**: 这两个模块是所有用户故事的基础

- [ ] T004 [P] 实现 TextExtractor 类 — `backend/scripts/polisher/text_extractor.py`
  - ParagraphSnapshot 和 RunInfo 数据类定义
  - `extract_paragraphs(doc)`: 遍历 doc.paragraphs，对每个段落分类和记录 Run 信息
  - 不可润色段落识别：TOC、图注、表注、公式（OMath）、参考文献、短文本、空段落
  - `get_polishable_paragraphs()`: 返回可润色段落
  - `batch_paragraphs(snapshots, batch_size)`: 分批逻辑
- [ ] T005 [P] 实现 DiffCalculator 类 — `backend/scripts/polisher/diff_calculator.py`
  - `compute_diff(original, polished)`: 基于 difflib.SequenceMatcher 的字级别 diff
  - `compute_run_mapping(runs_info, original, polished)`: 将字符级 diff 映射到 Run 边界
  - DiffOperation 和 RunModification 数据类定义
- [ ] T006 [P] 创建段落提取测试 — `backend/tests/test_text_extractor.py`
  - 正常段落正确提取
  - TOC/图注/表注/公式/参考文献段落被跳过
  - 短文本（< 5 字符）被跳过
  - Run 信息完整记录（偏移量正确）
  - 分批逻辑（batch_size=5）
- [ ] T007 [P] 创建 Diff 计算测试 — `backend/tests/test_diff_calculator.py`
  - 相同文本返回空 diff
  - 单字替换正确识别
  - 多处修改正确识别
  - 中英文混合文本处理
  - Run 映射：修改在单 Run 内 / 跨 Run
- [ ] T008 运行测试验证基础模块 — `cd backend && python -m pytest tests/test_text_extractor.py tests/test_diff_calculator.py -v`

**Checkpoint**: TextExtractor 和 DiffCalculator 功能完整，测试全部通过

---

## Phase 3: User Story 1 — 段落级文本润色 (Priority: P1) 🎯 MVP

**Goal**: 实现 LLM 驱动的段落级文本润色，分批处理 + SSE 流式返回

**Independent Test**: 上传包含语病段落的文档，系统返回润色建议

### Tests for User Story 1

- [ ] T009 [US1] 创建润色引擎测试（mock LLM）— `backend/tests/test_polish_engine.py`
  - mock LLM 返回正确的润色结果
  - 无需修改的段落返回 modified=false
  - LLM 返回异常 JSON 时重试
  - 重试失败时跳过并记录 warning
  - 上下文窗口正确构建（前后各 2 段）
  - SSE 事件序列正确（progress → batch_complete × N → complete）

### Implementation for User Story 1

- [ ] T010 [US1] 在 `ai_prompts.py` 新增 Section 5: Polisher Agent Prompt + `build_polish_messages()` — `backend/services/ai_prompts.py`
  - POLISH_SYSTEM_PROMPT: 能力范围 + 严格约束 + JSON 输出格式
  - build_polish_messages(): 构建包含上下文窗口的消息列表
- [ ] T011 [US1] 实现 PolishEngine 类 — `backend/scripts/polisher/polish_engine.py`
  - PolishSuggestion 和 ChangeDetail 数据类定义
  - `__init__(enable_reviewer, batch_size, context_window)`
  - `polish_batch(batch, all_paragraphs)`: 单批润色（调用 Polisher Agent + 解析 JSON 响应）
  - `_call_polisher(batch, context)`: LLM 调用（带重试 MAX_RETRIES=2）
  - `_build_context(target_idx, all_paragraphs, window)`: 上下文窗口构建
  - `polish_document(snapshots)`: SSE 流式生成器（yield progress/batch_complete/complete 事件）
- [ ] T012 [US1] 运行润色引擎测试 — `cd backend && python -m pytest tests/test_polish_engine.py -v`

**Checkpoint**: PolishEngine 可以分批调用 LLM 润色段落，返回 PolishSuggestion 列表

---

## Phase 4: User Story 3 — 格式保留回写 (Priority: P1)

**Goal**: 实现润色文本的精确回写，保留所有 Run 格式属性

**Independent Test**: 回写修改后，段落的加粗/斜体/字体等格式不变

### Tests for User Story 3

- [ ] T013 [US3] 创建格式保留回写测试 — `backend/tests/test_text_writer.py`
  - 单 Run 段落直接替换 text
  - 多 Run 同格式合并到第一个 Run
  - 多 Run 不同格式使用字符对齐
  - 仅回写接受的建议
  - 未修改段落完全不变
  - 备份文件自动创建

### Implementation for User Story 3

- [ ] T014 [US3] 实现 TextWriter 类 — `backend/scripts/polisher/text_writer.py`
  - `__init__(doc)`
  - `apply_suggestions(suggestions, snapshots)`: 遍历接受的建议并调用 _write_paragraph
  - `_write_paragraph(paragraph, original_text, polished_text, runs_info)`: 分层回写策略
    - 单 Run → 直接替换 text
    - 多 Run 同格式 → 合并到第一个 Run
    - 多 Run 不同格式 → 使用 DiffCalculator.compute_run_mapping 进行字符对齐
  - `_all_runs_same_format(runs)`: 检查所有 Run 格式是否相同
  - `save(output_path, backup_suffix)`: 保存并自动备份
- [ ] T015 [US3] 运行回写测试 — `cd backend && python -m pytest tests/test_text_writer.py -v`

**Checkpoint**: TextWriter 可以正确回写润色文本，保留格式属性

---

## Phase 5: User Story 4 — 双 Agent 语义守护 (Priority: P2)

**Goal**: 实现 Reviewer Agent 审核润色结果的语义一致性

**Independent Test**: Reviewer 能检测出语义偏移并标记

### Implementation for User Story 4

- [ ] T016 [US4] 在 `ai_prompts.py` 新增 Section 6: Reviewer Agent Prompt + `build_reviewer_messages()` — `backend/services/ai_prompts.py`
  - REVIEWER_SYSTEM_PROMPT: 语义一致性判断标准
  - build_reviewer_messages(): 构建原文+润色后文本的审核请求
- [ ] T017 [US4] 在 PolishEngine 中集成 Reviewer Agent — `backend/scripts/polisher/polish_engine.py`
  - `_call_reviewer(original_texts, polished_texts)`: LLM 调用
  - 在 `polish_batch()` 中，如果 `enable_reviewer=True`，调用 reviewer 并合并结果
  - 语义偏移标记: `suggestion.semantic_warning = True`
- [ ] T018 [US4] 更新 test_polish_engine.py 新增 reviewer 相关测试 — `backend/tests/test_polish_engine.py`
  - reviewer 检测到语义偏移时标记 warning
  - reviewer 判断语义不变时不标记
  - reviewer 调用失败时不影响润色结果

**Checkpoint**: 双 Agent 机制正常工作，语义偏移能被检测并标记

---

## Phase 6: Backend API + Service (后端集成)

**Purpose**: 将核心模块通过 Service 层和 API 路由暴露为 REST 接口

- [ ] T019 实现 polisher_service.py — `backend/services/polisher_service.py`
  - `async polish_file(file_path, session_id, enable_reviewer)`: 编排提取→润色→报告
  - `async apply_polish(session_id, accepted_indices)`: 应用润色修改
  - `get_polished_file_path(session_id)`: 获取润色后文件路径
  - Session 管理（存储 PolishReport + ParagraphSnapshot 到内存/临时文件）
- [ ] T020 实现 polish_routes.py — `backend/api/polish_routes.py`
  - `POST /api/polish`: 上传文件 + SSE 流式润色（复用现有文件上传逻辑）
  - `POST /api/polish/apply`: 应用润色修改
  - `GET /api/polish/download/{session_id}`: 下载润色后文件
  - 安全校验: session_id UUID 格式、文件类型检查
- [ ] T021 在 app.py 中注册 polish_routes 蓝图 — `backend/app.py`
- [ ] T022 运行全量后端测试 — `cd backend && python -m pytest tests/ -v`

**Checkpoint**: 3 个润色 API 端点正常工作，SSE 流式推送正确

---

## Phase 7: User Story 5 + User Story 2 — 前端组件 (Priority: P1)

**Goal**: 实现"内容润色"Tab 入口 + 润色预览 Diff 对比 + 接受/拒绝交互

**Independent Test**: 用户可以完成完整的润色流程（上传→润色→预览→接受/拒绝→下载）

### Implementation

- [ ] T023 [US5] 实现 PolishPanel.tsx — `frontend/src/components/PolishPanel.tsx`
  - 文件上传区域（复用现有上传样式）
  - SSE 连接管理（接收 progress/batch_complete/complete 事件）
  - 进度条显示（当前批次/总批次）
  - 渐进式渲染（每收到 batch_complete 追加建议到列表）
  - 错误处理（LLM 不可用提示）
- [ ] T024 [US2] 实现 PolishPreview.tsx — `frontend/src/components/PolishPreview.tsx`
  - Diff 对比视图（原文红色/删除，润色绿色/新增）
  - 逐条 ✅ 接受 / ❌ 拒绝按钮
  - "全部接受" / "全部拒绝"按钮
  - 按修改类型筛选（grammar/wording/punctuation/structure/academic）
  - 修改说明展开/折叠
  - 语义偏移 ⚠️ 标记展示
  - 汇总统计（顶部）
  - "应用选中的修改并下载"按钮
- [ ] T025 [US5] 修改 UploadPanel.tsx 新增"内容润色"Tab — `frontend/src/components/UploadPanel.tsx`
  - 顶部 Tab 切换: "格式检查"（默认）| "内容润色"
  - 切换到"内容润色"时显示 PolishPanel
  - 状态隔离: 两个 Tab 的状态互不影响
- [ ] T026 [P] 创建 PolishPanel.test.tsx — `frontend/src/__tests__/components/PolishPanel.test.tsx`
  - Tab 切换正确
  - 上传触发润色 API
  - 进度条正确显示
- [ ] T027 [P] 创建 PolishPreview.test.tsx — `frontend/src/__tests__/components/PolishPreview.test.tsx`
  - Diff 对比正确渲染
  - 接受/拒绝状态切换
  - 筛选功能
  - 下载按钮状态
- [ ] T028 运行全量前端测试 — `cd frontend && npx vitest run`

**Checkpoint**: 前端完整润色流程可用

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 最终验证、回归测试和端到端验证

- [ ] T029 运行完整后端测试套件确认无回归 — `cd backend && python -m pytest tests/ -v`
- [ ] T030 运行完整前端测试套件确认无回归 — `cd frontend && npx vitest run`
- [ ] T031 按 quickstart.md 执行端到端验证（段落提取 / LLM 润色 / Diff 预览 / 接受拒绝 / 格式保留回写 / 下载）
- [ ] T032 更新 polisher/__init__.py 确保所有对外接口正确导出

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖 — 立即开始
- **Phase 2 (Foundational)**: 依赖 Phase 1（子包骨架已创建）
- **Phase 3 (US1 润色引擎)**: 依赖 Phase 2（TextExtractor 已实现）
- **Phase 4 (US3 格式保留回写)**: 依赖 Phase 2（DiffCalculator 已实现）
- **Phase 5 (US4 双 Agent)**: 依赖 Phase 3（PolishEngine 已实现）
- **Phase 6 (API + Service)**: 依赖 Phase 3 + Phase 4
- **Phase 7 (前端)**: 依赖 Phase 6（API 端点可用）
- **Phase 8 (Polish)**: 依赖全部 Phase 完成

### User Story Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational: TextExtractor + DiffCalculator)
    ↓
    ├──▶ Phase 3 (US1: PolishEngine — LLM 润色) ←── 独立
    └──▶ Phase 4 (US3: TextWriter — 格式保留回写) ←── 独立
         ↓
         Phase 5 (US4: Reviewer Agent — 双 Agent)
         ↓
Phase 6 (API + Service)
    ↓
Phase 7 (US5 + US2: 前端组件)
    ↓
Phase 8 (Polish)
```

**Phase 3 和 Phase 4 可并行**（操作不同文件）。

### ⚠️ 同文件冲突注意

- **polish_engine.py**: T011（创建主体）→ T017（集成 Reviewer），必须按顺序
- **ai_prompts.py**: T010（Polisher Prompt）→ T016（Reviewer Prompt），必须按顺序
- **test_polish_engine.py**: T009（基础测试）→ T018（Reviewer 测试），必须按顺序
- **UploadPanel.tsx**: T025 修改现有组件，需在 PolishPanel 完成后

### Parallel Opportunities

```bash
# Phase 1: 三个骨架文件并行
Task: T001 (polisher/__init__.py)
Task: T002 (schemas.py 扩展)
Task: T003 (frontend types 扩展)

# Phase 2: 两个核心模块 + 两个测试文件并行
Task: T004 (text_extractor.py)
Task: T005 (diff_calculator.py)
Task: T006 (test_text_extractor.py)
Task: T007 (test_diff_calculator.py)

# Phase 3 + Phase 4: 两条线并行
线 A: T009 → T010 → T011 → T012 (US1: 润色引擎)
线 B: T013 → T014 → T015 (US3: 回写引擎)

# Phase 7: 前端组件 + 测试并行
Task: T026 (PolishPanel.test.tsx)
Task: T027 (PolishPreview.test.tsx)
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + 3 + 4: 核心能力)

1. Phase 1: 创建骨架
2. Phase 2: 实现 TextExtractor + DiffCalculator
3. Phase 3: 实现 PolishEngine（LLM 润色核心）
4. Phase 4: 实现 TextWriter（格式保留回写）
5. **STOP and VALIDATE**: 后端核心能力完整，可通过单元测试验证

### Incremental Delivery

1. Phase 1+2 → 基础模块就绪
2. +Phase 3+4 → 润色 + 回写核心完成（后端 MVP!）
3. +Phase 5 → 双 Agent 增强（质量提升）
4. +Phase 6 → API 端点可用
5. +Phase 7 → 前端完整可用
6. Phase 8 → 最终验证

### Total Tasks: 32

| 阶段 | 任务数 | 说明 |
|------|--------|------|
| Phase 1 Setup | 3 | 骨架创建 |
| Phase 2 Foundational | 5 | TextExtractor + DiffCalculator + 测试 |
| Phase 3 US1 (P1) | 4 | PolishEngine（1 test + 3 impl） |
| Phase 4 US3 (P1) | 3 | TextWriter（1 test + 2 impl） |
| Phase 5 US4 (P2) | 3 | Reviewer Agent（2 impl + 1 test update） |
| Phase 6 API + Service | 4 | polisher_service + polish_routes + app.py + 全量测试 |
| Phase 7 Frontend (P1) | 6 | 2 组件 + 1 修改 + 2 测试 + 前端全量测试 |
| Phase 8 Polish | 4 | 验证与清理 |

---

## Notes

- [P] tasks = different files, no dependencies
- polisher/ 子包与 checker/ 子包完全独立，无交叉依赖
- LLM 调用在测试中使用 mock，不依赖真实 API
- polish_engine.py 被 Phase 3 和 Phase 5 两个阶段修改，必须按顺序
- 前端 Tab 切换是 UploadPanel 的修改，需在 PolishPanel 和 PolishPreview 完成后
- Commit after each task or logical group
- Run `python -m pytest tests/ -v` after each phase checkpoint
