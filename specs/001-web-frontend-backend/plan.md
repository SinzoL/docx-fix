# Implementation Plan: Web 前后端界面

**Branch**: `001-web-frontend-backend` | **Date**: 2026-03-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-web-frontend-backend/spec.md`

## Summary

为 docx-fix 项目构建 Web 前后端界面，将现有的 CLI 格式检查和修复能力可视化。后端使用 Python FastAPI 提供 REST API（封装现有 checker.py / fixer.py），前端使用 React + TDesign 组件库构建用户界面。用户无需登录，上传 .docx 文件后选择检查模板进行格式检查，查看报告后可一键修复、预览修复结果、下载修复后文件。历史记录通过浏览器 IndexedDB 本地缓存，有效期 1 个月。

## Technical Context

**Language/Version**: Python 3.9+ (后端) / TypeScript 5 (前端)
**Primary Dependencies**:
- 后端：FastAPI, uvicorn, python-multipart（文件上传）, python-docx, lxml, pyyaml（已有）
- 前端：React 18, TDesign React v1.12.0, Vite 5, TailwindCSS 3.4.17, idb（IndexedDB 封装）
**Storage**: 浏览器 IndexedDB（客户端缓存），服务端仅临时文件（处理完即清理）
**Testing**: pytest + httpx（后端 API 单元/集成测试）, Vitest + @testing-library/react + jsdom（前端组件/集成测试）
**Target Platform**: Web（现代浏览器 Chrome/Firefox/Safari/Edge）
**Project Type**: Web Application（前后端分离）
**Performance Goals**: 全流程（上传→检查→报告展示）≤ 30 秒
**Constraints**: 文件大小 ≤ 50MB，服务端临时文件即用即删，后端新增依赖尽量精简
**Scale/Scope**: 单用户/少量并发（论文检查工具，非高并发服务）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Assessment |
|---|-----------|--------|------------|
| I | 规则驱动 | ✅ PASS | Web 界面仅作为规则引擎的前端展示层，所有检查/修复逻辑仍由 YAML 规则驱动 |
| II | 只改格式不动内容 | ✅ PASS | Web 界面不引入新的修复逻辑，仅调用现有 fixer.py |
| III | 检查与修复分离 | ✅ PASS | API 分别提供 /check 和 /fix 端点，保持分离 |
| IV | Word XML 精确操作 | ✅ N/A | Web 界面不直接操作 XML，由后端引擎处理 |
| V | CLI 统一入口 | ⚠️ JUSTIFIED | Web 界面是新的用户入口，但不替代 CLI，是"并行入口"而非"独立脚本" |
| VI | 简洁优先 | ⚠️ JUSTIFIED | 引入 FastAPI + React 是新的依赖和复杂度，但这是 spec 的核心需求，且与 CLI 代码分离 |

## Project Structure

### Documentation (this feature)

```text
specs/001-web-frontend-backend/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md           # REST API contract
└── tasks.md             # Phase 2 output (by /speckit.tasks)
```

### Source Code (repository root)

```text
docx-fix/
├── checker.py              # 现有 - 检查引擎
├── fixer.py                # 现有 - 修复引擎
├── docx_fixer.py           # 现有 - CLI 入口
├── analyze_headings.py     # 现有
├── fix_outline_levels.py   # 现有
├── fix_toc_and_numbering.py # 现有
├── rules/                  # 现有 - YAML 规则目录
│   ├── hit_midterm_report.yaml
│   └── default.yaml        # 新增 - 通用默认检查规则
│
├── backend/                # 新增 - Web 后端
│   ├── app.py              # FastAPI 应用入口
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes.py       # API 路由定义
│   │   └── schemas.py      # Pydantic 请求/响应模型
│   ├── services/
│   │   ├── __init__.py
│   │   ├── checker_service.py  # 封装 checker.py
│   │   ├── fixer_service.py    # 封装 fixer.py
│   │   └── rules_service.py    # 扫描 rules/ 目录
│   ├── tests/              # 后端测试
│   │   ├── conftest.py         # pytest fixtures（测试客户端、临时目录等）
│   │   ├── fixtures/           # 测试数据（.docx 文件、.yaml 规则）
│   │   │   ├── sample_good.docx
│   │   │   ├── sample_bad.docx
│   │   │   └── test_rule.yaml
│   │   ├── test_rules_service.py
│   │   ├── test_checker_service.py
│   │   ├── test_fixer_service.py
│   │   ├── test_api_rules.py
│   │   ├── test_api_check.py
│   │   ├── test_api_fix.py
│   │   ├── test_api_rules_detail.py
│   │   └── test_edge_cases.py
│   └── requirements.txt    # 后端依赖（含 pytest, httpx 测试依赖）
│
└── frontend/               # 新增 - Web 前端
    ├── package.json
    ├── vite.config.ts
    ├── vitest.config.ts        # Vitest 测试配置
    ├── tsconfig.json
    ├── tsconfig.app.json
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── components/
        │   ├── UploadPanel.tsx       # 上传区域 + 模板选择
        │   ├── CheckReport.tsx       # 检查报告展示
        │   ├── FixPreview.tsx        # 修复前后对比预览
        │   ├── RuleDetail.tsx        # 规则详情展示
        │   └── HistoryList.tsx       # 历史记录列表
        ├── services/
        │   ├── api.ts               # API 调用封装
        │   └── cache.ts             # IndexedDB 缓存管理
        ├── types/
        │   └── index.ts             # TypeScript 类型定义
        └── __tests__/               # 前端测试
            ├── services/
            │   ├── api.test.ts          # API 封装测试
            │   └── cache.test.ts        # 缓存管理测试
            ├── components/
            │   ├── UploadPanel.test.tsx
            │   ├── CheckReport.test.tsx
            │   ├── FixPreview.test.tsx
            │   ├── RuleDetail.test.tsx
            │   └── HistoryList.test.tsx
            └── App.test.tsx             # 应用集成测试
```

**Structure Decision**: 采用 Option 2 前后端分离结构。后端作为 API 层封装现有 Python 引擎，前端作为独立的 React SPA。两者通过 REST API 通信。现有 Python 代码不做任何修改，后端 `services/` 层仅做函数级调用封装。

## Complexity Tracking

> **Constitution Principle V & VI 违背的理由说明**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 新增 Web 入口（违反 Principle V "唯一入口"） | Spec 的核心需求就是 Web 界面，CLI 入口保持不变，Web 是平行入口 | 无替代方案，用户明确要求 Web 界面 |
| 引入 FastAPI + React（违反 Principle VI "简洁优先"） | 需要 HTTP 服务提供文件上传和 API，需要前端框架提供交互体验 | 纯静态 HTML + CGI 过于原始，无法满足交互需求；Flask 可选但 FastAPI 更轻量且自带 OpenAPI |

## Testing Strategy

### 核心原则

1. **同步编写测试**：每个新特性 MUST 同步编写对应的测试用例，不允许"先写功能后补测试"
2. **全量回归测试**：每完成一个特性后，MUST 运行全量测试套件（前端 + 后端），确保不引入回归
3. **回归优先**：回归测试失败的修复优先级 > 新功能开发

### 每个任务的开发流程

```
实现功能代码 → 编写测试 → 运行测试 → 运行全量回归 → 全部通过 → 标记完成
                                          ↓ (失败)
                                    修复回归问题 → 重新全量回归
```

### 测试运行命令

```bash
# 后端全量测试
cd backend && python -m pytest tests/ -v

# 前端全量测试
cd frontend && npx vitest run

# 一键全量回归（推荐在每个任务完成后执行）
cd backend && python -m pytest tests/ -v && cd ../frontend && npx vitest run
```

### 测试依赖

**后端** (requirements.txt 中额外添加):
- pytest >= 7.0
- httpx >= 0.25（FastAPI AsyncClient 测试）
- pytest-asyncio >= 0.23

**前端** (package.json devDependencies 中额外添加):
- vitest
- @testing-library/react
- @testing-library/jest-dom
- @testing-library/user-event
- jsdom
- fake-indexeddb（模拟 IndexedDB）
