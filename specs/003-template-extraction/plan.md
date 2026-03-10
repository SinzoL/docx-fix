# Implementation Plan: 模板提取与规则管理

**Branch**: `003-template-extraction` | **Date**: 2026-03-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-template-extraction/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

为 docx-fix Web 界面新增「模板提取」独立入口（与"上传检查"并列），用户可上传 `.docx` 模板文档，后端通过 `extractor_service.py` 封装根目录 `rule_extractor.py` 提取格式规则并返回 YAML，前端展示提取预览、支持保存到浏览器 localStorage（30天过期）。同时整合规则管理（CRUD）和 LLM 规则生成（从 spec-002 迁入）功能。

## Technical Context

**Language/Version**: Python ≥ 3.12（后端）、TypeScript 5.x（前端）  
**Primary Dependencies**:
- 后端: FastAPI, python-docx, lxml, pyyaml, openai（LLM 集成，已有）
- 前端: React 18, TDesign React v1.12.0, TailwindCSS 3.4.17, Vite
**Storage**: 浏览器 localStorage（前端自定义规则持久化，键名 `docx-fix:custom-rules`，30天过期）  
**Testing**: pytest（后端）、Vitest + @testing-library/react（前端）  
**Target Platform**: Web 应用（macOS/Linux/Windows 浏览器）  
**Project Type**: Web 应用（FastAPI 后端 + React SPA 前端）  
**Performance Goals**: 模板提取全流程 ≤ 15秒（普通大小模板文件）  
**Constraints**: localStorage 单域名 5-10MB 上限、LLM 不可用时不影响模板提取功能  
**Scale/Scope**: 单用户本地使用，规则数量 < 50 条，单条规则 YAML < 100KB

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 状态 | 说明 |
|------|------|------|
| **I. 规则驱动** | ✅ PASS | 提取产物是 YAML 规则文件，与现有 checker/fixer 引擎完全兼容 |
| **II. 只改格式，不动内容** | ✅ PASS | 本 spec 不涉及文档修改，仅读取模板提取格式规则 |
| **III. 检查与修复分离** | ✅ PASS | 提取是独立功能模块，不影响检查/修复分离 |
| **IV. Word XML 精确操作** | ✅ PASS | `rule_extractor.py` 已有完整实现，精确解析 OOXML |
| **V. 双入口：CLI + Web** | ✅ PASS | 遵循共享模式：`rule_extractor.py`（根目录）→ `extractor_service.py`（薄封装）→ `routes.py`（HTTP） |
| **VI. 简洁优先** | ✅ PASS | 无新后端依赖；前端存储用 localStorage（客户端存储优先）；不引入数据库 |

**Gate Result**: ✅ 全部通过，无违规项。

## Project Structure

### Documentation (this feature)

```text
specs/003-template-extraction/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api-extract-rules.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# 后端（Python / FastAPI）
backend/
├── api/
│   ├── routes.py             [已修改] 新增 POST /api/extract-rules ✅
│   ├── ai_routes.py          [已有]   POST /api/ai/generate-rules（spec-002 实现）
│   └── schemas.py            [已修改] 新增 ExtractRulesResponse 等 ✅
├── services/
│   ├── extractor_service.py  [已新增] 封装 rule_extractor.py ✅
│   ├── checker_service.py    [已有]
│   ├── fixer_service.py      [已有]
│   ├── rules_service.py      [已有]
│   ├── llm_service.py        [已有]
│   └── ai_prompts.py         [已有]
├── tests/
│   ├── test_extractor_service.py  [待新增] 提取服务单元测试
│   └── test_api_extract.py        [待新增] 提取 API 集成测试
├── app.py
└── requirements.txt

# 前端（React + TypeScript）
frontend/src/
├── App.tsx                    [待修改] 新增 Tab 路由（提取模板/规则管理）
├── components/
│   ├── ExtractPanel.tsx       [待新增] 模板提取面板（上传+摘要+YAML预览+保存）
│   ├── RuleManager.tsx        [待新增] 规则管理面板（列表+详情+CRUD操作）
│   ├── UploadPanel.tsx        [待修改] 规则选择器合并自定义规则
│   ├── CheckReport.tsx        [已有]
│   ├── FixPreview.tsx         [已有]
│   ├── HistoryList.tsx        [已有]
│   ├── RuleDetail.tsx         [已有]
│   ├── AiSummary.tsx          [已有]
│   └── AiChatPanel.tsx        [已有]
├── services/
│   ├── api.ts                 [待修改] 新增 extractRules() API 调用
│   ├── ruleStorage.ts         [待新增] localStorage 规则管理（CRUD + 过期清理）
│   ├── cache.ts               [已有]
│   └── sse.ts                 [已有]
├── types/
│   └── index.ts               [待修改] 新增 CustomRule 等类型
└── __tests__/
    ├── services/
    │   └── ruleStorage.test.ts    [待新增]
    └── components/
        ├── ExtractPanel.test.tsx  [待新增]
        └── RuleManager.test.tsx   [待新增]

# 核心引擎（根目录，不修改）
rule_extractor.py              [已有] 1163行，完整的模板提取引擎
checker.py                     [已有]
fixer.py                       [已有]
```

**Structure Decision**: 遵循 Web 应用模式（Option 2），与 spec-001/002 一致。后端和前端分离，核心引擎保持在根目录。本次新增的代码完全遵循现有目录结构，不创建新的顶层目录。

## Complexity Tracking

> 无违规项需要解释。Constitution Check 全部通过。

## Constitution Re-check (Post Phase 1 Design)

| 原则 | 状态 | 设计阶段复查说明 |
|------|------|-----------------|
| **I. 规则驱动** | ✅ PASS | data-model 中 CustomRule 的核心载荷是 `yaml_content`（YAML 规则文本），与 checker/fixer 的规则文件格式完全兼容 |
| **II. 只改格式，不动内容** | ✅ PASS | 无文档修改操作。ExtractResult 仅读取模板格式信息 |
| **III. 检查与修复分离** | ✅ PASS | 提取功能独立于检查/修复。contracts 中 check/fix API 的扩展仅新增可选参数，不改变原有行为 |
| **IV. Word XML 精确操作** | ✅ PASS | 复用 `rule_extractor.py`，无新增 XML 操作 |
| **V. 双入口：CLI + Web** | ✅ PASS | `extractor_service.py` 已创建，遵循共享模式。CLI 的 `rule_extractor.py` 不受影响 |
| **VI. 简洁优先** | ✅ PASS | research 决定使用 localStorage（非 IndexedDB）、手动正则 YAML 高亮（非 Monaco）、请求体传递规则（非服务端持久化），全部选择最简方案 |

**Re-check Result**: ✅ 全部通过。设计阶段未引入任何 Constitution 违规。

## Generated Artifacts

| 产物 | 路径 | 说明 |
|------|------|------|
| **plan.md** | `specs/003-template-extraction/plan.md` | 本文件 |
| **research.md** | `specs/003-template-extraction/research.md` | 4 个 research topic，全部 resolved |
| **data-model.md** | `specs/003-template-extraction/data-model.md` | 3 个实体：CustomRule、ExtractResult、ExtractSummary |
| **contracts/** | `specs/003-template-extraction/contracts/api-extract-rules.md` | 5 个 API 端点 + localStorage 契约 + ruleStorage API |
| **quickstart.md** | `specs/003-template-extraction/quickstart.md` | 启动指南 + 功能使用说明 + 调试提示 |
| **CODEBUDDY.md** | `CODEBUDDY.md` | Agent context 已更新（新增 localStorage 技术栈） |
