# Implementation Plan: 检查引擎增强 — 样式继承链、结构树验证、场景化预设

**Branch**: `005-checker-enhance` | **Date**: 2026-03-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-checker-enhance/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

增强 docx-fix 检查引擎三大能力：（1）实现完整的 OOXML 属性解析优先级链（Run 直接格式 → 段落样式 → basedOn 链 → docDefaults → 内置默认），解决当前误报/漏报问题，并在检查消息中融入属性来源标注；（2）新增文档结构树验证，检查标题层级连续性和深度限制；（3）新增 2 个场景化预设规则（通用学术论文 + 国标公文）。同时将 1323 行的 checker.py 重构为 checker/ 子包，保持对外接口不变。

## Technical Context

**Language/Version**: Python 3.12+（后端核心引擎）、TypeScript 5.x（前端）
**Primary Dependencies**: python-docx、lxml、pyyaml（核心引擎）、FastAPI（后端）、React 18 + TDesign（前端）
**Storage**: YAML 规则文件（`backend/rules/`）、无数据库
**Testing**: pytest（后端）、Vitest + @testing-library/react（前端）
**Target Platform**: Web 应用 + CLI 双入口
**Project Type**: Web 应用（React SPA 前端 + FastAPI 后端）+ Python CLI
**Performance Goals**: 新增检查项在标准文档上执行 < 500ms；大文档（500+ 段落）总检查时间 < 5s
**Constraints**: 核心引擎零新增依赖（Constitution VI）；向后兼容：已有 PASS 不变 FAIL，允许新增检查项
**Scale/Scope**: 5 个新模块文件（checker/ 子包）；2 个新 YAML 规则文件；1 个新 Python 类（PropertyResolver）；后端 schema 新增 1 个字段；前端 1 个组件微调

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 状态 | 说明 |
|------|------|------|
| **I. 规则驱动** | ✅ PASS | 新增预设规则以 YAML 文件形式存储，符合规则驱动原则；新增 `max_heading_depth` 等配置也在 YAML 中声明 |
| **II. 只改格式，不动内容** | ✅ PASS | 本 spec 只增强检查引擎，不涉及文档修改 |
| **III. 检查与修复分离** | ✅ PASS | 新增功能全部在 checker 侧，不涉及 fixer；Run 直接格式覆盖标记 fixable 为未来 fixer 扩展做准备 |
| **IV. Word XML 精确操作** | ✅ PASS | PropertyResolver 使用 lxml 命名空间感知 API 操作 XML；basedOn 链遍历使用 `style.element.find()` |
| **V. 双入口：CLI + Web** | ✅ PASS | checker/ 子包重构保持 `DocxChecker` 对外接口不变，CLI 和 Web 入口均不受影响 |
| **VI. 简洁优先** | ✅ PASS | 核心引擎零新增依赖；PropertyResolver 使用模块级缓存（dict）而非引入缓存库；checker/ 子包按领域拆分为 5 个文件而非过度细分 |
| **VII. 安全防御** | ✅ PASS | 新增预设规则文件是项目内置资源，不涉及用户输入；rule_id 校验机制已存在 |

**Gate Result**: ✅ 全部通过，无违规项。

## Project Structure

### Documentation (this feature)

```text
specs/005-checker-enhance/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output — 4 个技术研究主题
├── data-model.md        # Phase 1 output — 6 个实体模型定义
├── quickstart.md        # Phase 1 output — 验证指南 + 调试提示
├── contracts/           # Phase 1 output
│   └── checker-api.md   # checker 子包接口 + API 变更契约
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# 后端（Python + FastAPI）
backend/
├── scripts/
│   └── checker/                        [重构] 从 checker.py 拆分为子包
│       ├── __init__.py                 [新增] 对外接口不变，re-export DocxChecker 等
│       ├── base.py                     [新增] DocxChecker 类骨架 + CheckResult + 公共工具
│       │                               包含: __init__, add_result, run_all_checks, print_report
│       │                               check_page_setup, check_header_footer, check_toc
│       │                               _is_cover_page_paragraph, _get_para_outline_level, main
│       ├── property_resolver.py        [新增] PropertyResolver 类 — OOXML 属性解析链
│       │                               Run直接格式→段落样式→basedOn链→docDefaults→内置默认
│       ├── style_checker.py            [新增] 样式相关检查方法
│       │                               _get_style_xml_info, _get_parent_style, check_style_definitions
│       │                               check_paragraph_formatting (增强: 使用 PropertyResolver)
│       │                               check_font_consistency, check_template_instructions
│       │                               check_figure_table_captions
│       ├── heading_validator.py        [新增] 标题相关检查
│       │                               check_heading_hierarchy (新增: 层级树验证)
│       │                               check_heading_styles (迁移)
│       │                               check_document_structure (迁移)
│       └── numbering_checker.py        [新增] 编号相关检查（7个方法迁移）
│                                       check_heading_numbering ~ check_heading_numbering_indent
│                                       _get_numbering_part, _get_heading_abstract_num_id
├── rules/
│   ├── default.yaml                    [保留] 通用默认
│   ├── hit_midterm_report.yaml         [保留] 哈工大中期报告
│   ├── academic_paper.yaml             [新增] 通用学术论文预设 (~250行)
│   └── gov_document.yaml               [新增] 国标公文预设 (~200行)
├── api/
│   └── schemas.py                      [修改] RuleInfo 新增 is_preset 字段
├── services/
│   ├── rules_service.py                [修改] 读取 meta.is_preset 填充到 RuleInfo
│   ├── checker_service.py              [不变] 导入路径不变 (from scripts.checker import DocxChecker)
│   └── fixer_service.py                [不变] 导入路径不变
└── tests/
    ├── test_checker_inheritance.py     [新增] 属性解析链测试
    ├── test_checker_structure.py       [新增] 文档结构树验证测试
    └── test_rule_presets.py            [新增] 预设规则加载与格式校验测试

# 前端（React + TypeScript）
frontend/src/
├── components/
│   └── UploadPanel.tsx                 [修改] 规则下拉中预设规则显示 "预设" 小标签
└── __tests__/
    └── components/
        └── UploadPanel.test.tsx        [修改] 新增预设规则标签展示测试
```

**Structure Decision**: 遵循 Web 应用模式（Option 2），与 spec-001/002/003/004 一致。本 spec 主要涉及后端核心引擎重构，前端仅微调。checker.py → checker/ 子包重构是主要的结构变更，通过 `__init__.py` re-export 保持完全向后兼容。

## Complexity Tracking

> 无违规项需要解释。Constitution Check 全部通过。

> **注意事项**：checker/ 子包拆分引入了 5 个新模块文件，但这是对现有 1323 行单文件的降复杂度操作，每个模块约 200-400 行，符合简洁优先原则。

## Constitution Re-check (Post Phase 1 Design)

| 原则 | 状态 | 设计阶段复查说明 |
|------|------|-----------------|
| **I. 规则驱动** | ✅ PASS | 新增 `max_heading_depth`、`non_chapter_styles` 在 YAML 规则中配置，符合规则驱动 |
| **II. 只改格式，不动内容** | ✅ PASS | 纯检查引擎增强，不涉及文档修改 |
| **III. 检查与修复分离** | ✅ PASS | 所有新增功能在 checker 侧；fixable 标记为后续 fixer 扩展预留 |
| **IV. Word XML 精确操作** | ✅ PASS | PropertyResolver 使用 lxml NSMAP 操作 XML；docDefaults 通过 `w:docDefaults/w:rPrDefault` 精确读取 |
| **V. 双入口：CLI + Web** | ✅ PASS | checker/ `__init__.py` re-export 保持导入路径不变，CLI main() 保留在 base.py 中 |
| **VI. 简洁优先** | ✅ PASS | 零新增 pip/npm 依赖；PropertyResolver 缓存用 dict；规则预设用 YAML `meta.is_preset` 自描述 |
| **VII. 安全防御** | ✅ PASS | 不涉及新增用户输入接口；rule_id 校验机制已存在覆盖新增的预设规则 |

**Re-check Result**: ✅ 全部通过。设计阶段未引入任何 Constitution 违规。

## Generated Artifacts

| 产物 | 路径 | 说明 |
|------|------|------|
| **plan.md** | `specs/005-checker-enhance/plan.md` | 本文件 |
| **research.md** | `specs/005-checker-enhance/research.md` | 4 个 research topic，全部 resolved |
| **data-model.md** | `specs/005-checker-enhance/data-model.md` | 6 个实体：PropertyResolver、ResolvedProperty、PropertySource、HeadingInfo、CheckResult(不变)、RuleInfo(扩展) |
| **contracts/** | `specs/005-checker-enhance/contracts/checker-api.md` | checker 子包接口、PropertyResolver API、HeadingValidator API、GET /rules 响应扩展 |
| **quickstart.md** | `specs/005-checker-enhance/quickstart.md` | 验证指南 + 调试提示 |
| **CODEBUDDY.md** | `CODEBUDDY.md` | Agent context 待更新 |
