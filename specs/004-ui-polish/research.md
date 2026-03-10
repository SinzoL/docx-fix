# Research: UI 样式美化与体验优化

**Feature**: 004-ui-polish
**Date**: 2026-03-10
**Status**: Complete — 所有技术问题已在 Spec Clarifications (CL-1 ~ CL-7) 中解决

## 概述

本次 research 围绕三个方面展开：
1. SVG Icon 系统设计方案（内联 SVG vs SVG sprite vs 图标库）
2. 折叠交互状态管理策略
3. AI 总结缓存机制设计

Technical Context 中无 NEEDS CLARIFICATION 项，以下为对已确定技术决策的论证和备选方案评估。

---

## Research 1: SVG Icon 系统设计方案

### Decision

采用**内联 SVG + iconMap 字典**方案。创建单一 `SvgIcon.tsx` 组件，内部维护 `iconPaths: Record<string, string | string[]>` 映射表，通过 `name` 属性索引图标。所有 SVG 使用 24x24 viewBox、stroke-based 线条风格、`currentColor` 配色。

图标 path data 手动从开源图标集（Lucide / Feather / Heroicons）复制，不引入任何 npm 依赖。

### Rationale

- **Constitution VI 合规**：不引入额外组件库，零新增 npm 依赖
- **图标数量有限**（约 20-30 个），内联方案的 JS 包体积增量可忽略不计（每个 path ≈ 100-300 bytes）
- **支持 `currentColor`**：内联 SVG 可直接继承父元素 `color` 属性，适配深色/浅色背景
- **Tree-shaking 友好**：虽然 iconMap 是全量加载，但总量 < 10KB，无需 tree-shaking

### Alternatives Considered

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **lucide-react** | 3000+ 图标、TypeScript 类型完善、tree-shakable | 新增 npm 依赖，违反 Constitution VI | ❌ 违反原则 |
| **SVG sprite + `<use>`** | 浏览器缓存友好、DOM 更轻量 | 需要额外构建步骤（svgo + sprite 生成）、`currentColor` 支持受限 | ❌ 过度复杂 |
| **独立 SVG 文件 + React 组件** | 每个图标独立文件，按需引入 | 文件数量多、需要 barrel export、管理成本高 | ❌ 20-30 个图标不值得 |
| **TDesign 内置图标** | TDesign 有 `tdesign-icons-react` 包 | 需要额外安装 `tdesign-icons-react`，属于新增组件库 | ❌ 违反原则 |
| **内联 SVG + iconMap** | 零依赖、单文件管理、支持 currentColor | 图标多了后文件会变大 | ✅ 最符合项目约束 |

### 实现要点

1. **组件接口**：`<SvgIcon name="document" size={20} className="text-blue-500" />`
2. **降级策略**：`name` 不存在时返回 `null`（不报错，不渲染占位）
3. **多 path 支持**：部分图标需要多个 `<path>` 元素，iconMap 的 value 支持 `string | string[]`
4. **统一风格**：所有图标 `strokeWidth="1.5"`、`strokeLinecap="round"`、`strokeLinejoin="round"`
5. **命名规范**：kebab-case（如 `chart-bar`、`alert-triangle`、`chevron-down`）

### 需要的图标清单（约 25 个）

| 图标名 | 用途 | 替换的 emoji |
|--------|------|-------------|
| `document` | Logo、文件 | 📝、📄 |
| `search` | 搜索 Tab | 🔍 |
| `dna` | 提取 Tab | 🧬 |
| `sparkles` | AI 相关 | ✨ |
| `chart-bar` | 报告标题 | 📊 |
| `message-circle` | AI 问答 | 💬 |
| `clipboard-list` | 规则详情 | 📋 |
| `map-pin` | 位置标记 | 📍 |
| `check` | 通过状态 | ✓、✅ |
| `alert-triangle` | 警告状态 | ⚠、⚠️ |
| `x-circle` | 失败状态 | ✗、❌ |
| `bot` | 机器人 | 🤖 |
| `folder` | 文件夹 | 📂 |
| `lightbulb` | 提示信息 | 💡 |
| `ruler` | 页面设置 | 📐 |
| `bookmark` | 书签/标记 | 📑 |
| `hash` | 编号 | 🔢 |
| `building` | 结构 | 🏗️ |
| `wrench` | 工具/修复 | 🔧 |
| `chevron-down` | 折叠箭头（展开） | 新增 |
| `chevron-right` | 折叠箭头（折叠） | 新增 |
| `expand` | 展开全部 | 新增 |
| `collapse` | 收起全部 | 新增 |
| `file-text` | 文件文本 | 📄 |
| `loader` | 加载中 | 动画相关 |

---

## Research 2: 折叠交互状态管理

### Decision

使用 React `useState` + `Record<string, boolean>` 管理折叠状态。初始值在组件首次渲染时根据类别数据计算：全部 PASS 的类别初始值为 `true`（折叠），含 FAIL/WARN 的类别初始值为 `false`（展开）。

### Rationale

- 折叠状态是**局部 UI 状态**，不需要跨组件共享，无需 Context 或状态管理库
- `Record<string, boolean>` 结构简单，按类别名索引，O(1) 查找
- "展开全部 / 收起全部" 按钮只需一次性更新整个 Map

### Alternatives Considered

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **useState + Record** | 简单直接、无依赖 | N/A | ✅ |
| **useReducer** | 适合复杂状态逻辑 | 折叠/展开逻辑过于简单，reducer 反而啰嗦 | ❌ 过度设计 |
| **Zustand/Jotai** | 跨组件状态共享 | 新增依赖，折叠状态无需跨组件 | ❌ 违反原则 |
| **URL params** | 可分享折叠状态 | 无实际需求，增加复杂度 | ❌ YAGNI |

### 实现要点

1. 初始折叠状态延迟计算（`useState(() => { ... })`），仅在首次渲染时遍历数据
2. "展开全部" → 所有 key 设为 `false`；"收起全部" → 所有 key 设为 `true`
3. 折叠动画：使用 CSS `max-height` + `overflow: hidden` + `transition`，或直接条件渲染（`{!collapsed && <List />}`）
4. 折叠头部显示：类别名 + 通过/警告/失败计数 badge + chevron 箭头图标

---

## Research 3: AI 总结缓存机制

### Decision

使用**模块级 Map 对象**作为缓存。在 `services/aiCache.ts` 中导出 `getCachedSummary(sessionId)` 和 `setCachedSummary(sessionId, content)` 函数。设置 50 条上限，FIFO 淘汰。

只缓存 SSE 请求状态为 `done` 的完整文本。流式传输中途中断的不缓存。

### Rationale

- **模块级 Map**：JS 模块是单例，天然保持整个 SPA 生命周期内的缓存一致性
- **不使用 React Context**：缓存不是 UI 状态，不需要触发重渲染。直接在 `useEffect` 中读写即可
- **不持久化**：spec 明确要求"页面刷新后失效"，模块级 Map 恰好满足
- **50 条上限**：单条 AI 总结 ≈ 1-5KB，50 条 ≈ 250KB，内存占用可忽略。FIFO 淘汰比 LRU 实现更简单，且在本场景下差异不大

### Alternatives Considered

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **模块级 Map** | 零依赖、单例、生命周期匹配 | 无多 Tab 同步（不需要） | ✅ |
| **React Context** | 与 React 生态集成 | 缓存变更会触发重渲染、上下文传递复杂 | ❌ 不适合 |
| **sessionStorage** | 浏览器级存储 | 跨 Tab 隔离（我们不需要跨 Tab）、序列化开销 | ❌ 无必要 |
| **localStorage** | 持久化 | spec 明确要求不持久化 | ❌ 违反要求 |
| **useRef** | React 友好 | 每个 AiSummary 实例独立 ref，无法跨实例共享 | ❌ 不满足 |

### 实现要点

1. `AiSummary.tsx` 的 `useEffect` 中：先调用 `getCachedSummary(sessionId)`，命中则直接 `setState({ content, state: 'done' })`，跳过 SSE
2. SSE `onComplete` 回调中：调用 `setCachedSummary(sessionId, content)` 写入缓存
3. "重新分析" 按钮：先从缓存中删除该 sessionId，再重新发起 SSE
4. FIFO 淘汰：`Map.keys().next().value` 获取最早的 key 并删除

---

## Research 4: Emoji 全量替换策略

### Decision

采用**逐文件手动替换**策略。先用 grep 扫描所有 emoji 出现位置，然后按文件逐一替换为对应的 `<SvgIcon name="..." />` 调用。

### Rationale

- emoji 出现的场景多样（JSX 文本、字符串模板、对象字面量），无法用简单的正则批量替换
- 每个 emoji 需要映射到语义正确的图标名（如 📊 → `chart-bar` 而非 `bar-chart`）
- 部分 emoji 出现在 TDesign 组件的 `label` 属性中（CL-6），需要特殊处理（字符串 → TNode）
- 替换后需要确保 `import { SvgIcon }` 被正确引入

### Emoji → SvgIcon 映射表

| Emoji | SvgIcon name | 使用场景 |
|-------|-------------|---------|
| 📝 | `document` | App.tsx Logo |
| 🔍 | `search` | App.tsx Tab/加载 |
| 🧬 | `dna` | App.tsx Tab/加载 |
| ✨ | `sparkles` | App.tsx/AiSummary/FixPreview |
| ✓ (ASCII) | `check` | App.tsx/CheckReport |
| 📊 | `chart-bar` | CheckReport 标题 |
| 💬 | `message-circle` | CheckReport AI 问答 |
| 📋 | `clipboard-list` | CheckReport/UploadPanel 规则详情 |
| 📍 | `map-pin` | CheckReport 位置标记 |
| ⚠ / ⚠️ | `alert-triangle` | CheckReport/AiSummary/FixPreview/ExtractPanel |
| ✗ (ASCII) | `x-circle` | CheckReport |
| 🤖 | `bot` | AiChatPanel |
| ✅ | `check` | FixPreview |
| 📂 | `folder` | HistoryList/RuleManager/UploadPanel |
| 💡 | `lightbulb` | ExtractPanel/UploadPanel |
| 📐 | `ruler` | ExtractPanel |
| 📑 | `bookmark` | ExtractPanel |
| 🔢 | `hash` | ExtractPanel |
| 🏗️ | `building` | ExtractPanel |
| 🔧 | `wrench` | ExtractPanel |
| 📄 | `file-text` | ExtractPanel/RuleManager |
| ❌ | `x-circle` | ExtractPanel |
| 📂 | `folder` | RuleManager |

### 验证方法

替换完成后使用以下正则扫描残留 emoji：

```bash
grep -rn '[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]' frontend/src/
```

---

## 总结

所有技术问题已解决，无残留的 NEEDS CLARIFICATION 项。主要技术决策：

1. ✅ **内联 SVG + iconMap** — 零依赖，单文件管理约 25 个图标
2. ✅ **useState + Record** — 简单的折叠状态管理
3. ✅ **模块级 Map 缓存** — AI 总结内存缓存，50 条上限 FIFO 淘汰
4. ✅ **逐文件手动替换** — 保证每个 emoji 映射到语义正确的 SvgIcon
