# Quickstart: UI 样式美化与体验优化

**Feature**: 004-ui-polish
**Date**: 2026-03-10

## 前置条件

- Node.js ≥ 18 + npm
- 已有 docx-fix 项目代码
- 已完成 spec-001 ~ 003 的实现（前端组件已存在）

## 1. 启动前端开发服务器

```bash
cd docx-fix/frontend
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`

## 2. 验证 SVG Icon 系统

### 2.1 查看图标是否正确渲染

1. 打开应用主页，检查 **Logo 区域**：应显示 SVG 线条图标（非 📝 emoji）
2. 查看 **Tab 标签**：「上传检查」和「提取模板」Tab 应显示 SVG 图标
3. 上传文档并完成检查，查看 **检查报告**：
   - 标题栏图标为 SVG（非 📊）
   - 状态标记为 SVG（非 ✓/⚠/✗）
   - AI 问答按钮和规则详情按钮使用 SVG 图标

### 2.2 验证图标适配性

- 在深色背景元素上查看图标颜色是否自动适配（`currentColor` 继承）
- 调整浏览器缩放（80%/120%/150%），确认 SVG 图标清晰锐利、不模糊

### 2.3 确认零 Emoji

在终端中运行以下命令，确认无残留 emoji：

```bash
grep -rn $'[\U0001F300-\U0001F9FF\U00002600-\U000026FF\U00002700-\U000027BF]' frontend/src/ || echo "✓ 无残留 emoji"
```

## 3. 验证折叠交互

### 3.1 默认折叠/展开

1. 上传一个**存在部分格式问题**的文档
2. 完成检查后查看报告的"具体检查项详情"区域：
   - **全部通过的类别**：应默认折叠，仅显示一行摘要
   - **含 FAIL/WARN 的类别**：应默认展开，显示所有检查项

### 3.2 手动折叠/展开

1. 点击一个**已折叠的类别头部** → 应展开显示子项
2. 点击一个**已展开的类别头部** → 应折叠为一行摘要
3. 点击"具体检查项详情"标题行右侧的**"展开全部"**按钮 → 所有类别展开
4. 点击**"收起全部"**按钮 → 所有类别折叠

### 3.3 全部通过场景

1. 上传一个**格式完全正确**的文档
2. 所有类别应默认折叠
3. 顶部应显示醒目的"全部通过"提示

## 4. 验证 AI 总结缓存

### 4.1 首次查看

1. 上传文档并完成检查
2. 观察 AI 总结区域 — 应看到流式加载动画
3. 等待总结完成

### 4.2 缓存命中

1. 点击"历史检查"查看历史列表
2. 点击刚才的检查记录回到报告
3. AI 总结应**立即展示**（无加载过程、无网络请求）

### 4.3 刷新后缓存清空

1. 刷新页面（F5）
2. 从历史记录再次查看同一报告
3. AI 总结应**重新发起 SSE 请求**（缓存已清空）

### 4.4 重新分析

1. 查看已缓存的报告
2. 点击"重新分析"按钮
3. 应清除缓存并重新发起 LLM 请求

## 5. 运行测试

```bash
cd docx-fix/frontend
npm run test
```

预期所有测试通过，包括新增的：
- `__tests__/components/icons/SvgIcon.test.tsx` — SvgIcon 组件测试
- `__tests__/services/aiCache.test.ts` — AI 缓存模块测试
- `__tests__/components/CheckReport.test.tsx` — 折叠/展开行为测试（修改）

## 6. 关键文件索引

| 文件 | 说明 |
|------|------|
| `frontend/src/components/icons/SvgIcon.tsx` | SVG Icon 通用组件 + 图标集合 |
| `frontend/src/services/aiCache.ts` | AI 总结内存缓存模块 |
| `frontend/src/components/CheckReport.tsx` | 折叠逻辑 + emoji→SvgIcon |
| `frontend/src/components/AiSummary.tsx` | 缓存命中判断 + emoji→SvgIcon |
| `frontend/src/components/App.tsx` | emoji→SvgIcon |
| `frontend/src/components/ExtractPanel.tsx` | emoji→SvgIcon（最多替换） |

## 7. 调试提示

- **图标不显示**：检查 `SvgIcon` 的 `name` 属性是否拼写正确（kebab-case），可在控制台 `console.log(Object.keys(iconPaths))` 查看可用图标
- **图标颜色不对**：确认父元素设置了 `color` CSS 属性，SvgIcon 使用 `currentColor` 继承
- **折叠状态异常**：检查 `groupedItems` 数据结构是否正确包含 `status` 字段
- **AI 缓存不生效**：确认 SSE 请求确实走到了 `done` 状态，中途中断的不会缓存
