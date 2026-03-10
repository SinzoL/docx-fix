# Feature Specification: UI 样式美化与体验优化

**Feature Branch**: `004-ui-polish`  
**Created**: 2026-03-10  
**Status**: Draft  
**Input**: 用户描述："检测通过项折叠、替换 emoji 为 SVG Icon 系统、缓存 AI 总结避免重复请求"

## 背景与动机

当前 docx-fix 前端已具备完整的检查报告、修复预览、模板提取等功能，但在视觉风格和交互体验上存在以下问题：

1. **检查报告信息密度过高**：检测项目较多时，全部通过的类别与失败/警告类别占据相同的视觉权重，用户需要大量滚动才能定位到真正需要关注的问题。应将通过项折叠，突出展示未通过项及具体修复建议。

2. **Emoji 风格过于"AI 感"**：当前全站大量使用 emoji（如 📊、📝、🔍、🧬、✨、📍、💡、⚠️、✅、📂、💬、📋、📄、🤖、❌ 等），这种风格给人强烈的 AI 生成感，不够专业和有设计感。需要建立统一的 SVG Icon 系统，使用精心设计的矢量图标替代所有 emoji。

3. **AI 总结重复请求**：从历史检查记录回到报告页面时，`AiSummary` 组件会重新触发 LLM 总结请求（因为组件重新挂载导致 `useEffect` 重新执行），浪费 API 调用且用户需要重新等待。应将 AI 总结结果缓存，相同 session_id 的报告不重复请求。

## Clarifications

### CL-1: RuleManager.tsx 遗漏 [已确认]

**问题**：Spec 的 User Story 2 中列出了需要替换 emoji 的组件文件，但 **遗漏了 `RuleManager.tsx`**。实际代码中该文件包含 3 处 emoji（📂 x2、📄 x1）。

**决议**：✅ 已确认需要补充。`RuleManager.tsx` 加入替换列表，文件结构章节同步更新。

---

### CL-2: AiSummary 缓存 — 流式中断场景如何处理？

**问题**：User Story 3 描述了 SSE 请求 **完成后** 写入缓存。但如果用户在 AI 总结 **流式传输中途** 就离开了报告页面（如切换到历史列表），此时 `content` 不完整。当用户再次回来时：
- 应该缓存这份不完整的内容吗？
- 还是只缓存 `state === "done"` 时的完整内容？
- 中途离开后回来，是否应当重新请求？

**决议**：✅ 已确认。**只缓存 `state === "done"` 时的完整文本**。中途中断的不缓存，回来后重新请求。

---

### CL-3: AiChatPanel 的聊天记录是否也需要缓存？

**问题**：User Story 3 只提到了 **AiSummary**（AI 深度总结）的缓存。但 `AiChatPanel`（AI 问答对话）同样存在重新挂载丢失聊天记录的问题——用户从历史报告回到对话面板时，之前的多轮问答消息会丢失。

是否需要同时缓存 AiChatPanel 的聊天记录？如果是，缓存 key 和策略是否一致（session_id + 内存 Map）？

**决议**：✅ 已确认。本次 scope 仅处理 AiSummary 缓存，AiChatPanel 的聊天缓存后续 spec 处理。

---

### CL-4: 折叠交互 — 检查状态图标（✓ ⚠ ✗）是否也算"emoji"需要替换？

**问题**：`CheckReport.tsx` 的 `STATUS_MAP` 中使用了三个 ASCII 级别的符号作为状态图标：

```tsx
PASS: { icon: "✓", ... },
WARN: { icon: "⚠", ... },
FAIL: { icon: "✗", ... },
```

这些字符（✓ / ⚠ / ✗）技术上不是 emoji（它们是 Unicode 通用符号），但视觉风格上与 SVG Icon 不一致。是否也需要替换为 SvgIcon（如 `check`、`alert-triangle`、`x-circle`）？

**决议**：✅ 已确认。将 ✓ / ⚠ / ✗ 状态符号也替换为 SvgIcon（`check`、`alert-triangle`、`x-circle`），保持全站图标风格完全一致。

---

### CL-5: Constitution 约束 — "无额外组件库" vs SVG path 来源

**问题**：Constitution 第 VI 条明确要求"前端技术栈：React + TDesign + TailwindCSS，无额外组件库"。Spec 中设计 SvgIcon 组件自行定义 SVG path data，**不引入 lucide-react 等图标库**，仅参考开源图标集（如 Lucide、Feather、Heroicons）的 path 数据手动内嵌。

这个做法是否合规？（参考 path 数据 ≠ 引入库依赖，应当合规，但需明确。）

**决议**：✅ 已确认合规。手动复制 SVG path data 不构成"引入额外组件库"，不违反 Constitution。

---

### CL-6: 部分 emoji 用于 TDesign 组件的 `label` 属性中

**问题**：`UploadPanel.tsx` 中有 emoji 出现在 TDesign `<Select.OptionGroup>` 组件的 `label` 属性中：

```tsx
<Select.OptionGroup label="📋 预置规则" ...>
<Select.OptionGroup label="📂 我的规则">
```

TDesign 的 `label` 属性类型是 `string | TNode`。如果是 `string` 类型，无法直接插入 JSX（SvgIcon 组件）。需要确认：
- 是否改为使用 TNode（ReactNode）形式传入 `label`？
- 还是这两处直接去掉图标（因为是下拉选项分组标题，图标可有可无）？

**决议**：✅ 已确认。使用 TNode 形式传入 `label`，如 `label={<><SvgIcon name="clipboard-list" size={14} /> 预置规则</>}`。

---

### CL-7: "展开全部 / 收起全部" 按钮的触发位置

**问题**：FR-005 要求 SHOULD 提供"展开全部"/"收起全部"快捷按钮，但未指定放置位置。当前 CheckReport 的布局为：
- 顶部：标题栏 + AI 问答/规则详情按钮
- 中间：汇总卡片
- 下方：类别列表

快捷按钮应放在哪里？
- A. 类别列表区域的标题行右侧（"具体检查项详情" 旁边）
- B. 汇总卡片和类别列表之间的独立行

**决议**：✅ 已确认。采用方案 A：放在"具体检查项详情"标题行右侧，与标题行对齐，不占额外空间。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 检测通过项折叠，突出未通过项 (Priority: P1)

用户上传文档完成检查后，查看检查报告。报告中的"具体检查项详情"区域按类别分组展示。如果某个类别下所有检查项均为 PASS 状态，该类别默认折叠显示，仅展示一行摘要（类别名 + "全部通过"标签）。如果类别中存在 FAIL 或 WARN 项，则默认展开，未通过的项会高亮显示并附带具体的修复建议。

用户可以手动点击折叠/展开任何类别。

**Why this priority**: 检测项目通常较多（10-20+个类别），全部通过的项占大量空间，折叠后可大幅缩减信息噪音，让用户快速定位问题所在。

**Independent Test**: 上传一个存在部分格式问题的文档，确认通过类别默认折叠、失败类别默认展开，点击可切换折叠状态。

**Acceptance Scenarios**:

1. **Given** 检查报告中某类别所有项均为 PASS, **When** 报告渲染完成, **Then** 该类别默认折叠，显示类别名 + 项数 + "全部通过"标签，不展示子项列表
2. **Given** 检查报告中某类别包含 FAIL 或 WARN 项, **When** 报告渲染完成, **Then** 该类别默认展开，未通过项带有具体的修复建议文字
3. **Given** 一个已折叠的全部通过类别, **When** 用户点击该类别头部, **Then** 展开显示所有 PASS 项的详细信息
4. **Given** 一个已展开的类别, **When** 用户点击该类别头部, **Then** 该类别折叠为一行摘要
5. **Given** 所有类别均全部通过, **When** 报告渲染完成, **Then** 所有类别默认折叠，并在顶部显示醒目的"全部通过"整体提示

---

### User Story 2 - SVG Icon 系统替代 Emoji (Priority: P1)

当前全站使用 emoji 字符作为图标（📊、📝、🔍 等），需要建立一套统一的 SVG Icon 组件系统，使用有设计感的线条图标替代所有 emoji。SVG Icon 组件支持自定义尺寸和颜色，保持视觉一致性。

需要替换的 emoji 使用场景包括：
- **App.tsx**：Logo 📝、Tab 图标 🔍/🧬、加载状态 🔍/✨、完成状态 ✓
- **CheckReport.tsx**：报告标题 📊、AI 问答 💬、规则详情 📋、位置标记 📍、状态符号 ✓/⚠/✗
- **AiSummary.tsx**：AI 图标 ✨、错误图标 ⚠️
- **AiChatPanel.tsx**：机器人 🤖
- **FixPreview.tsx**：修复标题 ✨、修复前 ⚠️、修复后 ✅
- **HistoryList.tsx**：历史图标 📂
- **ExtractPanel.tsx**：模块图标（📐/📑/🔢/🏗️/🔍/🔧）、纸张 📄、提示 💡、错误 ❌/⚠️、加载 🧬
- **UploadPanel.tsx**：提示 💡
- **RuleManager.tsx**：文件夹 📂 x2、文件 📄 x1

**Why this priority**: emoji 渲染依赖系统字体，跨平台/跨浏览器表现不一致，且风格过于随意。统一的 SVG Icon 系统是提升整体设计品质的基础性工作。

**Independent Test**: 在不同浏览器（Chrome/Firefox/Safari）中对比替换前后的视觉效果，确认所有 emoji 已被 SVG 替换，图标风格统一。

**Acceptance Scenarios**:

1. **Given** 任何页面, **When** 用户浏览应用, **Then** 页面中不再出现任何 emoji 字符，所有图标位置均使用 SVG Icon 组件渲染
2. **Given** SVG Icon 组件, **When** 使用不同的 size 和 className 属性, **Then** 图标正确缩放和变色
3. **Given** 前端项目, **When** 开发者需要使用图标, **Then** 可以通过 `<SvgIcon name="xxx" />` 的统一方式引用，无需手动编写 SVG 代码
4. **Given** 深色/浅色背景, **When** 图标渲染, **Then** SVG 使用 `currentColor` 继承父元素颜色，自动适配

---

### User Story 3 - AI 深度总结缓存，避免重复请求 (Priority: P2)

用户从"历史检查"列表点击某条记录查看报告时，如果该 session_id 对应的 AI 总结已经生成过，应直接展示缓存的总结内容，不再重新调用 LLM 接口。

缓存策略：
- 以 `session_id` 为 key，将 AI 总结文本缓存在内存中（React state 或 Context）
- 当 `AiSummary` 组件挂载时，先检查缓存是否存在该 session_id 的总结
- 如果缓存命中，直接渲染缓存内容（状态直接跳到 "done"），不发起 SSE 请求
- 如果缓存未命中，正常发起 SSE 请求，请求完成后将结果写入缓存
- 缓存仅保留在内存中（页面刷新后失效），无需持久化

**Why this priority**: 每次查看历史报告都重新调用 LLM 接口既浪费资源又让用户等待，但不影响核心功能可用性。

**Independent Test**: 首次查看报告等待 AI 总结完成，返回历史列表后再次点击同一报告，确认 AI 总结立即展示无加载过程。

**Acceptance Scenarios**:

1. **Given** 用户首次查看某份检查报告, **When** AI 总结流式完成, **Then** 总结文本被缓存到内存中，以 session_id 为 key
2. **Given** 用户从历史列表再次查看同一份报告, **When** AiSummary 组件挂载, **Then** 直接展示缓存的总结内容，无加载骨架屏、无 SSE 请求
3. **Given** 用户查看不同 session_id 的报告, **When** AiSummary 组件挂载, **Then** 正常发起 LLM 请求（缓存 key 不同）
4. **Given** 用户刷新页面后, **When** 重新查看历史报告, **Then** 缓存已清空，正常发起 LLM 请求（内存缓存不持久化）
5. **Given** AI 总结请求失败, **When** 用户点击"重新分析", **Then** 重新发起请求，成功后更新缓存

---

### Edge Cases

- 检查报告为空（零项）时，应显示"无检查项"提示而非空白页
- 所有类别均含 FAIL 项时，全部展开但页面应提供"收起全部"快捷操作
- SVG Icon name 传入不存在的图标名时，应降级渲染为空/不可见而非报错
- AI 总结缓存达到大量条目（如 100+ session）时不会导致内存问题（可设置缓存上限，LRU 淘汰）
- 浏览器后退/前进按钮导航时，缓存行为保持一致

## Requirements *(mandatory)*

### Functional Requirements

#### 检测通过项折叠

- **FR-001**: CheckReport 组件 MUST 根据类别内检查项状态决定默认折叠/展开：所有项为 PASS 则默认折叠，否则默认展开
- **FR-002**: 每个类别头部 MUST 可点击切换折叠/展开状态
- **FR-003**: 折叠状态下 MUST 显示类别名、检查项总数、通过/警告/失败数量的摘要标签
- **FR-004**: 展开的未通过类别中，FAIL 和 WARN 项 MUST 高亮显示检查结果消息（message 字段即修复建议）
- **FR-005**: SHOULD 在"具体检查项详情"标题行右侧提供"展开全部"/"收起全部"快捷按钮

#### SVG Icon 系统

- **FR-006**: MUST 创建 `SvgIcon` 通用组件，位于 `frontend/src/components/icons/SvgIcon.tsx`
- **FR-007**: SvgIcon 组件 MUST 支持 `name`（图标名）、`size`（尺寸，默认 20px）、`className`（自定义样式）属性
- **FR-008**: 所有 SVG 路径 MUST 使用 `currentColor` 作为填充/描边颜色，以继承父元素 color 属性
- **FR-009**: MUST 替换所有组件中的 emoji 为对应的 SvgIcon 调用，包括 `CheckReport.tsx` 中 STATUS_MAP 的 ✓/⚠/✗ 状态符号
- **FR-010**: 图标风格 MUST 统一为线条风格（stroke-based），线宽 1.5-2px，视觉干净利落
- **FR-016**: `UploadPanel.tsx` 中 TDesign `Select.OptionGroup` 的 `label` 属性 MUST 使用 TNode（ReactNode）形式传入 SvgIcon + 文字，而非纯字符串

#### AI 总结缓存

- **FR-011**: MUST 建立 AI 总结的内存缓存机制，key 为 `session_id`，value 为总结文本
- **FR-012**: AiSummary 组件挂载时 MUST 先查缓存，命中则直接渲染（状态为 "done"），不发起 SSE 请求
- **FR-013**: SSE 请求完成（`state === "done"`）后 MUST 将结果写入缓存；流式中断的不完整内容不缓存
- **FR-014**: 缓存 MUST 仅保留在内存中，页面刷新后失效
- **FR-015**: SHOULD 设置缓存上限（如 50 条），超出时淘汰最早的条目

### Key Entities

- **SvgIcon 组件**: 通用 SVG 图标渲染组件，通过 `name` 属性索引内置图标集合
- **图标集合（iconMap）**: 以图标名为 key、SVG path data 为 value 的映射对象
- **AI 总结缓存（summaryCache）**: 以 session_id 为 key、总结文本为 value 的 Map 对象，存储在模块级变量中

## 技术设计要点

### 折叠交互

在 `CheckReport.tsx` 中为每个类别维护一个折叠状态 Map（`Record<string, boolean>`），初始值基于类别内是否有非 PASS 项计算。类别头部添加点击事件和展开/折叠箭头图标（使用 SvgIcon 的 chevron-down / chevron-right）。

```tsx
// 伪代码
const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
  const init: Record<string, boolean> = {};
  for (const cat of categories) {
    const hasIssues = groupedItems[cat].some(i => i.status !== 'PASS');
    init[cat] = !hasIssues; // 无问题则折叠
  }
  return init;
});
```

### SVG Icon 系统

采用内联 SVG 方案（非 SVG sprite），因为图标数量有限（约 20-30 个），内联方案最简单且支持 `currentColor`。

```tsx
// frontend/src/components/icons/SvgIcon.tsx
interface SvgIconProps {
  name: string;
  size?: number;
  className?: string;
}

const iconPaths: Record<string, string> = {
  "document": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z...",
  "search": "M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
  "chart-bar": "...",
  // ... 其他图标
};

export function SvgIcon({ name, size = 20, className }: SvgIconProps) {
  const path = iconPaths[name];
  if (!path) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
         strokeLinejoin="round" className={className}>
      <path d={path} />
    </svg>
  );
}
```

### AI 总结缓存

使用模块级 Map 作为缓存，在 `AiSummary.tsx` 中引用：

```tsx
// frontend/src/services/aiCache.ts
const summaryCache = new Map<string, string>();
const MAX_CACHE_SIZE = 50;

export function getCachedSummary(sessionId: string): string | undefined {
  return summaryCache.get(sessionId);
}

export function setCachedSummary(sessionId: string, content: string): void {
  if (summaryCache.size >= MAX_CACHE_SIZE) {
    // 淘汰最早的条目
    const firstKey = summaryCache.keys().next().value;
    if (firstKey) summaryCache.delete(firstKey);
  }
  summaryCache.set(sessionId, content);
}
```

## 文件结构（新增/修改）

```
frontend/src/
  ├── components/
  │   ├── icons/
  │   │   └── SvgIcon.tsx            [新增] SVG Icon 通用组件 + 图标集合
  │   ├── CheckReport.tsx            [修改] 类别折叠逻辑 + emoji→SvgIcon
  │   ├── AiSummary.tsx              [修改] 缓存命中判断 + emoji→SvgIcon
  │   ├── AiChatPanel.tsx            [修改] emoji→SvgIcon
  │   ├── FixPreview.tsx             [修改] emoji→SvgIcon
  │   ├── HistoryList.tsx            [修改] emoji→SvgIcon
  │   ├── ExtractPanel.tsx           [修改] emoji→SvgIcon
  │   ├── UploadPanel.tsx            [修改] emoji→SvgIcon
  │   ├── RuleManager.tsx            [修改] emoji→SvgIcon
  │   └── App.tsx                    [修改] emoji→SvgIcon
  ├── services/
  │   └── aiCache.ts                 [新增] AI 总结内存缓存模块
  └── __tests__/
      ├── components/
      │   └── icons/
      │       └── SvgIcon.test.tsx   [新增] SvgIcon 组件测试
      └── services/
          └── aiCache.test.ts        [新增] AI 缓存模块测试
```

## Testing Strategy *(mandatory)*

### 单元测试 (Vitest)

- `__tests__/components/icons/SvgIcon.test.tsx` — SvgIcon 组件测试：渲染已知图标、未知图标降级、size/className 传递
- `__tests__/services/aiCache.test.ts` — AI 缓存模块测试：set/get、缓存命中/未命中、LRU 淘汰、上限边界
- `__tests__/components/CheckReport.test.tsx` — [修改] 新增折叠/展开行为测试：默认折叠通过类别、点击展开、全部展开/收起

### 回归测试

每完成一个 Task 后，MUST 运行完整的测试套件确保不引入回归问题。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 检查报告页面中，全部通过的类别默认折叠，页面垂直滚动高度减少 40% 以上（相比折叠前）
- **SC-002**: 全站零 emoji 字符，所有图标位置使用统一的 SvgIcon 组件
- **SC-003**: 从历史列表查看已有 AI 总结的报告时，总结立即展示（< 50ms），无网络请求
- **SC-004**: 所有 SVG Icon 在 Chrome/Firefox/Safari 中渲染一致
- **SC-005**: 现有测试套件全部通过，无回归

## 约束与风险

- **图标设计一致性**：所有图标 MUST 采用统一的线条粗细（1.5px）、圆角风格、24x24 viewBox，避免混搭风格
- **Emoji 清除彻底性**：需用 grep 扫描确保无遗漏的 emoji（可用正则 `[\u{1F300}-\u{1F9FF}]` 等检测）
- **AI 缓存内存占用**：单条 AI 总结约 1-5KB 文本，50 条上限 ≈ 250KB，可忽略不计
- **Constitution 约束**：前端技术栈限于 React + TDesign + TailwindCSS，不引入额外图标库（如 lucide-react），所有图标自行定义 SVG path
