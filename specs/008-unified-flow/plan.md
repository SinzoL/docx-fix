# Implementation Plan: 008 统一三模块交互流程

- **Spec**: `specs/008-unified-flow/spec.md`
- **Status**: Draft
- **Created**: 2026-03-11

---

## Phase 1: 共享基础设施 + 检查模块迁移

> **目标**：建立共享组件、扩展类型系统，将检查模块的内联 JSX 迁移到共享组件，确保回归 0 差异。

### Task 1.1: 扩展 AppState 类型

**文件**: `frontend/src/types/index.ts`

**改动**:
- 扩展 `AppState` 联合类型，新增提取和润色流程的 8 个状态
- 新增 `ExtractHistoryRecord` 类型（为 Phase 2 准备）

```typescript
// 改造前
export type AppState =
  | "IDLE"
  | "UPLOADING"
  | "CHECKING"
  | "REPORT_READY"
  | "FIXING"
  | "FIX_PREVIEW"
  | "DOWNLOADED";

// 改造后
export type AppState =
  | "IDLE"
  // 检查流程（不变）
  | "UPLOADING"
  | "CHECKING"
  | "REPORT_READY"
  | "FIXING"
  | "FIX_PREVIEW"
  | "DOWNLOADED"
  // 提取流程（新增）
  | "EXTRACTING"
  | "EXTRACT_RESULT"
  // 润色流程（新增）
  | "POLISHING"
  | "POLISH_PREVIEW"
  | "POLISH_APPLYING"
  | "POLISH_DONE";
```

新增类型:
```typescript
export interface ExtractHistoryRecord {
  id: string;
  filename: string;
  mode: "upload" | "text";
  result: ExtractResult;
  created_at: number;
  expires_at: number;
}
```

**验证**: TypeScript 编译通过，无类型错误。

---

### Task 1.2: 新增 FullscreenLoading 共享组件

**文件**: `frontend/src/components/FullscreenLoading.tsx` (新建)

**设计**:
- Props: `{ color, icon, title, subtitle }`
- 视觉效果：从 App.tsx 第 168-180 行（CHECKING）和第 199-211 行（FIXING）的内联 JSX 中抽取
- 支持 3 种颜色主题：`blue`(检查)、`emerald`(修复)、`violet`(提取/润色)
- 外层容器使用 `glass-card rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto mt-8` 样式（与现有完全一致）
- 内部结构：旋转圆圈动画 + 图标 + 标题 + 副标题

**各颜色映射**:

| 属性 | blue | emerald | violet |
|------|------|---------|--------|
| 外环 | `border-blue-100` | `border-emerald-100` | `border-violet-100` |
| 内环 | `border-blue-500` | `border-emerald-500` | `border-violet-500` |

**验证**: 替换检查模块 CHECKING/FIXING 后，像素级视觉无差异。

---

### Task 1.3: 新增 FullscreenDone 共享组件

**文件**: `frontend/src/components/FullscreenDone.tsx` (新建)

**设计**:
- Props: `{ title, subtitle, buttonText, onReset, children }`
- 视觉效果：从 App.tsx 第 225-241 行（DOWNLOADED）的内联 JSX 中抽取
- 渐变球动画 + 标题 + 副标题 + 操作按钮 + 可选子内容区（用于放置 HistoryList、PolishHistoryList 等）

**验证**: 替换检查模块 DOWNLOADED 后，像素级视觉无差异。

---

### Task 1.4: 迁移检查模块到共享组件

**文件**: `frontend/src/App.tsx`

**改动**:
1. 导入 `FullscreenLoading` 和 `FullscreenDone`
2. 替换 CHECKING 状态的内联 JSX（第 168-180 行） → `<FullscreenLoading color="blue" icon="search" title="正在深度分析文档..." subtitle="这可能需要几秒钟，AI 正在比对各项规则" />`
3. 替换 FIXING 状态的内联 JSX（第 199-211 行） → `<FullscreenLoading color="emerald" icon="sparkles" title="正在魔法修复格式..." subtitle="即将完成，让您的文档焕然一新" />`
4. 替换 DOWNLOADED 状态的内联 JSX（第 225-241 行） → `<FullscreenDone title="大功告成！" subtitle="修复后的完美文档已下载到本地" buttonText="检查新文档" onReset={handleReset} />`

**验证**: 检查模块完整流程回归测试：上传 → Loading → 报告 → 修复 → Loading → 预览 → 下载 → 完成页。视觉 & 功能无变化。

---

### Task 1.5: 新增 stateToTab 映射工具

**文件**: `frontend/src/App.tsx`（或提取为 utils）

**改动**: 新增 `stateToTab` 常量映射，供返回按钮和 Tab 定位使用。

```typescript
const stateToTab: Record<AppState, "check" | "extract" | "polish"> = {
  IDLE: "check",
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

**改造 handleReset**: 返回时自动将 `activeTab` 设置为 `stateToTab[appState]`。

**验证**: 从检查模块返回时 Tab 定位到 "check"。

---

### Phase 1 完成标准

- [ ] `AppState` 扩展为 14 个状态，TypeScript 编译通过
- [ ] `FullscreenLoading` 组件创建，支持 blue/emerald/violet 3 种主题
- [ ] `FullscreenDone` 组件创建，支持 children 插槽
- [ ] 检查模块 CHECKING/FIXING/DOWNLOADED 全部使用共享组件，视觉无差异
- [ ] 返回按钮使用 `stateToTab` 自动定位正确 Tab
- [ ] `ExtractHistoryRecord` 类型已定义

---

## Phase 2: 提取模块重构

> **目标**：将 ExtractPanel 的自治状态机拆分为 `useExtractFlow` Hook + `ExtractUploadPanel` 上传入口，提取结果由 App.tsx 全屏编排。

### Task 2.1: 创建 useExtractFlow Hook

**文件**: `frontend/src/hooks/useExtractFlow.ts` (新建)

**接口设计** (参考 useCheckFlow 的模式):

```typescript
function useExtractFlow(setAppState: (s: AppState) => void) {
  // 内部状态
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [extractFilename, setExtractFilename] = useState("");
  const [extractMode, setExtractMode] = useState<"upload" | "text">("upload");
  const [ruleName, setRuleName] = useState("");
  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [ruleManagerKey, setRuleManagerKey] = useState(0);

  return {
    // 事件处理
    handleExtractStart: () => void,             // 设置 EXTRACTING
    handleExtractComplete: (result, filename, mode) => void,  // 设置 EXTRACT_RESULT + 保存历史
    handleExtractError: (msg: string) => void,  // toast + IDLE
    
    // 数据
    extractResult,
    extractFilename,
    extractMode,
    ruleName,
    saveDialogVisible,
    ruleManagerKey,
    
    // 控制
    setRuleName,
    setSaveDialogVisible,
    setRuleManagerKey,
    handleSave: () => void,           // 保存规则到 localStorage
    handleDownload: () => void,       // 下载 YAML
    reset: () => void,                // 清空状态，回到 IDLE
  };
}
```

**从 ExtractPanel 迁移的逻辑**:
- `handleExtract` → 拆分为 `handleExtractStart`（触发 EXTRACTING）+ `handleExtractComplete`（结果就绪）
- `handleSave` → 保存到 ruleStorage + 刷新 RuleManager key
- `handleDownload` → 下载 YAML
- 新增：`handleExtractComplete` 中自动保存到 IndexedDB extract-history

**注意**：文件上传、模式选择等 UI 交互状态（selectedFile、textInput 等）保留在 `ExtractUploadPanel` 组件内部，不提升到 Hook。Hook 只管理「流程状态 + 结果数据」。

---

### Task 2.2: 新增 IndexedDB extract-history store

**文件**: `frontend/src/services/cache.ts`

**改动**:
1. `DB_VERSION` 从 `2` 升至 `3`
2. `onupgradeneeded` 新增 `oldVersion < 3` 分支，创建 `extract-history` store（keyPath `id`，索引 `created_at` / `expires_at`）
3. 新增 CRUD 函数（参考 polish-history 的实现模式）：
   - `saveExtractHistory(record: ExtractHistoryRecord): Promise<void>`
   - `getExtractHistoryList(): Promise<ExtractHistoryRecord[]>`
   - `getExtractHistory(id: string): Promise<ExtractHistoryRecord | undefined>`
   - `deleteExtractHistory(id: string): Promise<void>`
   - `cleanExpiredExtract(): Promise<number>`
4. 过期时间：30 天（与检查历史一致）

**验证**: 已有的 `history` 和 `polish-history` store 不受影响（IndexedDB 版本升级兼容）。

---

### Task 2.3: 重构 ExtractUploadPanel

**文件**: `frontend/src/components/ExtractUploadPanel.tsx` (新建，从 ExtractPanel 瘦身)

**保留在组件内部的状态**:
- `mode` (upload/text)
- `selectedFile`
- `textInput`、`llmLoading`、`llmError`（AI 模式相关）

**通过 props 接收的回调/数据** (来自 useExtractFlow):
```typescript
interface ExtractUploadPanelProps {
  onExtractStart: () => void;
  onExtractComplete: (result: ExtractResult, filename: string, mode: "upload" | "text") => void;
  onExtractError: (msg: string) => void;
  ruleManagerKey: number;
  onRuleManagerChange: () => void;
}
```

**组件职责**:
- 渲染模式切换 Tab（上传模板 / 文字描述）
- 渲染 `ExtractUploadMode` / `ExtractTextMode`
- 处理文件选择和上传
- 调用 `extractRules` / `generateRules` API
- 上传前调用 `onExtractStart()`，成功后调用 `onExtractComplete(result, filename, mode)`
- 渲染 `RuleManager`
- **不渲染** ExtractResult（由 App.tsx 全屏渲染）

---

### Task 2.4: 新增 ExtractHistoryList 组件

**文件**: `frontend/src/components/ExtractHistoryList.tsx` (新建)

**设计**: 参考 `PolishHistoryList.tsx` (179 行)

```typescript
interface ExtractHistoryListProps {
  onViewResult?: (record: ExtractHistoryRecord) => void;
  refreshKey?: number;
}
```

**功能**:
- 从 IndexedDB `extract-history` store 加载列表
- 展示：文件名、提取模式（上传/AI生成）、时间
- 删除单条（二次确认 Dialog）
- 点击查看 → 调用 `onViewResult`
- 空状态提示
- 布局与 PolishHistoryList 保持一致

---

### Task 2.5: 小改 ExtractResult 组件

**文件**: `frontend/src/components/ExtractResult.tsx`

**改动**:
- 移除顶部「← 重新提取」返回按钮（返回由 Header 统一处理）
- 其他功能（摘要卡片、YAML 预览、保存/下载对话框、RuleManager 插槽）完全不变

**验证**: 全屏渲染时布局正确，功能完整。

---

### Task 2.6: App.tsx 集成提取模块

**文件**: `frontend/src/App.tsx`

**改动**:
1. 导入 `useExtractFlow`、`ExtractUploadPanel`、`ExtractHistoryList`、`ExtractResult`
2. 调用 `const extract = useExtractFlow(setAppState);`
3. Tab 面板中替换 `<ExtractPanel />` 为：
   ```tsx
   <div style={{ display: activeTab === "extract" ? "block" : "none" }}>
     <ExtractUploadPanel
       onExtractStart={extract.handleExtractStart}
       onExtractComplete={extract.handleExtractComplete}
       onExtractError={extract.handleExtractError}
       ruleManagerKey={extract.ruleManagerKey}
       onRuleManagerChange={() => extract.setRuleManagerKey(k => k + 1)}
     />
     <div className="mt-8">
       <ExtractHistoryList onViewResult={extract.handleViewHistory} refreshKey={extract.historyRefreshKey} />
     </div>
   </div>
   ```
4. 新增全屏渲染分支：
   - `EXTRACTING` → `<FullscreenLoading color="violet" icon="scan-extract" title="正在分析模板文档..." subtitle="正在提取格式规则" />`
   - `EXTRACT_RESULT` → `<ExtractResult ... />` 全屏渲染（数据从 extract Hook 获取）
5. 更新 `handleReset` 以支持提取模块重置：`extract.reset()`
6. 删除 `ExtractPanel` 的导入

**验证**: 提取模块完整流程：上传 → 离开首页 → Loading → 全屏结果 → 返回主页(定位到"提取规则"Tab)。

---

### Phase 2 完成标准

- [ ] `useExtractFlow` Hook 创建，封装提取流程状态和回调
- [ ] IndexedDB `extract-history` store 创建（版本升至 3），CRUD 函数可用
- [ ] `ExtractUploadPanel` 组件创建，保留上传/AI 生成功能
- [ ] `ExtractHistoryList` 组件创建，展示提取历史
- [ ] `ExtractResult` 移除内部返回按钮
- [ ] App.tsx 集成：`EXTRACTING` / `EXTRACT_RESULT` 全屏渲染正常
- [ ] 提取模块首页：上传区 + RuleManager + 提取历史列表
- [ ] Tab 保活：切换 Tab 后已选文件不丢失
- [ ] 返回按钮自动定位到"提取规则"Tab

---

## Phase 3: 润色模块重构

> **目标**：将 PolishPanel 的自治状态机拆分为 `usePolishFlow` Hook + `PolishUploadPanel` 上传入口，全部润色视图由 App.tsx 全屏编排。

### Task 3.1: 创建 usePolishFlow Hook

**文件**: `frontend/src/hooks/usePolishFlow.ts` (新建)

**这是最复杂的 Hook，需要封装以下逻辑**:

```typescript
function usePolishFlow(setAppState: (s: AppState) => void) {
  // ---------- 内部状态 ----------
  const [suggestions, setSuggestions] = useState<PolishSuggestion[]>([]);
  const [summary, setSummary] = useState<PolishSummary | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [totalParagraphs, setTotalParagraphs] = useState(0);
  const [polishableParagraphs, setPolishableParagraphs] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [initialDecisions, setInitialDecisions] = useState<Record<number, boolean> | undefined>();
  const [sessionExpired, setSessionExpired] = useState(false);
  
  // 恢复标记
  const [hasRestored, setHasRestored] = useState(false);
  
  // SSE Hook
  const { startPolish: sseStart, abort: sseAbort } = usePolishSSE();
  
  // ---------- beforeunload（内部管理）----------
  // useEffect: 当 appState 处于 POLISHING 时注册 beforeunload
  // 注意：需要接收 appState 作为依赖，或使用 ref 追踪
  
  // ---------- IndexedDB 恢复（按需触发）----------
  const triggerRestore = useCallback(async () => {
    if (hasRestored) return;
    setHasRestored(true);
    const cached = await getLatestPolishResult();
    if (cached) {
      // 恢复 suggestions/summary/sessionId
      // 验证后端 session
      // setAppState("POLISH_PREVIEW")
    }
  }, [hasRestored]);
  
  // ---------- 对外接口 ----------
  return {
    // 事件处理
    handleStartPolish: async (file: File) => void,
    handleApplyAndDownload: async (acceptedIndices: number[]) => void,
    handleViewHistory: (record: PolishHistoryRecord) => void,
    
    // 数据（供全屏视图组件消费）
    suggestions,
    summary,
    sessionId,
    progress,
    totalParagraphs,
    polishableParagraphs,
    isReadOnly,
    sessionExpired,
    initialDecisions,
    historyRefreshKey,
    
    // 控制
    reset: () => void,
    abort: () => void,
    triggerRestore,
    isPolishing: boolean,    // 供 App.tsx 判断返回时是否需要弹确认框
  };
}
```

**从 PolishPanel 迁移的逻辑**:

| PolishPanel 中的逻辑 | 迁移到 usePolishFlow |
|---|---|
| `state` 状态机 (IDLE/UPLOADING/...) | 通过 `setAppState` 驱动 App 级状态 |
| `usePolishSSE()` 调用 + SSE 回调 | Hook 内部调用，回调更新内部状态 |
| `handleStartPolish` | 迁移，调用 `sseStart` + 设置 POLISHING |
| `handleApplyAndDownload` | 迁移，调用 `applyPolish` + `downloadPolishedFile` + 设置 POLISH_DONE |
| `handleViewHistoryResult` | 迁移，设置 POLISH_PREVIEW + isReadOnly=true |
| IndexedDB 恢复 useEffect | 迁移为 `triggerRestore()` |
| beforeunload useEffect | 迁移到 Hook 内部 |
| abort 清理 useEffect | 迁移到 Hook 内部 |
| `onComplete` 中的 IndexedDB 缓存 | 保留在 Hook 内部（或由 usePolishSSE 内部处理） |

**关键设计**：

1. **beforeunload 生命周期**：Hook 通过 useRef 追踪当前 appState 是否为 POLISHING/POLISH_APPLYING，仅在这些状态时注册 beforeunload
2. **isPolishing 派生状态**：不用额外 state，直接从 appState ref 派生
3. **abort()**: 调用 `sseAbort()` + 清空 suggestions/summary/progress 等
4. **reset()**: `abort()` + 所有状态恢复初始值 + `hasRestored` 保留不重置（避免切 Tab 回来重复恢复）

---

### Task 3.2: 重构 PolishUploadPanel

**文件**: `frontend/src/components/PolishUploadPanel.tsx` (新建，从 PolishPanel 瘦身)

**保留在组件内部的状态**:
- `selectedFile`（已选文件）

**通过 props 接收的回调/数据** (来自 usePolishFlow):
```typescript
interface PolishUploadPanelProps {
  onStartPolish: (file: File) => Promise<void>;
}
```

**组件职责**:
- 渲染文件上传区（Dropzone 或 TDesign Upload）
- 渲染"开始内容润色"按钮
- 点击按钮 → 调用 `onStartPolish(selectedFile)`
- **不渲染** PolishProgress / PolishPreview / PolishDone（由 App.tsx 全屏渲染）

---

### Task 3.3: 小改 PolishPreview 组件

**文件**: `frontend/src/components/PolishPreview.tsx`

**改动**:
- 移除顶部「← 返回」按钮（返回由 Header 统一处理）
- 保留底部功能按钮（应用下载、批量操作等），但移除底部的「返回列表」和「重新润色」按钮（这些操作由返回首页 + 重新上传来完成）
- 其他功能不变

**验证**: 全屏渲染时布局正确，Diff 对比 + 逐条操作 + 筛选等功能完整。

---

### Task 3.4: 小改 PolishProgress 组件

**文件**: `frontend/src/components/PolishProgress.tsx`

**改动**: 
- 当前已经是纯 props 驱动的展示组件，接口无需修改
- 仅需确保在全屏布局中居中显示（可能需要包裹一层 `max-w-lg mx-auto mt-8`，或在 App.tsx 渲染时添加）

---

### Task 3.5: 删除 PolishDone 组件

**文件**: `frontend/src/components/PolishDone.tsx` (删除)

**原因**: 功能由 `FullscreenDone` 共享组件替代。原 PolishDone 的 children（PolishHistoryList）通过 FullscreenDone 的 children 插槽传入。

---

### Task 3.6: App.tsx 集成润色模块

**文件**: `frontend/src/App.tsx`

**改动**:
1. 导入 `usePolishFlow`、`PolishUploadPanel`、`PolishProgress`、`PolishPreview`、`PolishHistoryList`
2. 调用 `const polish = usePolishFlow(setAppState);`
3. Tab 面板中替换 `<PolishPanel />` 为：
   ```tsx
   <div style={{ display: activeTab === "polish" ? "block" : "none" }}>
     <PolishUploadPanel onStartPolish={polish.handleStartPolish} />
     <div className="mt-8">
       <PolishHistoryList
         onViewResult={polish.handleViewHistory}
         refreshKey={polish.historyRefreshKey}
       />
     </div>
   </div>
   ```
4. 新增按需恢复逻辑：
   ```tsx
   useEffect(() => {
     if (activeTab === "polish" && appState === "IDLE") {
       polish.triggerRestore();
     }
   }, [activeTab, appState]);
   ```
5. 新增全屏渲染分支：
   - `POLISHING` → `<PolishProgress ... />` 全屏布局
   - `POLISH_PREVIEW` → `<PolishPreview ... />` 全屏布局
   - `POLISH_APPLYING` → `<FullscreenLoading color="violet" icon="sparkles" title="正在应用修改..." subtitle="即将完成" />`
   - `POLISH_DONE` → `<FullscreenDone title="润色完成！" subtitle="..." buttonText="润色新文档" onReset={handleReset}><PolishHistoryList ... /></FullscreenDone>`
6. 更新返回按钮逻辑：
   ```tsx
   const handleBackToHome = useCallback(() => {
     if (polish.isPolishing) {
       // 弹确认对话框
       Dialog.confirm({
         header: "确认离开",
         body: "润色正在进行中，离开后未完成的进度不会保存。确定离开？",
         onConfirm: () => {
           polish.abort();
           polish.reset();
           setActiveTab(stateToTab[appState]);
           setAppState("IDLE");
         },
       });
     } else {
       setActiveTab(stateToTab[appState]);
       setAppState("IDLE");
       check.reset();
       extract.reset();
       polish.reset();
     }
   }, [appState, polish, check, extract]);
   ```
7. 删除 `PolishPanel`、`PolishDone` 的导入

**验证**: 润色完整流程 + 中断确认 + 历史记录 + 缓存恢复 + beforeunload。

---

### Task 3.7: 初始化清理过期提取缓存

**文件**: `frontend/src/App.tsx`

**改动**: 在 `useEffect` 初始化中调用 `cleanExpiredExtract()`。

---

### Phase 3 完成标准

- [ ] `usePolishFlow` Hook 创建，封装 SSE + beforeunload + IndexedDB 恢复 + 所有润色状态
- [ ] `PolishUploadPanel` 组件创建，仅保留上传入口
- [ ] `PolishPreview` 移除内部返回按钮
- [ ] `PolishDone` 组件删除，功能由 FullscreenDone 替代
- [ ] App.tsx 集成：POLISHING / POLISH_PREVIEW / POLISH_APPLYING / POLISH_DONE 全屏渲染
- [ ] 润色进行中返回 → 弹确认对话框 → 确认后清空、取消不动
- [ ] beforeunload 在 POLISHING 状态下生效
- [ ] IndexedDB 缓存恢复：仅润色 Tab 可见时触发
- [ ] Tab 保活：切换 Tab 后已选文件不丢失
- [ ] 返回按钮自动定位到"内容润色"Tab
- [ ] 清理过期提取缓存

---

## 全局完成标准

| 编号 | 验证项 | Phase |
|------|--------|-------|
| ✅ 1 | AppState 扩展为 14 个状态 | P1 |
| ✅ 2 | FullscreenLoading / FullscreenDone 共享组件 | P1 |
| ✅ 3 | 检查模块回归 0 差异（视觉 + 功能） | P1 |
| ✅ 4 | 提取模块：上传 → 全屏结果 → 返回 | P2 |
| ✅ 5 | 提取历史列表可用（IndexedDB 存储） | P2 |
| ✅ 6 | 提取首页保留 RuleManager | P2 |
| ✅ 7 | 润色模块：上传 → 全屏进度 → 预览 → 完成 | P3 |
| ✅ 8 | 润色中断确认对话框 | P3 |
| ✅ 9 | beforeunload 保护 | P3 |
| ✅ 10 | IndexedDB 按需恢复 | P3 |
| ✅ 11 | App.tsx 0 业务 useState | P3 |
| ✅ 12 | 三模块 Tab 保活不丢失 | P1-3 |
| ✅ 13 | 返回按钮自动定位正确 Tab | P1-3 |
| ✅ 14 | 后端 0 变更 | 全局 |

---

## 文件变更清单

| 文件 | 操作 | Phase | 复杂度 |
|------|------|-------|--------|
| `types/index.ts` | 修改 | P1 | 低 |
| `components/FullscreenLoading.tsx` | **新建** | P1 | 低 |
| `components/FullscreenDone.tsx` | **新建** | P1 | 低 |
| `App.tsx` | 修改 | P1→P2→P3 | 高(累积) |
| `services/cache.ts` | 修改 | P2 | 中 |
| `hooks/useExtractFlow.ts` | **新建** | P2 | 中 |
| `components/ExtractUploadPanel.tsx` | **新建** | P2 | 中 |
| `components/ExtractHistoryList.tsx` | **新建** | P2 | 中 |
| `components/ExtractResult.tsx` | 小改 | P2 | 低 |
| `components/ExtractPanel.tsx` | **删除** | P2 | - |
| `hooks/usePolishFlow.ts` | **新建** | P3 | **高** |
| `components/PolishUploadPanel.tsx` | **新建** | P3 | 中 |
| `components/PolishPreview.tsx` | 小改 | P3 | 低 |
| `components/PolishProgress.tsx` | 不变/微调 | P3 | 低 |
| `components/PolishDone.tsx` | **删除** | P3 | - |
| `components/PolishPanel.tsx` | **删除** | P3 | - |
| `hooks/usePolishSSE.ts` | 不变 | - | - |

**新建 7 个文件 · 修改 4 个文件 · 删除 3 个文件 · 不变 ~15 个文件**

---

## 风险关注点

1. **usePolishFlow 的 appState 追踪**：Hook 内部需要知道当前 appState 来管理 beforeunload，但 appState 由 App.tsx 拥有。解决方案：通过 useRef 或将 appState 作为参数传入 Hook。
2. **IndexedDB 版本升级**：从 v2 升至 v3 时，确保 `onupgradeneeded` 的 `oldVersion` 判断逻辑正确，不破坏已有 store。
3. **PolishPreview 的心跳续命**：当前在组件内部实现，需要确保全屏模式下仍正常工作（应该没问题，只是确认）。
4. **ExtractResult 的 RuleManager children 插槽**：全屏渲染时，App.tsx 需要传入 `<RuleManager />` 作为 children。
