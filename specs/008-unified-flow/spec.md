# Feature Specification: 统一三模块交互流程 — Unified Module Flow

- **Feature Branch**: `008-unified-flow`
- **Created**: 2026-03-11
- **Status**: Draft → **Clarified**
- **Input**: 用户反馈三个功能模块（检查、提取、润色）的交互不一致

---

## 0. Clarify 决策记录

> 以下决策来自与用户的交互确认（2026-03-11），作为实施的权威参考。

| # | 问题 | 决策 |
|---|------|------|
| Q1 | `usePolishSSE` Hook 提升策略 | **方案 B** — 封装 `usePolishFlow()` 高阶 Hook，打包所有润色状态 + SSE 逻辑，App.tsx 只消费聚合接口，避免 App.tsx 臃肿 |
| Q2 | 提取模块是否也用 Hook 封装 | **是** — 创建 `useExtractFlow()` Hook，与 `useCheckFlow()` / `usePolishFlow()` 保持架构一致 |
| Q3 | Tab 保活策略是否改变 | **不改变** — 继续使用 `display: none/block` 保活，已选文件不能丢失 |
| Q4 | 润色进行中返回的状态处理 | **不保存未完成进度** — 弹出警告对话框说明"离开后未完成的进度不会保存"，用户确认后中断 SSE、清空状态、回到 IDLE |
| Q5 | IndexedDB 缓存恢复时机 | **按需恢复** — 仅当用户切换到对应 Tab（润色 Tab 可见）时才触发恢复逻辑，节省资源 |
| Q6 | `onComplete` 全量替换 vs 累积 | 注意利用架构设计提升维护性，减少臃肿。Hook 内部封装细节，对外暴露清晰接口 |
| Q7 | 提取历史记录数据源 | **当前不存在**，需要新建。参考 `PolishHistoryList` + IndexedDB `polish-history` store 的模式，新增 `extract-history` store |
| Q8 | RuleManager 在首页的位置 | **首页保留 RuleManager 不变** — 用户需要在首页直接管理规则（重命名/删除/下载/应用），无需进入提取流程 |
| Q9 | 检查模块 Loading/Done 是否迁移到共享组件 | **迁移** — 三个模块全部使用 `FullscreenLoading` / `FullscreenDone` 共享组件 |
| Q10 | `UPLOADING` 瞬态是否保留 | **保留** — 在 AppState 中保留 `UPLOADING` 状态 |
| Q11 | `beforeunload` 在新架构下的位置 | **放在 `usePolishFlow()` Hook 内部** — Hook 自身监听 appState，当处于 POLISHING 状态时注册 beforeunload，解除时自动清理。App.tsx 无需关心 |
| Q12 | 错误处理是否使用独立视图 | **不用** — 沿用当前方案：toast 提示错误 + 回到 IDLE 状态 |

---

## 1. 背景与动机

### 1.1 现状分析

当前系统有三个核心功能模块，但它们的**交互流程和页面切换模式**存在明显不一致：

| 维度 | 检查模块 | 提取模块 | 润色模块 |
|------|---------|---------|---------|
| **状态管理位置** | App.tsx 全局 `appState` | ExtractPanel 内部 `state` | PolishPanel 内部 `state` |
| **上传后页面切换** | ✅ 离开首页，独立全屏展示结果 | ❌ 在 Tab 面板内部切换，不离开首页 | ❌ 在 Tab 面板内部切换，不离开首页 |
| **顶部返回按钮** | ✅ 有（header 区域"← 返回主页"） | ❌ 无（通过面板内"← 重新提取"按钮） | ❌ 无（通过面板内"← 返回"按钮） |
| **Tab 导航可见性** | 结果页隐藏 Tab（仅显示返回按钮） | 结果页仍在 Tab 面板内 | 结果页仍在 Tab 面板内 |
| **Loading 展示** | 独立全屏居中的加载动画卡片 | 面板内部的加载状态 | 面板内部的进度条组件 |
| **完成页** | ✅ 有（独立全屏"大功告成"页） | ❌ 无（直接显示结果） | ✅ 有（PolishDone 组件） |
| **历史记录位置** | 上传面板下方 | idle 和 done 状态下的 RuleManager | 上传面板下方 + 完成页 |

### 1.2 用户痛点

1. **心智模型不统一**：检查模块上传后"离开首页"进入独立视图，而提取和润色模块始终"卡"在 Tab 面板里，体验割裂
2. **空间受限**：提取结果和润色预览在 Tab 面板的受限空间中显示，内容拥挤
3. **导航不一致**：检查模块有 header 区域的"返回主页"按钮，提取和润色模块只有面板内部的小按钮
4. **缺乏统一的流程感**：三个模块各自为政，用户无法形成一致的操作预期

### 1.3 核心设计原则

> **以检查模块的交互模式为标杆**，统一所有模块的流程框架：
>
> **「首页上传 → 离开首页进入独立结果视图 → Header 返回按钮回到首页」**

这样做的好处：
- 结果页获得**全屏宽度**，展示更从容
- 用户形成统一的**操作心智模型**：上传 → 全屏结果 → 返回
- Header 的返回按钮始终可用，导航**一致且明确**
- 三个模块的**内部组件（卡片、进度条、Diff 预览等）保持不变**，只是"外框"统一了

---

## 2. Constitution 影响

### 2.1 合规项

| 宪法原则 | 评估 |
|---------|------|
| 隐私优先 | ✅ 纯前端 UI 重构，不涉及数据处理变更 |
| 文件不落地 | ✅ 不影响，无后端变更 |
| 离线可用 | ✅ 不影响，无依赖变更 |
| 最小化第三方依赖 | ✅ 无新增依赖 |

### 2.2 扩展项

| 宪法原则 | 说明 |
|---------|------|
| UX 一致性 | ✅ 直接改善：三模块交互统一化 |
| 渐进增强 | ✅ 保留现有组件功能，仅调整编排层 |

---

## 3. User Scenarios & Testing

### US1: 提取模块 — 上传后进入独立结果视图
**Priority**: P1
**Why this priority**: 提取模块与检查模块差异最大，修改后交互提升最明显

**描述**: 用户在首页"提取规则"Tab 上传模板文档后，应离开首页（隐藏 Tab 导航），进入独立的全屏提取结果视图。Header 显示"← 返回主页"按钮。

**Acceptance Scenarios**:

```
Given 用户在首页"提取规则"Tab
When 用户上传模板文档并点击"开始提取规则"
Then 首页内容（含 Tab 导航）隐藏
And 显示独立的全屏"分析中"加载动画（FullscreenLoading 组件，紫色主题）
And Header 区域出现"← 返回主页"按钮

Given 提取完成，显示独立结果视图
When 用户点击 Header 的"← 返回主页"
Then 返回首页，Tab 自动定位到"提取规则"
And ExtractUploadPanel 保持保活状态（已选文件不丢失）

Given 提取完成，显示结果视图
When 用户浏览 ExtractResult（摘要卡片 + YAML 预览 + 规则管理）
Then 所有子组件的功能和样式与当前版本保持一致（保存、下载、重命名等）
And 结果区域享有全屏宽度，不再受 Tab 面板约束

Given 用户使用"文字描述"模式（AI 生成规则）
When 点击"AI 生成规则"
Then 同样离开首页，进入独立的"AI 生成中"加载动画 → 独立结果视图
```

**Edge Cases**:
- 提取出错时：toast 提示错误信息 + 回到 IDLE 状态（与检查模块一致）
- 用户在提取进行中点击"← 返回主页"：由于提取是同步 HTTP 请求（非 SSE），请求完成前按钮处于 disabled 状态（无需确认对话框）

---

### US2: 润色模块 — 上传后进入独立视图
**Priority**: P1
**Why this priority**: 润色模块的 SSE 流式处理和 Diff 预览最需要全屏空间

**描述**: 用户在首页"内容润色"Tab 上传文档并点击"开始内容润色"后，应离开首页进入独立的全屏润色视图。整个润色流程（上传 → 进度 → 预览 → 完成）都在独立视图中完成。

**Acceptance Scenarios**:

```
Given 用户在首页"内容润色"Tab
When 用户上传文档并点击"开始内容润色"
Then 首页内容（含 Tab 导航）隐藏
And 显示独立的"正在润色"进度视图（保留 PolishProgress 组件，但外层使用全屏布局）
And Header 区域出现"← 返回主页"按钮

Given 润色完成，进入 PolishPreview（Diff 对比视图）
When 用户逐条接受/拒绝建议
Then 预览组件享有全屏宽度（当前在 Tab 面板内空间受限）
And 所有子组件功能不变（筛选、批量接受/拒绝、应用下载等）

Given 用户在 PolishPreview 点击"应用选中的修改并下载"
When 下载完成
Then 显示独立的"润色完成"页面（FullscreenDone 组件，紫罗兰主题）
And 页面包含"润色新文档"按钮和润色历史列表

Given 润色正在进行中（SSE 流传输）
When 用户点击 Header 的"← 返回主页"
Then 弹出确认对话框："润色正在进行中，离开后未完成的进度不会保存。确定离开？"
And 用户确认后：中断 SSE 连接 → 清空所有润色进行中的状态 → 返回 IDLE
And 用户取消则留在当前页面

Given 用户查看润色历史记录
When 在首页点击润色历史中的某条记录
Then 离开首页，进入独立的 PolishPreview 只读视图（与检查模块的历史报告一致）
```

**Edge Cases**:
- 润色过程中浏览器刷新：`beforeunload` 保护由 `usePolishFlow()` Hook 内部管理，行为不变
- 润色出错（SSE 中断）：toast 提示错误 + 回到 IDLE 状态
- IndexedDB 恢复：仅当用户**切换到润色 Tab 且 Tab 可见**时才触发恢复，节省资源

---

### US3: 统一全屏状态框架 — 三 Hook 并行架构
**Priority**: P1
**Why this priority**: 这是实现 US1 和 US2 的基础架构，避免重复代码

**描述**: 将三个模块的流程逻辑分别封装到独立的自定义 Hook 中，App.tsx 仅作为状态机编排器，消费三个 Hook 暴露的聚合接口。

**Acceptance Scenarios**:

```
Given App.tsx 的状态机
When 重构 appState 类型
Then appState 应扩展为支持三模块的统一状态：
  - "IDLE"（首页，含 Tab 导航）
  - 检查流程："UPLOADING" → "CHECKING" → "REPORT_READY" → "FIXING" → "FIX_PREVIEW" → "DOWNLOADED"
  - 提取流程："EXTRACTING" → "EXTRACT_RESULT"
  - 润色流程："POLISHING" → "POLISH_PREVIEW" → "POLISH_APPLYING" → "POLISH_DONE"

Given 任意模块处于非 IDLE 状态
When 渲染页面
Then Tab 导航隐藏
And Header 区域显示"← 返回主页"按钮
And 主内容区显示对应模块的全屏视图

Given 用户点击"← 返回主页"
When 从任意非 IDLE 状态返回
Then 如果当前处于 POLISHING 状态 → 弹确认对话框（见 US2）
Then 否则直接回到 IDLE 状态
And activeTab 自动定位到触发该流程的模块 Tab
And 面板保持保活状态（display 控制）

Given App.tsx 架构
When 编排三模块流程
Then App.tsx 通过三个自定义 Hook 消费聚合数据：
  - useCheckFlow(setAppState)    ← 已有
  - useExtractFlow(setAppState)  ← 新增
  - usePolishFlow(setAppState)   ← 新增
And App.tsx 不直接持有任何模块的业务状态（suggestions/report/result 等）
And 每个 Hook 对外暴露统一风格的接口（handlers + data + reset）
```

---

### US4: 统一 Loading / 完成页风格 — 共享组件
**Priority**: P1 *(从 P2 提升，因为检查模块也要迁移)*
**Why this priority**: 三个模块全部迁移到共享组件，是交互统一的核心视觉保障

**描述**: 新增 `FullscreenLoading` 和 `FullscreenDone` 两个共享组件，三个模块的 Loading 和完成页全部使用它们，通过 props 区分颜色和文案。**检查模块现有的内联 Loading/Done JSX 也要迁移到共享组件**。

**设计模板**:

| 元素 | 检查模块 | 提取模块 | 润色模块 |
|------|---------|---------|---------|
| **Loading 主色** | blue（蓝色） | violet（紫色） | violet（紫罗兰色） |
| **Loading 图标** | search | scan-extract | sparkles |
| **Loading 标题** | 正在深度分析文档... | 正在分析模板文档... | 正在智能润色... |
| **Loading 副文字** | AI 正在比对各项规则 | 正在提取格式规则 | AI 正在优化您的文档内容 |
| **完成页主色** | green → emerald 渐变 | green → emerald 渐变 | green → emerald 渐变 |
| **完成页标题** | 大功告成！ | 规则提取完成！ | 润色完成！ |
| **完成页按钮** | 检查新文档 | 提取新规则 | 润色新文档 |

**FullscreenLoading Props**:

```typescript
interface FullscreenLoadingProps {
  color: "blue" | "emerald" | "violet";  // 主色
  icon: string;                           // SvgIcon name
  title: string;                          // 主标题
  subtitle?: string;                      // 副文字
}
```

**FullscreenDone Props**:

```typescript
interface FullscreenDoneProps {
  title: string;                          // "大功告成！" / "润色完成！" 等
  subtitle?: string;                      // 副文字
  buttonText: string;                     // "检查新文档" / "润色新文档" 等
  onReset: () => void;                    // 回到 IDLE
  children?: React.ReactNode;             // 额外内容（如润色历史列表）
}
```

**注意**：
- 润色模块的进度视图（PolishProgress：进度条 + 批次信息 + 实时预览）是**润色特有的**，不使用 FullscreenLoading。它直接在全屏布局中渲染。
- 修复中的 Loading（FIXING 状态）也使用 FullscreenLoading（emerald 色 + sparkles 图标）

**Acceptance Scenarios**:

```
Given 检查模块 CHECKING / FIXING 状态
When 渲染加载动画
Then 使用 FullscreenLoading 组件（替代现有内联 JSX）
And 视觉效果与改造前完全一致

Given 检查模块 DOWNLOADED 状态
When 渲染完成页
Then 使用 FullscreenDone 组件（替代现有内联 JSX）
And 视觉效果与改造前完全一致

Given 提取/润色模块的 Loading 和完成页
When 渲染
Then 使用相同的 FullscreenLoading / FullscreenDone 组件
And 通过 props 配置模块专属的颜色、图标、文案
```

---

### US5: 提取模块首页布局优化
**Priority**: P2
**Why this priority**: 配合流程统一，丰富提取模块首页内容

**描述**: 提取模块首页 Tab 保留现有的上传区 + RuleManager，**新增提取历史列表**。RuleManager 在首页和结果页都保留（首页方便用户直接管理规则，无需走提取流程）。新增 IndexedDB `extract-history` store 存储提取操作历史。

**Acceptance Scenarios**:

```
Given 首页"提取规则"Tab
When 渲染面板
Then 显示：模式切换（上传模板 / 文字描述）+ 对应的上传/输入区
And 下方显示 RuleManager（已保存规则管理，功能不变）
And 下方显示"提取历史"列表（新增，参考 PolishHistoryList 风格）

Given 用户完成一次提取
When 提取成功
Then 自动记录到 IndexedDB extract-history store
And 首页提取历史列表自动刷新
And 点击历史记录 → 离开首页 → 全屏显示该次提取结果（只读）

Given 提取完成，进入独立结果视图
When 渲染 ExtractResult
Then 结果区域保留完整功能（摘要 + YAML 预览 + 保存/下载）
And 下方也显示 RuleManager（用户可在结果页管理规则）
```

**新增 IndexedDB Store**:

```typescript
// cache.ts 新增
interface ExtractHistoryRecord {
  id: string;              // 唯一ID（crypto.randomUUID()）
  filename: string;        // 源文件名 或 "文字描述"
  mode: "upload" | "text"; // 提取模式
  result: ExtractResult;   // 提取结果快照
  created_at: number;      // 时间戳
}
// store 名: "extract-history"
// 过期: 30 天（与检查历史一致）
```

---

## 4. Requirements

### 4.1 Functional Requirements

| 编号 | 要求 | 级别 |
|------|------|------|
| FR-001 | App.tsx 的 `appState` 必须扩展为统一状态机，覆盖三个模块的全部流程状态（含 UPLOADING） | MUST |
| FR-002 | 提取模块上传后必须离开首页，进入独立全屏视图 | MUST |
| FR-003 | 润色模块上传后必须离开首页，进入独立全屏视图 | MUST |
| FR-004 | 非 IDLE 状态下，Header 必须显示"← 返回主页"按钮 | MUST |
| FR-005 | 返回首页时，activeTab 必须自动定位到触发该流程的模块 | MUST |
| FR-006 | 提取和润色模块的内部子组件（ExtractResult、PolishPreview、PolishProgress 等）功能和样式不得改变 | MUST |
| FR-007 | 润色进行中（SSE 传输中）点击返回必须弹确认对话框，明确告知"未完成进度不保存" | MUST |
| FR-008 | 润色中断后必须清空所有进行中状态，不缓存未完成数据 | MUST |
| FR-009 | 三个模块的 Loading 页必须使用 FullscreenLoading 共享组件（含检查模块迁移） | MUST |
| FR-010 | 三个模块的完成页必须使用 FullscreenDone 共享组件（含检查模块迁移） | MUST |
| FR-011 | Tab 面板保活策略不变（display: none/block），切换 Tab 不丢失已选文件 | MUST |
| FR-012 | 润色 IndexedDB 缓存恢复仅在润色 Tab 可见时触发 | MUST |
| FR-013 | 三个模块分别使用独立的自定义 Hook（useCheckFlow / useExtractFlow / usePolishFlow） | MUST |
| FR-014 | 错误处理统一使用 toast 提示 + 回到 IDLE 状态（不使用独立错误视图） | MUST |
| FR-015 | `beforeunload` 保护由 `usePolishFlow()` Hook 内部管理 | MUST |
| FR-016 | 提取模块首页保留 RuleManager（不移走） | MUST |
| FR-017 | 新增 IndexedDB `extract-history` store 存储提取操作历史 | SHOULD |
| FR-018 | 提取模块首页新增 ExtractHistoryList 组件 | SHOULD |
| FR-019 | 现有的 IndexedDB / localStorage 持久化逻辑不得被破坏 | MUST NOT break |
| FR-020 | 润色模块的 SSE 连接、IndexedDB 恢复等逻辑不得被破坏 | MUST NOT break |

### 4.2 Key Entities

**扩展后的 AppState 类型**:

```typescript
type AppState =
  // 首页（含 Tab 导航）
  | "IDLE"
  // 检查流程（保持不变）
  | "UPLOADING"
  | "CHECKING"
  | "REPORT_READY"
  | "FIXING"
  | "FIX_PREVIEW"
  | "DOWNLOADED"
  // 提取流程（新增）
  | "EXTRACTING"
  | "EXTRACT_RESULT"
  // 润色流程（新增，从 PolishPanel 内部提升到 App 级）
  | "POLISHING"
  | "POLISH_PREVIEW"
  | "POLISH_APPLYING"
  | "POLISH_DONE";
```

**模块返回 Tab 映射**:

```typescript
const stateToTab: Record<AppState, "check" | "extract" | "polish"> = {
  IDLE: "check", // 默认
  UPLOADING: "check",
  CHECKING: "check",
  REPORT_READY: "check",
  FIXING: "check",
  FIX_PREVIEW: "check",
  DOWNLOADED: "check",
  EXTRACTING: "extract",
  EXTRACT_RESULT: "extract",
  POLISHING: "polish",
  POLISH_PREVIEW: "polish",
  POLISH_APPLYING: "polish",
  POLISH_DONE: "polish",
};
```

---

## 5. 架构设计

### 5.1 三 Hook 并行架构（核心设计）

**设计目标**：App.tsx 作为纯编排层，不持有任何模块的业务状态。每个模块的全部业务逻辑（状态、副作用、回调）封装在独立 Hook 中。

**架构图**：
```
App.tsx (编排器: appState + activeTab + 渲染映射)
  │
  ├── useCheckFlow(setAppState)     ← 已有，无需改动
  │   └── 暴露: { handlers, data, reset }
  │
  ├── useExtractFlow(setAppState)   ← 新增
  │   └── 暴露: { handlers, data, reset }
  │
  └── usePolishFlow(setAppState)    ← 新增
      ├── 内部: usePolishSSE() + 所有润色状态
      ├── 内部: beforeunload 注册/清理
      ├── 内部: IndexedDB 恢复逻辑（由 triggerRestore 按需触发）
      └── 暴露: { handlers, data, reset, triggerRestore, abort, isPolishing }
```

**useExtractFlow Hook 接口设计**:

```typescript
function useExtractFlow(
  setAppState: (s: AppState) => void
) {
  return {
    // 事件处理
    handleExtractStart: () => void,      // 触发提取（设置 EXTRACTING）
    handleExtractComplete: (result: ExtractResult) => void,  // 提取完成
    handleExtractError: (msg: string) => void,  // 提取出错
    
    // 数据
    extractResult: ExtractResult | null,
    
    // 控制
    reset: () => void,                   // 重置状态
  };
}
```

**usePolishFlow Hook 接口设计**:

```typescript
function usePolishFlow(
  setAppState: (s: AppState) => void
) {
  return {
    // 事件处理（供 PolishUploadPanel 调用）
    handleStartPolish: (file: File) => Promise<void>,
    handleApplyAndDownload: (acceptedIndices: number[]) => Promise<void>,
    handleViewHistory: (record: PolishHistoryRecord) => void,
    
    // 数据（供全屏视图组件消费）
    suggestions: PolishSuggestion[],
    summary: PolishSummary | null,
    sessionId: string,
    progress: { current: number; total: number },
    totalParagraphs: number,
    polishableParagraphs: number,
    isReadOnly: boolean,
    sessionExpired: boolean,
    initialDecisions: Record<number, boolean> | undefined,
    historyRefreshKey: number,
    
    // 控制
    reset: () => void,                   // 重置全部状态
    abort: () => void,                   // 中断 SSE
    triggerRestore: () => void,          // 按需触发 IndexedDB 恢复
    isPolishing: boolean,                // 是否正在润色（用于返回按钮确认判断）
  };
}
```

### 5.2 状态提升策略

**改造前**：
```
App.tsx (appState: 仅控制检查流程)
├── [IDLE] Tab 导航
│   ├── UploadPanel (检查上传)
│   ├── ExtractPanel (内部自管: idle → uploading → done)  ← 自治
│   └── PolishPanel  (内部自管: IDLE → POLISHING → PREVIEW → DONE)  ← 自治
├── [CHECKING] 检查 Loading（内联 JSX）
├── [REPORT_READY] CheckReport
├── [FIXING] 修复 Loading（内联 JSX）
├── [FIX_PREVIEW] FixPreview
└── [DOWNLOADED] 完成页（内联 JSX）
```

**改造后**：
```
App.tsx (appState: 统一控制三模块流程，自身 0 业务状态)
├── [IDLE] Tab 导航（display:none/block 保活）
│   ├── UploadPanel + HistoryList                           ← 不变
│   ├── ExtractUploadPanel + RuleManager + ExtractHistoryList  ← 重构 + 新增历史
│   └── PolishUploadPanel + PolishHistoryList               ← 重构
├── [UPLOADING] FullscreenLoading（蓝色，迁移自内联 JSX）
├── [CHECKING] FullscreenLoading（蓝色，迁移自内联 JSX）
├── [REPORT_READY] CheckReport（不变）
├── [FIXING] FullscreenLoading（翡翠色，迁移自内联 JSX）
├── [FIX_PREVIEW] FixPreview（不变）
├── [DOWNLOADED] FullscreenDone（迁移自内联 JSX）
├── [EXTRACTING] FullscreenLoading（紫色，新增）
├── [EXTRACT_RESULT] ExtractResult 全屏（新增编排）
├── [POLISHING] PolishProgress 全屏（新增编排，润色特有的进度视图）
├── [POLISH_PREVIEW] PolishPreview 全屏（新增编排）
├── [POLISH_APPLYING] FullscreenLoading（紫罗兰色，新增）
└── [POLISH_DONE] FullscreenDone（紫罗兰主题，新增编排）
```

### 5.3 组件职责重新划分

| 组件 | 改造前 | 改造后 |
|------|-------|-------|
| **App.tsx** | 仅编排检查流程 + 持有检查状态 | 纯编排层，消费三个 Hook 的聚合接口，自身 0 业务状态 |
| **ExtractPanel** | 自治状态机 (idle/uploading/done/error) | **拆分**为 `ExtractUploadPanel`（首页上传入口 + RuleManager） |
| **PolishPanel** | 自治状态机 (IDLE/UPLOADING/POLISHING/...) | **拆分**为 `PolishUploadPanel`（首页上传入口） |
| **ExtractResult** | ExtractPanel 内部渲染 | App.tsx 直接渲染（全屏），移除内部返回按钮 |
| **PolishProgress** | PolishPanel 内部渲染 | App.tsx 直接渲染（全屏），接收 props |
| **PolishPreview** | PolishPanel 内部渲染 | App.tsx 直接渲染（全屏），移除内部返回按钮 |
| **检查 Loading/Done** | App.tsx 内联 JSX | 迁移到 FullscreenLoading / FullscreenDone 共享组件 |

### 5.4 数据流调整

**提取模块 — useExtractFlow**：
- `ExtractUploadPanel`：调用 Hook 暴露的 `handleExtractStart` → Hook 内部设置 `EXTRACTING`
- 提取 API 返回结果 → Hook 调用 `handleExtractComplete` → 设置 `EXTRACT_RESULT`
- App.tsx 根据 `appState === "EXTRACT_RESULT"` 渲染 `ExtractResult`，数据从 Hook 的 `extractResult` 获取

**润色模块 — usePolishFlow**：
- `PolishUploadPanel`：调用 Hook 暴露的 `handleStartPolish(file)` → Hook 内部设置 `POLISHING`
- Hook 内部调用 `usePolishSSE`，SSE 回调更新 Hook 内部状态
- `complete` 事件 → Hook 设置 `POLISH_PREVIEW` + 缓存 IndexedDB
- App.tsx 根据 `appState` 渲染对应全屏组件，数据从 Hook 获取
- **beforeunload**：Hook 内部 `useEffect` 监听 `appState`，当 `POLISHING` 时注册、离开时清理
- **IndexedDB 恢复**：Hook 暴露 `triggerRestore()`，App.tsx 在润色 Tab 可见时调用

**润色中断流程**：
1. 用户点击"← 返回主页"
2. App.tsx 检查 `polish.isPolishing === true`
3. 弹出 TDesign `Dialog.confirm()`："润色正在进行中，离开后未完成的进度不会保存。确定离开？"
4. 用户确认 → 调用 `polish.abort()` + `polish.reset()` + `setAppState("IDLE")`
5. 用户取消 → 什么都不做

### 5.5 IndexedDB 恢复的按需触发

```typescript
// App.tsx 中
useEffect(() => {
  if (activeTab === "polish" && appState === "IDLE") {
    polish.triggerRestore();
  }
}, [activeTab, appState]);
```

`usePolishFlow.triggerRestore()` 内部：
1. 检查是否已经恢复过（避免重复）
2. 调用 `getLatestPolishResult()`
3. 如果有缓存 → 设置 suggestions/summary/sessionId → 验证后端 session → 设置 `POLISH_PREVIEW`
4. 如果无缓存 → 什么都不做

---

## 6. 文件结构

```
frontend/src/
├── App.tsx                                    [修改] 纯编排层，消费三 Hook
├── types/index.ts                             [修改] 扩展 AppState 类型（清理废弃值）
├── components/
│   ├── [检查模块]
│   │   ├── UploadPanel.tsx                    [不变]
│   │   ├── FileDropzone.tsx                   [不变]
│   │   ├── RuleSelector.tsx                   [不变]
│   │   ├── CheckReport.tsx                    [不变]
│   │   ├── CheckReportSummary.tsx             [不变]
│   │   ├── CheckReportCategory.tsx            [不变]
│   │   ├── CheckReportItem.tsx                [不变]
│   │   ├── FixPreview.tsx                     [不变]
│   │   ├── HistoryList.tsx                    [不变]
│   │   ├── AiSummary.tsx                      [不变]
│   │   ├── AiChatPanel.tsx                    [不变]
│   │   └── RuleDetail.tsx                     [不变]
│   ├── [提取模块]
│   │   ├── ExtractUploadPanel.tsx             [重构] 从 ExtractPanel 瘦身，仅首页上传 + RuleManager
│   │   ├── ExtractUploadMode.tsx              [不变] 被 ExtractUploadPanel 引用
│   │   ├── ExtractTextMode.tsx                [不变] 被 ExtractUploadPanel 引用
│   │   ├── ExtractResult.tsx                  [小改] 移除内部返回按钮
│   │   ├── ExtractHistoryList.tsx             [新增] 提取操作历史列表
│   │   └── RuleManager.tsx                    [不变] 首页 + 结果页都保留
│   ├── [润色模块]
│   │   ├── PolishUploadPanel.tsx              [重构] 从 PolishPanel 瘦身，仅首页上传入口
│   │   ├── PolishProgress.tsx                 [小改] 接口调整，全部通过 props 接收
│   │   ├── PolishPreview.tsx                  [小改] 移除内部返回按钮
│   │   ├── PolishDone.tsx                     [删除] 功能由 FullscreenDone 共享组件替代
│   │   └── PolishHistoryList.tsx              [不变]
│   └── [共享组件]
│       ├── FullscreenLoading.tsx              [新增] 统一全屏加载动画（检查/提取/润色/修复共用）
│       ├── FullscreenDone.tsx                 [新增] 统一全屏完成页（检查/提取/润色共用）
│       ├── ErrorBoundary.tsx                  [不变]
│       └── icons/SvgIcon.tsx                  [不变]
├── hooks/
│   ├── useCheckFlow.ts                        [小改] Loading/Done 迁移到共享组件后的适配
│   ├── useExtractFlow.ts                      [新增] 提取流程 Hook
│   ├── usePolishFlow.ts                       [新增] 润色流程 Hook（封装 SSE + beforeunload + IndexedDB 恢复）
│   └── usePolishSSE.ts                        [不变] 被 usePolishFlow 内部调用
├── services/
│   ├── api.ts                                 [不变]
│   ├── cache.ts                               [修改] 新增 extract-history store + CRUD
│   ├── aiCache.ts                             [不变]
│   ├── ruleStorage.ts                         [不变]
│   └── sse.ts                                 [不变]
└── utils/                                     [不变]
```

---

## 7. Testing Strategy

### 7.1 后端测试

**无后端变更**，现有 168 个测试保持不变。

### 7.2 前端手动测试清单

由于本项目前端无自动化测试框架，以下为手动验收测试清单：

**检查模块（回归测试）**：
- [ ] 上传检查 → FullscreenLoading → 全屏报告 → 修复 → FullscreenLoading → 预览 → 下载 → FullscreenDone：流程不变，视觉不变
- [ ] 历史报告查看（只读模式）：流程不变
- [ ] 规则切换重检：功能不变

**提取模块（重点测试）**：
- [ ] 上传模板 → 离开首页 → FullscreenLoading（紫色） → 全屏 ExtractResult
- [ ] 文字描述模式 → AI 生成 → FullscreenLoading → 全屏结果
- [ ] 结果页：摘要卡片 + YAML 预览 + 保存/下载功能正常
- [ ] 结果页：RuleManager 功能正常（重命名/删除/下载）
- [ ] 首页：RuleManager 仍然可见可用
- [ ] Header "← 返回主页" → 回到首页"提取规则"Tab
- [ ] 提取出错 → toast 提示 → 回到 IDLE（提取规则 Tab）
- [ ] 提取历史列表：完成提取后自动出现记录，可点击查看

**润色模块（重点测试）**：
- [ ] 上传 → 离开首页 → 全屏 PolishProgress（润色特有进度视图）
- [ ] SSE 流式接收 → 进度更新正常 → 自动切换到全屏 PolishPreview
- [ ] PolishPreview：Diff 对比 + 逐条接受/拒绝 + 筛选 + 批量操作
- [ ] 应用修改并下载 → FullscreenDone（紫罗兰主题）
- [ ] 润色进行中点击返回 → 弹确认对话框 → 确认后清空状态并返回 IDLE
- [ ] 润色进行中点击返回 → 弹确认对话框 → 取消后留在原处
- [ ] 润色进行中刷新页面 → beforeunload 警告仍生效
- [ ] 首页润色历史 → 点击记录 → 全屏只读 PolishPreview
- [ ] IndexedDB 恢复：切换到润色 Tab 时恢复（非其他 Tab）
- [ ] 润色出错 → toast 提示 → 回到 IDLE
- [ ] Tab 切换后已选文件不丢失（保活验证）

**跨模块测试**：
- [ ] 检查模块全屏 → 返回 → 切换到润色 Tab → 上传润色 → 全屏 → 返回 → Tab 正确定位到润色
- [ ] 三个模块分别完成完整流程，验证 Tab 面板状态不互相干扰
- [ ] 在润色 Tab 有缓存恢复的情况下，先看检查 Tab，再切到润色 Tab → 恢复触发

---

## 8. Success Criteria

| 编号 | 标准 | 量化 |
|------|------|------|
| SC-001 | 三个模块的「上传 → 全屏结果 → Header 返回」交互模式完全一致 | 3/3 模块 |
| SC-002 | 非 IDLE 状态下 Tab 导航隐藏、Header 返回按钮可见 | 所有 12 个非 IDLE 状态 |
| SC-003 | 返回首页时 activeTab 自动定位到触发模块 | 3/3 模块 |
| SC-004 | 检查模块回归测试全部通过（含 FullscreenLoading/Done 迁移） | 0 regression |
| SC-005 | 提取模块所有子组件功能完整（保存/下载/重命名/删除/YAML 预览） | 全部功能 |
| SC-006 | 润色模块 SSE / beforeunload / IndexedDB 恢复全部正常 | 全部功能 |
| SC-007 | Loading 和完成页视觉风格统一（三模块 + 修复共 4 处） | 4/4 处 |
| SC-008 | 后端 168 个测试全部通过 | 168/168 |
| SC-009 | App.tsx 自身不持有任何模块业务状态（全部在 Hook 内） | 0 业务 useState |
| SC-010 | 润色中断弹确认 + 不保存未完成数据 | 100% |

---

## 9. 约束与风险

### 9.1 技术风险

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 润色模块 `usePolishFlow` 封装复杂度高（SSE + IndexedDB 恢复 + beforeunload + 多阶段状态） | 🟠 中 | 分阶段实施：先提取模块（简单），再润色模块；`usePolishSSE` 保持不变，`usePolishFlow` 只是它的封装层 |
| ExtractPanel / PolishPanel 拆分后可能遗漏状态传递 | 🟡 低 | 逐一对照现有 state/effect/callback，确保全部迁移到 Hook |
| FullscreenLoading/Done 迁移检查模块时视觉回归 | 🟡 低 | Props 设计精确匹配当前内联 JSX 的样式参数，逐像素比对 |
| Tab 保活 + IndexedDB 按需恢复的交互 | 🟡 低 | `triggerRestore` 内部加「已恢复」标记，防止重复恢复 |

### 9.2 向后兼容性

- **后端 API**：完全不变，0 影响
- **IndexedDB 数据格式**：不变，新增 `extract-history` store 不影响现有 store
- **localStorage 数据格式**：不变，`ruleStorage` 完全不动
- **用户习惯**：提取和润色从 Tab 内切换改为全屏切换，方向是"与已有的检查模块对齐"

### 9.3 实施建议

建议分 **3 个 Phase** 实施：

| Phase | 内容 | 复杂度 | 预估 |
|-------|------|--------|------|
| **Phase 1** | 共享组件 `FullscreenLoading` / `FullscreenDone` + 检查模块迁移 + AppState 类型扩展 | 低 | 基础设施，先做确保稳定 |
| **Phase 2** | `useExtractFlow` Hook + `ExtractUploadPanel` 重构 + 提取模块全屏编排 + ExtractHistoryList + IndexedDB store | 中 | 提取模块较简单，作为练手 |
| **Phase 3** | `usePolishFlow` Hook + `PolishUploadPanel` 重构 + 润色模块全屏编排 + 确认对话框 + 按需恢复 | 高 | 润色最复杂，最后做 |
