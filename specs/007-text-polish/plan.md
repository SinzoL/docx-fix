# Implementation Plan: 内容润色 — LLM 驱动的学术文本表达优化

**Branch**: `007-text-polish` | **Date**: 2026-03-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-text-polish/spec.md`

## Summary

为 docx-fix 新增内容润色功能：（1）提取文档段落文本并保留 Run 结构信息；（2）分批调用 LLM 进行学术表达优化（语病/用词/句式/标点/学术规范）；（3）可选的 Reviewer Agent 审核语义一致性；（4）用户在前端逐条接受/拒绝润色建议后，精确回写修改到文档（保留原格式）；（5）SSE 流式推送实现渐进式渲染。

## Technical Context

**Language/Version**: Python 3.12+（后端）、TypeScript 5.x（前端）
**Primary Dependencies**: python-docx、lxml、openai（后端核心）、FastAPI + SSE（后端 Web）、React 18 + TDesign（前端）
**Storage**: 临时文件（TEMP_DIR）、无数据库
**Testing**: pytest（后端）、Vitest + @testing-library/react（前端）
**Target Platform**: Web 应用（React SPA + FastAPI 后端）
**Project Type**: Web 应用
**Performance Goals**: 50 段文档润色 < 60s（含 LLM 调用）；SSE 延迟 < 2s
**Constraints**: 复用现有 openai SDK（不引入新核心依赖）；润色功能独立于格式检查/修复流程；LLM API Key 必须已配置
**Scale/Scope**: 后端 1 个新子包（5 个文件）+ 1 个新 service + 1 个新 routes 文件 + schema 扩展 + prompt 扩展；前端 2 个新组件 + 1 个组件修改 + 类型扩展

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 状态 | 说明 |
|------|------|------|
| **I. 规则驱动** | ⚠️ N/A | 内容润色不由 YAML 规则驱动（LLM 驱动），但这是一个**独立于格式检查的全新功能**，不违反规则检查引擎的规则驱动原则 |
| **II. 只改格式，不动内容** | ⚠️ Justified Extension | 内容润色修改文本字符串（类似 006 文本排版）。缓解：独立流程、逐条审阅、双 Agent、自动备份 |
| **III. 检查与修复分离** | ✅ PASS | 润色引擎是独立的子包（`polisher/`），不影响 checker 和 fixer |
| **IV. Word XML 精确操作** | ✅ PASS | TextWriter 使用 python-docx 的 Run API 精确回写文本，不影响 XML 格式属性 |
| **V. 双入口：CLI + Web** | ⚠️ Partial | 首期仅实现 Web 入口。polisher/ 子包设计为独立模块，后续可轻松添加 CLI 入口 |
| **VI. 简洁优先** | ✅ PASS | 零新增 pip 依赖（复用 openai SDK）；polisher/ 子包 5 个文件各 100-300 行；前端 2 个新组件 |
| **VII. 安全防御** | ✅ PASS | session_id UUID 校验复用现有机制；文件路径安全复用现有 TEMP_DIR 防护 |

**Gate Result**: ✅ 通过。Principle II 的 justified extension 已在 spec 中充分说明缓解措施。

## Project Structure

### Documentation (this feature)

```text
specs/007-text-polish/
├── plan.md              # This file
├── spec.md              # 功能规格说明
├── research.md          # 5 个技术研究主题
├── data-model.md        # 7 个运行时实体 + API Schema
├── quickstart.md        # 验证指南 + 调试提示
├── contracts/           
│   └── polish-api.md    # API 接口契约 + 子包接口
└── tasks.md             # 任务分解（/speckit.tasks 生成）
```

### Source Code (repository root)

```text
# 后端（Python + FastAPI）
backend/
├── scripts/
│   └── polisher/                           [新增] 润色引擎子包
│       ├── __init__.py                     [新增] 对外接口（导出 TextExtractor, PolishEngine 等）
│       ├── text_extractor.py               [新增] TextExtractor 类
│       │                                   段落遍历 + 分类（可润色/不可润色）
│       │                                   RunInfo 快照记录（文本 + 格式 + 偏移量）
│       │                                   分批逻辑（batch_paragraphs）
│       ├── polish_engine.py                [新增] PolishEngine 类
│       │                                   分批 LLM 润色（polish_batch）
│       │                                   上下文窗口构建（context_window）
│       │                                   Polisher Agent 调用（带重试）
│       │                                   Reviewer Agent 调用（可选）
│       │                                   SSE 流式生成器（polish_document）
│       ├── diff_calculator.py              [新增] DiffCalculator 类
│       │                                   字级别 diff（基于 difflib）
│       │                                   Run 映射计算（字符偏移→Run 边界）
│       └── text_writer.py                  [新增] TextWriter 类
│                                           分层回写策略（单 Run / 同格式 / 字符对齐）
│                                           格式保留（不修改 Run 格式属性）
│                                           自动备份（.polish.bak）
├── services/
│   ├── polisher_service.py                 [新增] 润色业务编排
│   │                                       文件上传处理 + 提取 + 润色流 + 应用 + 下载
│   └── ai_prompts.py                       [修改] 新增 Section 5(Polisher) + Section 6(Reviewer)
├── api/
│   ├── polish_routes.py                    [新增] 润色 API 路由
│   │                                       POST /api/polish (SSE)
│   │                                       POST /api/polish/apply
│   │                                       GET /api/polish/download/{session_id}
│   ├── schemas.py                          [修改] 新增润色相关 Pydantic Schema
│   └── routes.py                           [不变]
├── app.py                                  [修改] 注册 polish_routes 蓝图
└── tests/
    ├── test_text_extractor.py              [新增] 段落提取测试
    ├── test_polish_engine.py               [新增] 润色引擎测试（mock LLM）
    ├── test_text_writer.py                 [新增] 格式保留回写测试
    └── test_diff_calculator.py             [新增] Diff 计算测试

# 前端（React + TypeScript）
frontend/src/
├── components/
│   ├── UploadPanel.tsx                     [修改] 新增 "内容润色" Tab
│   ├── PolishPanel.tsx                     [新增] 润色主面板
│   │                                       文件上传 + 进度显示 + SSE 接收
│   └── PolishPreview.tsx                   [新增] 润色预览
│                                           Diff 对比视图 + 接受/拒绝 + 类型筛选 + 下载
├── types/
│   └── index.ts                            [修改] 新增润色类型 + AppState 扩展
└── __tests__/
    └── components/
        ├── PolishPanel.test.tsx             [新增]
        └── PolishPreview.test.tsx           [新增]
```

**Structure Decision**: 遵循 Web 应用模式（与 spec-001~006 一致）。polisher/ 子包与 checker/ 子包平行，遵循相同的模块化架构。前端新增独立组件，通过 Tab 切换集成到现有 UploadPanel。

## Complexity Tracking

| 违规 | 为何需要 | 被拒绝的更简单方案 |
|------|---------|-------------------|
| Principle II Extension | 内容润色的核心价值需要修改文本字符串 | 仅做"建议展示不修改"——用户需手动在 Word 中改，体验差 |

## Constitution Re-check (Post Phase 1 Design)

| 原则 | 状态 | 设计阶段复查说明 |
|------|------|-----------------|
| **I. 规则驱动** | ⚠️ N/A | 润色功能是 LLM 驱动（非 YAML 规则），独立于格式检查引擎，不违反检查引擎的规则驱动原则 |
| **II. 只改格式，不动内容** | ⚠️ Justified | 缓解措施完备：独立流程 / 逐条审阅 / 双 Agent / 自动备份 / 默认不自动应用 |
| **III. 检查与修复分离** | ✅ PASS | polisher/ 与 checker/ 和 fixer 完全独立，无交叉依赖 |
| **IV. Word XML 精确操作** | ✅ PASS | TextWriter 使用 python-docx Run.text 赋值，不直接操作 XML 标签 |
| **V. 双入口：CLI + Web** | ⚠️ Partial | polisher/ 子包可独立使用，后续可添加 CLI 命令 |
| **VI. 简洁优先** | ✅ PASS | 零新增 pip/npm 依赖；difflib 是 Python 标准库 |
| **VII. 安全防御** | ✅ PASS | 复用现有 session_id 校验和 TEMP_DIR 路径防护 |

**Re-check Result**: ✅ 通过。

## Generated Artifacts

| 产物 | 路径 | 说明 |
|------|------|------|
| **spec.md** | `specs/007-text-polish/spec.md` | 功能规格：5 个用户故事 + 30 个 FR |
| **plan.md** | `specs/007-text-polish/plan.md` | 本文件 |
| **research.md** | `specs/007-text-polish/research.md` | 5 个 research topic |
| **data-model.md** | `specs/007-text-polish/data-model.md` | 7 个实体 + API Schema + 前端类型 |
| **contracts/** | `specs/007-text-polish/contracts/polish-api.md` | polisher 子包接口 + REST API 契约 |
| **quickstart.md** | `specs/007-text-polish/quickstart.md` | 验证指南 + 调试提示 |
