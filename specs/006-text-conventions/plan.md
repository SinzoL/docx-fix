# Implementation Plan: 通用文本排版习惯检查 — 标点·空格·全半角 + LLM 争议审查

**Branch**: `006-text-conventions` | **Date**: 2026-03-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-text-conventions/spec.md`

## Summary

为 docx-fix 新增文本内容层面的通用排版习惯检查：（1）checker 子包新增 `text_convention_checker.py`，实现 7 类确定性检查 + 3 类争议候选；（2）新增 `POST /api/ai/review-conventions` LLM 争议审查端点（batch + 15s 超时）；（3）新增 `text_convention_fixer.py` 独立文本修复模块；（4）前端分层展示 + AI 审查标签 + 异步加载态；（5）YAML `text_conventions` section 驱动。

## Technical Context

**Language/Version**: Python 3.12+ / TypeScript 5.x
**Primary Dependencies**: python-docx、re（标准库）、FastAPI、React 18 + TDesign、openai SDK
**Storage**: YAML 规则文件，无数据库
**Testing**: pytest / Vitest
**Target Platform**: Web 应用（React SPA + FastAPI）
**Constraints**: 核心引擎零新增依赖（Constitution VI）；向后兼容现有检查

## Constitution Check

| 原则 | 状态 | 说明 |
|------|------|------|
| **I. 规则驱动** | ✅ PASS | `text_conventions` YAML section 驱动，默认配置写入所有预置 YAML |
| **II. 只改格式，不动内容** | ⚠️ Justified | 文本修复需 opt-in（`include_text_fix`），默认仅 WARN |
| **III. 检查与修复分离** | ✅ PASS | checker 与 fixer 完全分离 |
| **IV. Word XML 精确操作** | ✅ PASS | `iter_all_paragraphs()` 遍历 XML；修复保留 Run 格式 |
| **V. 双入口** | ✅ PASS | 在 `run_all_checks()` 注册，CLI/Web 均调用 |
| **VI. 简洁优先** | ✅ PASS | 零新增依赖（`re` 标准库 + `python-docx` 已有） |
| **VII. 安全防御** | ✅ PASS | 复用现有安全机制 |

## Project Structure

### Source Code

```text
backend/
├── scripts/checker/
│   ├── base.py                       [修改] run_all_checks() 注册文本检查
│   └── text_convention_checker.py    [新增] 10 类检查 + iter_all_paragraphs
├── scripts/text_convention_fixer.py  [新增] 5 类确定性修复 + Run 回写
├── services/
│   ├── checker_service.py            [修改] check_layer/id/text_convention_meta
│   ├── fixer_service.py              [修改] include_text_fix + 文本修复叠加
│   └── ai_prompts.py                [修改] 争议审查 prompt
├── api/
│   ├── schemas.py                    [修改] 6 个新字段/类型
│   └── ai_routes.py                  [修改] /api/ai/review-conventions
├── rules/*.yaml                      [修改] 新增 text_conventions section
frontend/src/
├── components/CheckReport.tsx        [修改] 分层展示 + AI 标签
├── components/FixPreview.tsx         [修改] fix_layer 分组
├── services/api.ts                   [修改] reviewConventions API
└── types/index.ts                    [修改] 类型扩展
```

## Complexity Tracking

| 违规 | 为何需要 | 被拒绝方案 |
|------|---------|-----------|
| Principle II | 文本修复是排版笔误修正，非内容修改 | 仅 WARN 不修复——用户需手动改，体验差 |

## Generated Artifacts

| 产物 | 路径 | 说明 |
|------|------|------|
| spec.md | `specs/006-text-conventions/spec.md` | 功能规格（4 个 US + 29 个 FR） |
| plan.md | `specs/006-text-conventions/plan.md` | 本文件 |
| data-model.md | `specs/006-text-conventions/data-model.md` | 6 个实体 + API Schema |
| quickstart.md | `specs/006-text-conventions/quickstart.md` | 验证指南 + 调试提示 |
| tasks.md | `specs/006-text-conventions/tasks.md` | 任务分解（全部已完成） |
