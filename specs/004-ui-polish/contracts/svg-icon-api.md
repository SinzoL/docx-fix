# Component Contracts: UI 样式美化与体验优化

**Feature**: 004-ui-polish
**Date**: 2026-03-10

> 本 spec 为纯前端特性，不涉及后端 API 变更。以下定义前端内部组件和服务的接口契约。

---

## 1. SvgIcon 组件契约

**文件**: `frontend/src/components/icons/SvgIcon.tsx`

### Props 接口

```typescript
interface SvgIconProps {
  /** 图标名称，对应 iconPaths 的 key，kebab-case */
  name: string;
  /** 图标尺寸（宽高相同），单位 px，默认 20 */
  size?: number;
  /** 额外的 CSS 类名，用于自定义颜色等 */
  className?: string;
}
```

### 渲染契约

| 条件 | 行为 |
|------|------|
| `name` 存在于 iconPaths | 渲染 `<svg>` 元素，使用对应的 path data |
| `name` 不存在于 iconPaths | 返回 `null`，不渲染任何内容，不报错 |
| `size` 未指定 | 默认使用 20px |
| `className` 已指定 | 附加到 `<svg>` 元素的 `className` 属性 |

### SVG 输出规范

```html
<svg
  width="{size}"
  height="{size}"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="{className}"
>
  <path d="{path_data}" />
  <!-- 多 path 图标会有多个 <path> 元素 -->
</svg>
```

### 使用示例

```tsx
import { SvgIcon } from './components/icons/SvgIcon';

// 基本使用
<SvgIcon name="document" />

// 自定义尺寸和颜色
<SvgIcon name="chart-bar" size={16} className="text-blue-500" />

// 内联使用（继承父元素颜色）
<span className="text-green-600">
  <SvgIcon name="check" size={14} /> 通过
</span>

// TDesign OptionGroup label（TNode 形式）
<Select.OptionGroup
  label={<><SvgIcon name="clipboard-list" size={14} /> 预置规则</>}
>
```

---

## 2. AI 总结缓存服务契约

**文件**: `frontend/src/services/aiCache.ts`

### API 接口

```typescript
/** 获取缓存的 AI 总结文本 */
function getCachedSummary(sessionId: string): string | undefined;

/** 缓存 AI 总结文本（仅在 SSE state=done 时调用） */
function setCachedSummary(sessionId: string, content: string): void;

/** 清除指定 session 的缓存（用户点击"重新分析"时调用） */
function clearCachedSummary(sessionId: string): void;

/** 获取当前缓存条目数量（用于测试/调试） */
function getCacheSize(): number;
```

### 行为契约

| 操作 | 前置条件 | 后置条件 |
|------|----------|----------|
| `getCachedSummary(id)` | 缓存中存在该 id | 返回缓存的完整文本 |
| `getCachedSummary(id)` | 缓存中不存在该 id | 返回 `undefined` |
| `setCachedSummary(id, content)` | 缓存未满（< 50 条） | 新增缓存条目 |
| `setCachedSummary(id, content)` | 缓存已满（= 50 条） | 淘汰最早条目后新增 |
| `setCachedSummary(id, content)` | 该 id 已存在 | 覆盖更新 |
| `clearCachedSummary(id)` | 缓存中存在该 id | 删除该条目 |
| `clearCachedSummary(id)` | 缓存中不存在该 id | 无操作（不报错） |

### 缓存策略

- **缓存键**: `session_id`（字符串）
- **缓存值**: AI 总结完整 Markdown 文本
- **上限**: 50 条
- **淘汰策略**: FIFO（先进先出），通过 `Map.keys().next().value` 获取最早 key
- **持久化**: 无（页面刷新后清空）
- **线程安全**: N/A（单线程 JS 环境）

---

## 3. CheckReport 折叠交互契约

**文件**: `frontend/src/components/CheckReport.tsx`

### 折叠状态接口

```typescript
// 组件内部 state
type CollapsedMap = Record<string, boolean>;

// 初始化逻辑
const [collapsed, setCollapsed] = useState<CollapsedMap>(() => {
  const init: CollapsedMap = {};
  for (const cat of categories) {
    const hasIssues = groupedItems[cat].some(i => i.status !== 'PASS');
    init[cat] = !hasIssues; // 全 PASS → 折叠
  }
  return init;
});
```

### 交互契约

| 用户操作 | 触发事件 | 状态变更 |
|----------|---------|----------|
| 点击类别头部 | `onClick` | `collapsed[cat] = !collapsed[cat]` |
| 点击"展开全部" | `onClick` | 所有 key → `false` |
| 点击"收起全部" | `onClick` | 所有 key → `true` |

### 折叠状态下的渲染

折叠时，类别头部显示：
```
[chevron-right] {类别名}  {PASS数}项通过  {WARN数}项警告  {FAIL数}项失败
```

展开时，类别头部显示：
```
[chevron-down] {类别名}  {PASS数}项通过  {WARN数}项警告  {FAIL数}项失败
├── 检查项 1: {状态图标} {消息}
├── 检查项 2: {状态图标} {消息}
└── 检查项 N: {状态图标} {消息}
```

### "展开全部/收起全部"按钮

**位置**: "具体检查项详情"标题行右侧
**可见性**: 始终可见
**文案**: 根据当前整体状态动态切换
- 存在至少一个折叠的类别 → 显示"展开全部"
- 所有类别均展开 → 显示"收起全部"

---

## 4. Emoji → SvgIcon 替换契约

### 全量替换清单

以下列出需要修改的所有文件及其中每个 emoji 的精确位置和目标 SvgIcon：

| 文件 | 原始 Emoji | 替换为 | 上下文 |
|------|-----------|--------|--------|
| `App.tsx` | 📝 | `<SvgIcon name="document" />` | Logo |
| `App.tsx` | 🔍 | `<SvgIcon name="search" />` | Tab 图标、加载状态 |
| `App.tsx` | 🧬 | `<SvgIcon name="dna" />` | Tab 图标、加载状态 |
| `App.tsx` | ✨ | `<SvgIcon name="sparkles" />` | 加载状态 |
| `App.tsx` | ✓ | `<SvgIcon name="check" />` | 完成状态 |
| `CheckReport.tsx` | 📊 | `<SvgIcon name="chart-bar" />` | 报告标题 |
| `CheckReport.tsx` | 💬 | `<SvgIcon name="message-circle" />` | AI 问答按钮 |
| `CheckReport.tsx` | 📋 | `<SvgIcon name="clipboard-list" />` | 规则详情按钮 |
| `CheckReport.tsx` | 📍 | `<SvgIcon name="map-pin" />` | 位置标记 |
| `CheckReport.tsx` | ✓ (STATUS_MAP) | `<SvgIcon name="check" />` | PASS 状态 |
| `CheckReport.tsx` | ⚠ (STATUS_MAP) | `<SvgIcon name="alert-triangle" />` | WARN 状态 |
| `CheckReport.tsx` | ✗ (STATUS_MAP) | `<SvgIcon name="x-circle" />` | FAIL 状态 |
| `AiSummary.tsx` | ✨ | `<SvgIcon name="sparkles" />` | AI 图标 |
| `AiSummary.tsx` | ⚠️ | `<SvgIcon name="alert-triangle" />` | 错误图标 |
| `AiChatPanel.tsx` | 🤖 | `<SvgIcon name="bot" />` | 机器人头像 |
| `FixPreview.tsx` | ✨ | `<SvgIcon name="sparkles" />` | 修复标题 |
| `FixPreview.tsx` | ⚠️ | `<SvgIcon name="alert-triangle" />` | 修复前 |
| `FixPreview.tsx` | ✅ | `<SvgIcon name="check" />` | 修复后 |
| `HistoryList.tsx` | 📂 | `<SvgIcon name="folder" />` | 历史图标 |
| `ExtractPanel.tsx` | 📐 | `<SvgIcon name="ruler" />` | 页面设置模块 |
| `ExtractPanel.tsx` | 📑 | `<SvgIcon name="bookmark" />` | 页眉页脚模块 |
| `ExtractPanel.tsx` | 🔢 | `<SvgIcon name="hash" />` | 编号模块 |
| `ExtractPanel.tsx` | 🏗️ | `<SvgIcon name="building" />` | 结构模块 |
| `ExtractPanel.tsx` | 🔍 | `<SvgIcon name="search" />` | 特殊检查模块 |
| `ExtractPanel.tsx` | 🔧 | `<SvgIcon name="wrench" />` | 标题修复模块 |
| `ExtractPanel.tsx` | 📄 | `<SvgIcon name="file-text" />` | 纸张信息 |
| `ExtractPanel.tsx` | 💡 | `<SvgIcon name="lightbulb" />` | 提示 |
| `ExtractPanel.tsx` | ❌ | `<SvgIcon name="x-circle" />` | 错误 |
| `ExtractPanel.tsx` | ⚠️ | `<SvgIcon name="alert-triangle" />` | 警告 |
| `ExtractPanel.tsx` | 🧬 | `<SvgIcon name="dna" />` | 加载 |
| `UploadPanel.tsx` | 💡 | `<SvgIcon name="lightbulb" />` | 提示 |
| `UploadPanel.tsx` | 📋 | TNode `<SvgIcon name="clipboard-list" />` | OptionGroup label |
| `UploadPanel.tsx` | 📂 | TNode `<SvgIcon name="folder" />` | OptionGroup label |
| `RuleManager.tsx` | 📂 (x2) | `<SvgIcon name="folder" />` | 文件夹图标 |
| `RuleManager.tsx` | 📄 (x1) | `<SvgIcon name="file-text" />` | 文件图标 |

### 完成标准

替换完成后，`grep -rn` 扫描前端 `src/` 目录不应找到任何 Unicode emoji 字符。
