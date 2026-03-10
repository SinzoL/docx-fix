# Tasks: Web 前后端界面

**Input**: Design documents from `/specs/001-web-frontend-backend/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/api.md ✅, quickstart.md ✅

**Tests**: ✅ 每个新特性 MUST 同步编写测试。每完成一个特性后 MUST 运行全量回归测试（后端 `pytest tests/ -v` + 前端 `npx vitest run`），确保所有已有测试通过。回归失败修复优先级 > 新功能开发。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/` (FastAPI Python), `frontend/` (React + TDesign)
- 现有引擎文件（`checker.py`, `fixer.py`, `rules/`）位于项目根目录

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 初始化前后端项目结构，安装依赖，配置开发环境

- [ ] T001 创建后端项目结构：`backend/app.py`, `backend/api/__init__.py`, `backend/api/routes.py`, `backend/api/schemas.py`, `backend/services/__init__.py`, `backend/services/checker_service.py`, `backend/services/fixer_service.py`, `backend/services/rules_service.py`
- [ ] T002 创建后端依赖文件 `backend/requirements.txt`（fastapi, uvicorn, python-multipart, python-docx, lxml, pyyaml）
- [ ] T003 [P] 使用 Vite + React + TypeScript 模板初始化前端项目 `frontend/`，安装 TDesign React、TailwindCSS、idb 等依赖
- [ ] T004 [P] 配置前端 TailwindCSS（`frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/src/index.css`）和 Less 支持（TDesign 需要）
- [ ] T005 [P] 配置 Vite 开发代理（`frontend/vite.config.ts`），将 `/api` 请求代理到 `http://localhost:8000`
- [ ] T006 [P] 创建前端类型定义文件 `frontend/src/types/index.ts`，定义 RuleInfo、CheckItemResult、CheckReport、FixItemResult、FixReport 等 TypeScript 接口（对应 data-model.md）
- [ ] T007 创建通用默认检查规则文件 `rules/default.yaml`，仅包含基础格式设置：页面设置（A4 纸张、Word 默认页边距）、正文样式（中文宋体/英文 Times New Roman/小四号/1.5 倍行距/首行缩进 2 字符）
- [ ] T007a [P] 搭建后端测试基础设施：创建 `backend/tests/conftest.py`（pytest fixtures：AsyncClient、临时目录、测试规则文件路径）、`backend/tests/fixtures/` 目录（sample_good.docx、sample_bad.docx、test_rule.yaml 测试数据）、在 `backend/requirements.txt` 中增加 pytest/httpx/pytest-asyncio 测试依赖
- [ ] T007b [P] 搭建前端测试基础设施：创建 `frontend/vitest.config.ts`、在 `package.json` 中增加 vitest/@testing-library/react/@testing-library/jest-dom/jsdom/fake-indexeddb 测试依赖，配置测试环境

**Checkpoint**: 前后端项目结构就绪，可分别启动开发服务器（后端 `uvicorn`、前端 `npm run dev`），开发环境配置完成。测试基础设施就绪，可运行空测试套件。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 构建后端 FastAPI 应用骨架和前端应用骨架，为所有用户故事提供基础设施

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T008 实现 FastAPI 应用入口 `backend/app.py`：创建 FastAPI 实例，配置 CORS（允许 localhost:5173/3000），挂载 API 路由，配置临时文件目录 `/tmp/docx-fix/`
- [ ] T009 实现 Pydantic 请求/响应模型 `backend/api/schemas.py`：RuleInfo, CheckItemResult, CheckReport, FixItemResult, FixReport, ErrorResponse 等（对应 data-model.md 和 contracts/api.md）
- [ ] T010 [P] 实现规则扫描服务 `backend/services/rules_service.py`：扫描 `rules/` 目录，解析 YAML 文件的 `meta.name` 和 `meta.description`，返回 RuleInfo 列表，默认规则排首位；处理 YAML 语法错误标记为不可用
- [ ] T011 [P] 实现前端 API 调用封装 `frontend/src/services/api.ts`：封装 GET /api/rules、POST /api/check、POST /api/fix、GET /api/fix/download、GET /api/rules/{id} 五个接口调用函数
- [ ] T012 [P] 实现前端 IndexedDB 缓存管理 `frontend/src/services/cache.ts`：使用 `idb` 库创建 `docx-fix-cache` 数据库，实现 history store 的 CRUD、过期清理（30天）、空间不足降级处理
- [ ] T013 搭建前端应用骨架 `frontend/src/App.tsx` 和 `frontend/src/main.tsx`：定义应用状态机（IDLE → UPLOADING → CHECKING → REPORT_READY → FIXING → FIX_PREVIEW → DOWNLOADED），引入 TDesign 全局样式，搭建页面布局框架
- [ ] T013a [P] 编写 rules_service 单元测试 `backend/tests/test_rules_service.py`：测试 YAML 解析、默认规则排序、语法错误处理、规则目录为空的情况
- [ ] T013b [P] 编写前端 api.ts 测试 `frontend/src/__tests__/services/api.test.ts`：mock fetch 测试所有 API 封装函数的请求参数和响应处理
- [ ] T013c [P] 编写前端 cache.ts 测试 `frontend/src/__tests__/services/cache.test.ts`：使用 fake-indexeddb 测试 CRUD、过期清理、空间不足降级
- [ ] T013d 🔄 **回归测试检查点**：运行 `cd backend && python -m pytest tests/ -v && cd ../frontend && npx vitest run`，确保所有测试通过

**Checkpoint**: 后端可启动并响应 `/api/rules`，前端可启动并展示空白布局。API 调用封装和缓存服务就绪。所有基础服务层测试通过。

---

## Phase 3: User Story 1 - 上传文档并查看检查报告 (Priority: P1) 🎯 MVP

**Goal**: 用户通过 Web 界面上传 .docx 文件，选择检查模板，查看结构化的格式检查报告

**Independent Test**: 上传一个已知有格式问题的 .docx 文件，分别使用"通用默认检查"和"哈工大(深圳)毕业论文中期报告"规则检查，确认页面正确显示所有检查项及其 PASS/WARN/FAIL 状态，且不同规则下检查项不同

### Implementation for User Story 1

- [ ] T014 [US1] 实现检查引擎封装服务 `backend/services/checker_service.py`：封装 DocxChecker 类，接受上传文件路径和规则路径，调用 `run_all_checks()`，将 `.results` 列表序列化为 CheckItemResult 列表，计算 summary（pass/warn/fail/fixable 计数）
- [ ] T015 [US1] 实现 API 路由——规则列表 `backend/api/routes.py` 中的 `GET /api/rules`：调用 rules_service 返回可用规则列表
- [ ] T016 [US1] 实现 API 路由——文件上传与检查 `backend/api/routes.py` 中的 `POST /api/check`：接收 multipart/form-data（file + rule_id + session_id），验证文件类型（.docx）和大小（≤50MB），保存至 `/tmp/docx-fix/{session_id}/`，调用 checker_service 执行检查，返回 CheckReport JSON
- [ ] T017 [US1] 实现错误处理：文件类型校验（INVALID_FILE_TYPE 400）、文件大小校验（FILE_TOO_LARGE 400）、规则 ID 校验（INVALID_RULE 400）、文件损坏处理（FILE_CORRUPTED 422）
- [ ] T018 [P] [US1] 实现前端上传面板组件 `frontend/src/components/UploadPanel.tsx`：使用 TDesign Upload 组件（拖拽+点击上传 .docx），TDesign Select 组件展示规则模板选择器（调用 GET /api/rules 填充选项，默认规则排首位且默认选中），上传按钮触发 POST /api/check
- [ ] T019 [US1] 实现前端检查报告组件 `frontend/src/components/CheckReport.tsx`：使用 TDesign Table 按类别分组展示检查项，TDesign Tag 展示状态（PASS 绿色 / WARN 橙色 / FAIL 红色），显示 summary 汇总（通过/警告/失败/可修复数量），标注每项是否可自动修复
- [ ] T020 [US1] 集成 US1 完整流程：App.tsx 中串联 UploadPanel → Loading 状态（TDesign Loading 组件）→ CheckReport，处理状态流转（IDLE → UPLOADING → CHECKING → REPORT_READY），上传完成后将检查报告缓存至 IndexedDB
- [ ] T020a [US1] 编写 checker_service 单元测试 `backend/tests/test_checker_service.py`：测试正常检查流程、结果序列化、summary 计算
- [ ] T020b [US1] 编写 API 集成测试 `backend/tests/test_api_rules.py`（GET /api/rules）和 `backend/tests/test_api_check.py`（POST /api/check：正常检查、文件类型校验、大小校验、规则校验、损坏文件处理）
- [ ] T020c [US1] [P] 编写前端组件测试 `frontend/src/__tests__/components/UploadPanel.test.tsx`（文件选择、规则加载、上传触发）和 `frontend/src/__tests__/components/CheckReport.test.tsx`（状态展示、分类分组、修复按钮状态）
- [ ] T020d [US1] 🔄 **回归测试检查点**：运行全量回归测试，确保 Phase 1/2/3 所有测试通过

**Checkpoint**: 用户可上传 .docx 文件、选择检查模板、查看完整的格式检查报告。此时 User Story 1 完全可用并可独立测试。所有 US1 相关测试 + 全量回归通过。

---

## Phase 4: User Story 2 - 一键修复格式并下载 (Priority: P2)

**Goal**: 用户查看检查报告后点击"一键修复"，预览修复前后对比，确认无误后下载修复文件

**Independent Test**: 上传一个有已知可修复问题的文件，点击修复按钮，确认预览页面正确展示修复前后对比（FAIL→PASS），点击下载按钮后浏览器触发下载，下载的文件用 CLI `check` 检查问题数量减少或为零

### Implementation for User Story 2

- [ ] T021 [US2] 实现修复引擎封装服务 `backend/services/fixer_service.py`：封装 DocxFixer 类，接受文件路径和规则路径，调用 `run_all_fixes()`，获取 `.fixes` 列表；修复完成后再调用 checker_service 对修复后文件重新检查，计算修复前后对比（changed_items）；将修复后文件保存至 `/tmp/docx-fix/{session_id}/` 并返回 FixReport
- [ ] T022 [US2] 实现 API 路由——执行修复 `backend/api/routes.py` 中的 `POST /api/fix`：接收 JSON（session_id + rule_id），验证 session 存在性，调用 fixer_service，返回 FixReport JSON（含 before/after summary、changed_items 列表）
- [ ] T023 [US2] 实现 API 路由——下载修复文件 `backend/api/routes.py` 中的 `GET /api/fix/download`：接收 query 参数 session_id，返回修复后 .docx 文件流（Content-Disposition: attachment, filename="原文件名_fixed.docx"）
- [ ] T024 [P] [US2] 实现前端修复预览组件 `frontend/src/components/FixPreview.tsx`：使用 TDesign Table 展示修复前后对比（changed_items：before_status → after_status），TDesign Descriptions 展示修复汇总（before_summary vs after_summary），包含"下载修复文件"按钮（TDesign Button theme="primary"）
- [ ] T025 [US2] 集成 US2 完整流程：CheckReport 中添加"一键修复"按钮（有 fixable 项时启用，全部 PASS 时禁用并提示"无需修复"），点击后调用 POST /api/fix，展示 FixPreview；FixPreview 中"下载修复文件"按钮点击后调用 GET /api/fix/download，通过 Blob + `<a>` click 触发浏览器下载；下载后将修复结果缓存至 IndexedDB
- [ ] T026 [US2] 实现修复错误处理：session_id 不存在（SESSION_NOT_FOUND 404）、无可修复项（NO_FIXABLE_ITEMS 400）、修复过程异常（FIX_ERROR 500），前端展示对应错误提示
- [ ] T026a [US2] 编写 fixer_service 单元测试 `backend/tests/test_fixer_service.py`：测试修复流程、修复前后对比计算、异常处理
- [ ] T026b [US2] 编写 API 集成测试 `backend/tests/test_api_fix.py`：POST /api/fix（正常修复、session 不存在、无可修复项）和 GET /api/fix/download（正常下载、session 不存在）
- [ ] T026c [US2] [P] 编写前端组件测试 `frontend/src/__tests__/components/FixPreview.test.tsx`：修复前后对比展示、下载按钮触发、错误状态处理
- [ ] T026d [US2] 🔄 **回归测试检查点**：运行全量回归测试，确保 Phase 1/2/3/4 所有测试通过

**Checkpoint**: 用户可在检查报告页面点击修复、预览修复结果、下载修复后文件。User Story 1 + 2 均可独立测试。所有 US2 相关测试 + 全量回归通过。

---

## Phase 5: User Story 3 - 查看和切换规则集 (Priority: P3)

**Goal**: 用户可在报告页面切换规则重新检查，查看规则详情的可读化展示

**Independent Test**: 在报告页面切换到另一个规则文件，重新检查同一文件，确认检查结果与新规则一致；点击"查看规则详情"确认展示完整规则内容

### Implementation for User Story 3

- [ ] T027 [US3] 实现 API 路由——规则详情 `backend/api/routes.py` 中的 `GET /api/rules/{rule_id}`：解析 YAML 规则文件完整内容，按 section 组织返回可读化格式（sections → rules 列表，包含 item 和 value）
- [ ] T028 [P] [US3] 实现前端规则详情组件 `frontend/src/components/RuleDetail.tsx`：使用 TDesign Collapse 折叠面板按 section 分组展示规则内容，每个 section 内使用 TDesign Descriptions 列出具体规则项及其参数值
- [ ] T029 [US3] 在 CheckReport 组件中添加规则切换功能：添加 TDesign Select 规则选择器，切换规则后自动调用 POST /api/check 重新检查同一文件（复用已上传的 session 文件），更新报告展示
- [ ] T030 [US3] 在 CheckReport 组件中添加"查看规则详情"入口：点击后调用 GET /api/rules/{rule_id}，使用 TDesign Drawer 或 Dialog 展示 RuleDetail 组件
- [ ] T030a [US3] 编写 API 集成测试 `backend/tests/test_api_rules_detail.py`：GET /api/rules/{rule_id}（正常获取、规则不存在）
- [ ] T030b [US3] [P] 编写前端组件测试 `frontend/src/__tests__/components/RuleDetail.test.tsx`：规则详情展示、折叠面板交互
- [ ] T030c [US3] 🔄 **回归测试检查点**：运行全量回归测试，确保 Phase 1/2/3/4/5 所有测试通过

**Checkpoint**: 用户可切换规则重新检查、查看规则详情。所有 3 个 User Story 均可独立测试。所有 US3 相关测试 + 全量回归通过。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 历史记录、过期清理、边缘情况处理、整体体验优化

- [ ] T031 [P] 实现前端历史记录列表组件 `frontend/src/components/HistoryList.tsx`：从 IndexedDB 读取历史检查记录，使用 TDesign Table 展示（文件名、规则名、检查时间、状态摘要），点击可查看历史报告详情
- [ ] T032 [P] 实现前端过期缓存自动清理逻辑：在 App 初始化时调用 cache.ts 的清理函数，删除 `expires_at < Date.now()` 的记录；IndexedDB 不可用时（如隐私模式）提示用户并正常运行
- [ ] T033 [P] 实现后端临时文件定时清理：在 FastAPI startup 事件中启动后台任务，定期清理 `/tmp/docx-fix/` 下超过 1 小时的 session 目录
- [ ] T034 后端边缘情况处理：YAML 规则语法错误跳过并标记不可用、default.yaml 缺失时使用硬编码最小规则兜底、.docx 文件非标准 OOXML 结构的优雅错误提示
- [ ] T035 前端 UI 优化与体验打磨：上传区域拖拽交互优化、加载状态动画、空状态提示、响应式布局适配、TDesign Message 全局消息提示统一
- [ ] T035a 编写边缘情况测试 `backend/tests/test_edge_cases.py`：损坏文件、YAML 语法错误、default.yaml 缺失兜底、并发 session 隔离、大文件拒绝
- [ ] T035b [P] 编写前端历史记录和应用集成测试：`frontend/src/__tests__/components/HistoryList.test.tsx`（历史列表展示、过期清理）和 `frontend/src/__tests__/App.test.tsx`（状态机流转集成测试）
- [ ] T035c 🔄 **最终全量回归测试**：运行全量回归测试，确保所有 Phase 的所有测试全部通过
- [ ] T036 运行 quickstart.md 端到端验证：按 quickstart.md 步骤启动前后端，完整测试"上传 → 选模板 → 检查 → 查看报告 → 修复 → 预览 → 下载"全流程，确认 SC-001~SC-006 成功标准达标

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 — 核心 MVP
- **User Story 2 (Phase 4)**: Depends on Phase 2 + Phase 3（需要 checker_service 和 CheckReport 组件）
- **User Story 3 (Phase 5)**: Depends on Phase 2 + Phase 3（需要 CheckReport 组件作为基础）
- **Polish (Phase 6)**: Depends on Phase 3/4/5 完成

### User Story Dependencies

- **User Story 1 (P1)**: 依赖 Phase 2 完成 → 可独立实现和测试
- **User Story 2 (P2)**: 依赖 US1 的 CheckReport 组件和 checker_service → 实际上需要 US1 完成后再开始
- **User Story 3 (P3)**: 依赖 US1 的 CheckReport 组件 → 实际上需要 US1 完成后再开始
- **US2 和 US3 之间无依赖**，可在 US1 完成后并行开发

### Within Each User Story

- 后端服务（service 层）先于 API 路由
- API 路由先于前端组件集成
- 前端组件可与后端并行开发（[P] 标记）
- 集成任务在组件和 API 均就绪后进行

### Parallel Opportunities

**Phase 1** (可并行):
```
T001 (后端结构) | T003 (前端初始化) | T007 (default.yaml)
                | T004 (TailwindCSS)
                | T005 (Vite 代理)
                | T006 (类型定义)
```

**Phase 2** (可并行):
```
T010 (rules_service) | T011 (前端 api.ts) | T012 (前端 cache.ts)
```

**Phase 3 — US1** (可并行):
```
T018 (UploadPanel 组件) 可与 T014~T017 (后端) 并行开发
```

**Phase 4 — US2** (可并行):
```
T024 (FixPreview 组件) 可与 T021~T023 (后端) 并行开发
```

**Phase 5 — US3** (可并行):
```
T028 (RuleDetail 组件) 可与 T027 (后端 API) 并行开发
```

**Phase 6** (可并行):
```
T031 (HistoryList) | T032 (过期清理) | T033 (临时文件清理)
```

---

## Parallel Example: User Story 1

```bash
# 后端和前端组件可并行开发：
# 后端任务（顺序执行）:
Task T014: "实现 checker_service.py"
Task T015: "实现 GET /api/rules 路由"
Task T016: "实现 POST /api/check 路由"
Task T017: "实现错误处理"

# 前端组件（与后端并行）:
Task T018: "实现 UploadPanel.tsx 组件" [P]

# 集成（依赖上述全部完成）:
Task T019: "实现 CheckReport.tsx 组件"
Task T020: "集成 US1 完整流程"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup — 项目结构和依赖安装
2. Complete Phase 2: Foundational — FastAPI 骨架 + 前端骨架 + 缓存服务
3. Complete Phase 3: User Story 1 — 上传 + 检查 + 报告
4. **STOP and VALIDATE**: 测试完整的上传→检查→报告流程
5. 确认 SC-001（≤30s）、SC-003（与 CLI 一致）、SC-006（无需说明即可使用）

### Incremental Delivery

1. Setup + Foundational → 开发环境就绪
2. Add User Story 1 → 上传+检查+报告 → 验证 → **MVP!**
3. Add User Story 2 → 修复+预览+下载 → 验证 → 核心功能完整
4. Add User Story 3 → 规则切换+详情 → 验证 → 功能齐全
5. Polish → 历史记录+清理+优化 → 产品级体验

### Single Developer Strategy

由于是单人开发（毕业设计项目），建议严格按优先级顺序：

1. Phase 1 → Phase 2 → Phase 3 (US1 MVP)
2. 验证 MVP 后继续 Phase 4 (US2)
3. Phase 5 (US3)
4. Phase 6 (Polish)

每个 Phase 内，后端 → 前端 → 集成的顺序最为高效。

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- 🔄 = 回归测试检查点：MUST 运行全量测试（后端 + 前端），全部通过才可进入下一个任务
- **测试编号规则**：测试任务使用 `TxxxA/B/C/D` 子编号，跟随其对应的功能任务
- **每个 Phase 末尾都有回归测试检查点**，确保不引入回归问题
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- 现有 Python 代码（checker.py, fixer.py, docx_fixer.py）不做任何修改，后端 services 层仅做函数级调用封装
