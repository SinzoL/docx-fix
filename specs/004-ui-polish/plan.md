# Implementation Plan: UI 样式美化与体验优化

**Branch**: `004-ui-polish` | **Date**: 2026-03-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-ui-polish/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

对 docx-fix 前端进行三项 UI 体验优化：（1）检查报告中全部通过的类别默认折叠，突出展示未通过项及修复建议；（2）建立统一的 SVG Icon 组件系统，替换全站所有 emoji 为有设计感的线条矢量图标；（3）缓存 AI 深度总结结果，避免从历史记录返回时重复触发 LLM 请求。三项优化均为纯前端变更，不涉及后端改动。

## Technical Context

**Language/Version**: TypeScript 5.x（前端）
**Primary Dependencies**: React 18, TDesign React v1.12.0, TailwindCSS 3.4.17, Vite
**Storage**: 内存缓存（AI 总结），模块级 Map 对象（页面刷新后失效）
**Testing**: Vitest + @testing-library/react（前端）
**Target Platform**: Web 应用（Chrome/Firefox/Safari 浏览器）
**Project Type**: Web 应用（React SPA 前端）
**Performance Goals**: AI 总结缓存命中时 < 50ms 展示；折叠后页面垂直滚动高度减少 40%+
**Constraints**: 无额外组件库（Constitution VI）；SVG Icon 手动定义 path data，不引入 lucide-react 等图标库；AI 总结缓存上限 50 条
**Scale/Scope**: 约 20-30 个 SVG 图标；9 个组件文件需要 emoji 替换；1 个新增组件（SvgIcon）；1 个新增服务（aiCache）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 状态 | 说明 |
|------|------|------|
| **I. 规则驱动** | ✅ PASS | 本 spec 不涉及规则逻辑，仅 UI 层优化 |
| **II. 只改格式，不动内容** | ✅ PASS | 不涉及文档修改，纯前端交互和视觉变更 |
| **III. 检查与修复分离** | ✅ PASS | 折叠逻辑仅影响报告展示层，不改变 checker/fixer 行为 |
| **IV. Word XML 精确操作** | ✅ PASS | 不涉及 XML 操作 |
| **V. 双入口：CLI + Web** | ✅ PASS | 纯 Web 前端变更，CLI 不受影响 |
| **VI. 简洁优先** | ✅ PASS | SvgIcon 自行定义 path data（不引入图标库）；AI 缓存使用模块级 Map（不引入状态管理库）；零新增外部依赖 |

**Gate Result**: ✅ 全部通过，无违规项。

## Project Structure

### Documentation (this feature)

```text
specs/004-ui-polish/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (内部组件接口契约)
│   └── svg-icon-api.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# 前端（React + TypeScript）— 本 spec 仅涉及前端变更
frontend/src/
├── components/
│   ├── icons/
│   │   └── SvgIcon.tsx            [新增] SVG Icon 通用组件 + 图标集合（iconMap）
│   ├── CheckReport.tsx            [修改] 类别折叠逻辑 + emoji→SvgIcon + 状态符号→SvgIcon
│   ├── AiSummary.tsx              [修改] 缓存命中判断 + emoji→SvgIcon
│   ├── AiChatPanel.tsx            [修改] emoji→SvgIcon
│   ├── FixPreview.tsx             [修改] emoji→SvgIcon
│   ├── HistoryList.tsx            [修改] emoji→SvgIcon
│   ├── ExtractPanel.tsx           [修改] emoji→SvgIcon
│   ├── UploadPanel.tsx            [修改] emoji→SvgIcon + TNode label
│   ├── RuleManager.tsx            [修改] emoji→SvgIcon
│   ├── RuleDetail.tsx             [已有] 无修改
│   └── App.tsx                    [修改] emoji→SvgIcon
├── services/
│   ├── aiCache.ts                 [新增] AI 总结内存缓存模块（Map + LRU 淘汰）
│   ├── api.ts                     [已有] 无修改
│   ├── cache.ts                   [已有] 无修改
│   ├── ruleStorage.ts             [已有] 无修改
│   └── sse.ts                     [已有] 无修改
├── types/
│   └── index.ts                   [已有] 无修改
├── utils/
│   └── yamlHighlight.ts           [已有] 无修改
└── __tests__/
    ├── components/
    │   ├── icons/
    │   │   └── SvgIcon.test.tsx   [新增] SvgIcon 组件测试
    │   ├── CheckReport.test.tsx   [修改] 新增折叠/展开行为测试
    │   ├── ExtractPanel.test.tsx  [已有] 无修改
    │   ├── FixPreview.test.tsx    [已有] 无修改
    │   ├── HistoryList.test.tsx   [已有] 无修改
    │   ├── RuleDetail.test.tsx    [已有] 无修改
    │   ├── RuleManager.test.tsx   [已有] 无修改
    │   └── UploadPanel.test.tsx   [已有] 无修改
    ├── services/
    │   ├── aiCache.test.ts        [新增] AI 缓存模块测试
    │   ├── api.test.ts            [已有] 无修改
    │   ├── cache.test.ts          [已有] 无修改
    │   └── ruleStorage.test.ts    [已有] 无修改
    └── setup.ts                   [已有] 无修改
```

**Structure Decision**: 遵循 Web 应用模式（Option 2），与 spec-001/002/003 一致。本 spec 仅涉及前端变更，不修改后端。新增 `components/icons/` 子目录存放 SvgIcon 组件，新增 `services/aiCache.ts` 存放 AI 缓存逻辑。

## Complexity Tracking

> 无违规项需要解释。Constitution Check 全部通过。

## Constitution Re-check (Post Phase 1 Design)

| 原则 | 状态 | 设计阶段复查说明 |
|------|------|-----------------|
| **I. 规则驱动** | ✅ PASS | 不涉及规则逻辑，纯 UI 层优化 |
| **II. 只改格式，不动内容** | ✅ PASS | 不涉及文档修改 |
| **III. 检查与修复分离** | ✅ PASS | 折叠逻辑仅影响报告展示层（渲染阶段），不改变 checker/fixer 行为 |
| **IV. Word XML 精确操作** | ✅ PASS | 不涉及 XML 操作 |
| **V. 双入口：CLI + Web** | ✅ PASS | 纯 Web 前端变更，CLI 不受影响 |
| **VI. 简洁优先** | ✅ PASS | 零新增 npm 依赖。SvgIcon 手动定义 path data（约 25 个图标，< 10KB）；AI 缓存使用模块级 Map（最简方案）；折叠状态使用 useState（无状态管理库） |

**Re-check Result**: ✅ 全部通过。设计阶段未引入任何 Constitution 违规。

## Generated Artifacts

| 产物 | 路径 | 说明 |
|------|------|------|
| **plan.md** | `specs/004-ui-polish/plan.md` | 本文件 |
| **research.md** | `specs/004-ui-polish/research.md` | 4 个 research topic，全部 resolved |
| **data-model.md** | `specs/004-ui-polish/data-model.md` | 4 个运行时实体：IconMap、SvgIconProps、SummaryCacheEntry、CollapsedState |
| **contracts/** | `specs/004-ui-polish/contracts/svg-icon-api.md` | SvgIcon 组件、AI 缓存服务、折叠交互、Emoji 替换清单 |
| **quickstart.md** | `specs/004-ui-polish/quickstart.md` | 验证指南 + 调试提示 |
| **CODEBUDDY.md** | `CODEBUDDY.md` | Agent context 已更新 |
