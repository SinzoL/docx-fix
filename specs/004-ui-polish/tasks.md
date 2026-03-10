# Tasks: UI 样式美化与体验优化

**Input**: Design documents from `/specs/004-ui-polish/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Spec Testing Strategy 中明确要求了单元测试（SvgIcon、aiCache、CheckReport 折叠），故包含测试任务。

**Organization**: Tasks are grouped by user story. US1（折叠）和 US2（SvgIcon）均为 P1 但功能独立，可并行；US3（AI 缓存）为 P2。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 新增基础模块（SvgIcon 组件 + AI 缓存服务），供后续所有 User Story 使用

- [ ] T001 [P] [US2] 创建 SvgIcon 通用组件，包含约 25 个图标的 path data — `frontend/src/components/icons/SvgIcon.tsx`
- [ ] T002 [P] [US3] 创建 AI 总结内存缓存模块（Map + FIFO 淘汰，50 条上限） — `frontend/src/services/aiCache.ts`

**Checkpoint**: SvgIcon 组件和 aiCache 模块可独立导入使用

---

## Phase 2: User Story 1 - 检测通过项折叠，突出未通过项 (Priority: P1) 🎯

**Goal**: 检查报告中全部通过的类别默认折叠，突出展示含 FAIL/WARN 的类别

**Independent Test**: 上传存在部分格式问题的文档，确认通过类别默认折叠、失败类别默认展开，点击可切换

### Tests for User Story 1

- [ ] T003 [US1] 新增 CheckReport 折叠/展开行为测试 — `frontend/src/__tests__/components/CheckReport.test.tsx`
  - 测试默认折叠通过类别
  - 测试默认展开含 FAIL/WARN 类别
  - 测试点击切换折叠/展开
  - 测试"展开全部"/"收起全部"按钮
  - 测试全部通过时所有类别默认折叠

### Implementation for User Story 1

- [ ] T004 [US1] 在 CheckReport.tsx 中实现类别折叠逻辑 — `frontend/src/components/CheckReport.tsx`
  - 新增 `collapsed` 状态（`Record<string, boolean>`），初始值基于类别内检查项状态计算
  - 类别头部添加点击事件 + chevron 箭头图标（依赖 T001 的 SvgIcon）
  - 折叠头部显示：类别名 + PASS/WARN/FAIL 计数 badge
  - 展开/折叠切换交互
  - 在"具体检查项详情"标题行右侧添加"展开全部"/"收起全部"按钮

**Checkpoint**: 检查报告折叠功能完整可用

---

## Phase 3: User Story 2 - SVG Icon 系统替代 Emoji (Priority: P1) 🎯

**Goal**: 全站所有 emoji 替换为统一的 SVG Icon 组件

**Independent Test**: 全站无残留 emoji，图标风格统一，`currentColor` 适配深色/浅色背景

### Tests for User Story 2

- [ ] T005 [US2] 创建 SvgIcon 组件单元测试 — `frontend/src/__tests__/components/icons/SvgIcon.test.tsx`
  - 测试已知图标名正确渲染 `<svg>` 元素
  - 测试未知图标名返回 null
  - 测试 size 属性传递
  - 测试 className 属性传递
  - 测试多 path 图标渲染

### Implementation for User Story 2 — Emoji 替换（按文件逐一处理）

> 以下任务均标记 [P]，因为它们操作不同文件，互不依赖。全部依赖 T001（SvgIcon 组件已创建）。

- [ ] T006 [P] [US2] 替换 App.tsx 中的所有 emoji（📝/🔍/🧬/✨/✓） — `frontend/src/App.tsx`
- [ ] T007 [P] [US2] 替换 CheckReport.tsx 中的所有 emoji（📊/💬/📋/📍）+ STATUS_MAP 状态符号（✓/⚠/✗） — `frontend/src/components/CheckReport.tsx`
- [ ] T008 [P] [US2] 替换 AiSummary.tsx 中的所有 emoji（✨/⚠️） — `frontend/src/components/AiSummary.tsx`
- [ ] T009 [P] [US2] 替换 AiChatPanel.tsx 中的所有 emoji（🤖） — `frontend/src/components/AiChatPanel.tsx`
- [ ] T010 [P] [US2] 替换 FixPreview.tsx 中的所有 emoji（✨/⚠️/✅） — `frontend/src/components/FixPreview.tsx`
- [ ] T011 [P] [US2] 替换 HistoryList.tsx 中的所有 emoji（📂） — `frontend/src/components/HistoryList.tsx`
- [ ] T012 [P] [US2] 替换 ExtractPanel.tsx 中的所有 emoji（📐/📑/🔢/🏗️/🔍/🔧/📄/💡/❌/⚠️/🧬） — `frontend/src/components/ExtractPanel.tsx`
- [ ] T013 [P] [US2] 替换 UploadPanel.tsx 中的所有 emoji（💡/📋/📂），注意 OptionGroup label 需使用 TNode 形式 — `frontend/src/components/UploadPanel.tsx`
- [ ] T014 [P] [US2] 替换 RuleManager.tsx 中的所有 emoji（📂 x2/📄 x1） — `frontend/src/components/RuleManager.tsx`

**Checkpoint**: 全站零 emoji，所有图标使用 SvgIcon 组件。用 grep 扫描验证：`grep -rn $'[\U0001F300-\U0001F9FF]' frontend/src/`

---

## Phase 4: User Story 3 - AI 深度总结缓存 (Priority: P2)

**Goal**: 缓存 AI 总结结果，从历史记录返回时不重复请求 LLM

**Independent Test**: 首次查看报告等待 AI 总结完成，返回历史列表后再次查看同一报告，总结立即展示无加载过程

### Tests for User Story 3

- [ ] T015 [US3] 创建 aiCache 模块单元测试 — `frontend/src/__tests__/services/aiCache.test.ts`
  - 测试 getCachedSummary/setCachedSummary 基本读写
  - 测试缓存未命中返回 undefined
  - 测试 clearCachedSummary 清除特定条目
  - 测试 FIFO 淘汰（超过 50 条时删除最早条目）
  - 测试 getCacheSize 返回正确数量
  - 测试覆盖更新（同 id 重复写入）

### Implementation for User Story 3

- [ ] T016 [US3] 在 AiSummary.tsx 中集成缓存逻辑 — `frontend/src/components/AiSummary.tsx`
  - 组件挂载时检查 `getCachedSummary(sessionId)`
  - 缓存命中：直接渲染缓存内容，状态跳到 `done`，不发起 SSE
  - 缓存未命中：正常发起 SSE，`done` 回调中调用 `setCachedSummary`
  - "重新分析"按钮：调用 `clearCachedSummary` 后重新发起 SSE

**Checkpoint**: AI 总结缓存功能完整，从历史记录返回时总结立即展示

---

## Phase 5: Polish & Validation

**Purpose**: 最终验证和清理

- [ ] T017 运行全站 emoji 残留扫描，确认零 emoji — `grep -rn` 扫描 `frontend/src/`
- [ ] T018 运行完整测试套件确认无回归 — `cd frontend && npm run test`
- [ ] T019 按 quickstart.md 执行端到端验证（SVG Icon / 折叠交互 / AI 缓存）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖 — 立即开始
- **Phase 2 (US1 折叠)**: 依赖 T001（SvgIcon 组件用于 chevron 箭头图标）
- **Phase 3 (US2 Emoji 替换)**: 依赖 T001（SvgIcon 组件）
- **Phase 4 (US3 AI 缓存)**: 依赖 T002（aiCache 模块）
- **Phase 5 (Polish)**: 依赖全部 Phase 完成

### User Story Dependencies

```
T001 (SvgIcon) ──┬──▶ T004 (US1 折叠实现，需要 chevron 图标)
                 ├──▶ T006~T014 (US2 Emoji 替换，需要 SvgIcon 组件)
                 └──▶ T007 (US2 CheckReport emoji 替换，与 T004 修改同一文件⚠️)

T002 (aiCache) ──▶ T016 (US3 AiSummary 缓存集成)
```

### ⚠️ 同文件冲突注意

- **CheckReport.tsx**: T004（US1 折叠逻辑）和 T007（US2 emoji 替换）修改同一文件。建议 **T004 先执行**（折叠是结构性改动），T007 后执行（emoji 替换是点状改动）
- **AiSummary.tsx**: T008（US2 emoji 替换）和 T016（US3 缓存集成）修改同一文件。建议 **T008 先执行**（简单替换），T016 后执行（逻辑改动）

### Recommended Execution Order

```
┌────────────────────────────────┐
│ Phase 1: T001 [P] T002         │  ← 并行创建 SvgIcon + aiCache
└──────────┬─────────┬───────────┘
           │         │
     ┌─────▼─────┐   │
     │ T003 test  │   │
     │ T004 折叠  │   │  ← US1: 折叠逻辑（先于 emoji 替换）
     └─────┬─────┘   │
           │         │
     ┌─────▼──────────▼──────────┐
     │ T005 test                  │
     │ T006~T014 emoji 替换 [P]  │  ← US2: 全部可并行
     └─────┬─────────────────────┘
           │
     ┌─────▼─────┐
     │ T015 test  │
     │ T016 缓存  │  ← US3: AI 缓存
     └─────┬─────┘
           │
     ┌─────▼─────────────────────┐
     │ T017~T019 验证 & 清理      │  ← Phase 5: Polish
     └───────────────────────────┘
```

### Parallel Opportunities

```bash
# Phase 1: 两个基础模块并行创建
Task: T001 (SvgIcon.tsx)
Task: T002 (aiCache.ts)

# Phase 3: 所有 emoji 替换文件并行进行（T006~T014，除 CheckReport 外）
Task: T006 (App.tsx)
Task: T008 (AiSummary.tsx)
Task: T009 (AiChatPanel.tsx)
Task: T010 (FixPreview.tsx)
Task: T011 (HistoryList.tsx)
Task: T012 (ExtractPanel.tsx)
Task: T013 (UploadPanel.tsx)
Task: T014 (RuleManager.tsx)
# 注意：T007 (CheckReport.tsx) 需在 T004 之后执行
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1: 创建 SvgIcon + aiCache 基础模块
2. Phase 2: 实现折叠逻辑 → 验证
3. Phase 3: 全站 emoji 替换 → 验证零 emoji
4. **STOP and VALIDATE**: 折叠 + SVG Icon 两个 P1 功能完整
5. Phase 4: AI 缓存 → 验证
6. Phase 5: 最终 Polish

### Total Tasks: 19

- Setup: 2 tasks
- US1 (P1 折叠): 2 tasks (1 test + 1 impl)
- US2 (P1 SvgIcon): 10 tasks (1 test + 9 impl)
- US3 (P2 缓存): 2 tasks (1 test + 1 impl)
- Polish: 3 tasks

---

## Notes

- [P] tasks = different files, no dependencies
- T004 和 T007 操作同一文件（CheckReport.tsx），MUST 按顺序执行
- T008 和 T016 操作同一文件（AiSummary.tsx），MUST 按顺序执行
- Commit after each task or logical group
- Run `npm run test` after each phase checkpoint
