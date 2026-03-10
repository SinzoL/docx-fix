# Tasks: 检查引擎增强 — 样式继承链、结构树验证、场景化预设

**Input**: Design documents from `/specs/005-checker-enhance/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Spec Testing Strategy 中明确要求了后端单元测试（属性解析链、结构树验证、预设规则）和前端测试（UploadPanel 预设标签），故包含测试任务。

**Organization**: Tasks are grouped by user story. US1（属性解析）和 US2（结构树）均为 P1 但功能独立，可并行；US3（预设规则）为 P2，依赖 Foundational 阶段完成。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Project Structure)

**Purpose**: 创建 checker/ 子包骨架，保持对外接口不变

- [x] T001 删除旧 `backend/scripts/checker.py`，创建 `backend/scripts/checker/` 子包目录，包含 `__init__.py`（re-export DocxChecker, CheckResult, fonts_match, Color, FONT_ALIASES, NSMAP, W） — `backend/scripts/checker/__init__.py`
- [x] T002 将 checker.py 中的公共定义和核心类骨架迁移到 base.py，包含：`NSMAP`, `W`, `FONT_ALIASES`, `Color`, `CheckResult`, `DocxChecker.__init__`, `add_result`, `run_all_checks`, `print_report`, `main` + 保留的检查方法 (`check_page_setup`, `check_header_footer`, `check_toc`, `_is_cover_page_paragraph`, `_get_para_outline_level`) — `backend/scripts/checker/base.py`

**Checkpoint**: `from scripts.checker import DocxChecker` 导入正常；checker_service.py、fixer_service.py 无需修改导入路径

---

## Phase 2: Foundational (checker.py 拆分迁移)

**Purpose**: 将现有 checker.py 按领域拆分到各子模块，确保所有现有测试通过

**⚠️ CRITICAL**: 此阶段完成前不能开始新增功能（US1/US2/US3），必须先保证拆分后所有现有功能和测试不回归

- [x] T003 [P] 将样式相关方法迁移到 style_checker.py：`_get_style_xml_info`, `_get_parent_style`, `check_style_definitions`, `check_paragraph_formatting`, `check_font_consistency`, `check_template_instructions`, `check_figure_table_captions` — `backend/scripts/checker/style_checker.py`
- [x] T004 [P] 将标题相关方法迁移到 heading_validator.py：`check_heading_styles`, `check_document_structure` — `backend/scripts/checker/heading_validator.py`
- [x] T005 [P] 将编号相关方法迁移到 numbering_checker.py：`check_heading_numbering`, `check_heading_lvl_text`, `check_heading_numid_override`, `check_shared_abstract_num`, `check_heading_style_and_manual_numbering`, `check_heading_numbering_indent`, `_get_numbering_part`, `_get_heading_abstract_num_id` — `backend/scripts/checker/numbering_checker.py`
- [x] T006 更新 base.py 中的 `run_all_checks()` 方法，改为调用各子模块的方法（import style_checker、heading_validator、numbering_checker），确保检查执行顺序不变 — `backend/scripts/checker/base.py`
- [x] T007 运行全量后端测试验证拆分未引入回归 — `cd backend && python -m pytest tests/ -v`

**Checkpoint**: 所有现有测试通过；`python backend/scripts/checker/base.py test.docx --rules backend/rules/hit_midterm_report.yaml` CLI 正常工作

---

## Phase 3: User Story 1 — 属性解析增强 (Priority: P1) 🎯 MVP

**Goal**: 实现完整的 OOXML 属性解析优先级链（Run 直接格式 → 段落样式 → basedOn 链 → docDefaults → 内置默认），解决误报/漏报问题，并在检查消息中融入属性来源标注

**Independent Test**: 上传包含"Run 直接格式覆盖字号"的文档，检查引擎应报告 FAIL 并标注"Run 直接格式覆盖"；上传样式正确且无直接格式覆盖的文档，应报告 PASS

### Tests for User Story 1

- [x] T008 [US1] 创建属性解析链测试 — `backend/tests/test_checker_inheritance.py`
  - 测试 Run 直接格式 > 样式定义的优先级
  - 测试 basedOn 多层继承（3+ 层）正确回退
  - 测试 docDefaults 作为最终回退值
  - 测试循环引用检测与终止（A→B→A 报告 WARN）
  - 测试最大深度限制（超过 10 层终止）
  - 测试 `format_source_message()` 生成正确的来源标注文案
  - 测试 `resolve_run_properties()` 返回的 ResolvedProperty 包含正确的 source 枚举值

### Implementation for User Story 1

- [x] T009 [US1] 创建 PropertyResolver 类，实现完整属性解析优先级链 — `backend/scripts/checker/property_resolver.py`
  - 定义 `PropertySource` 枚举（RUN_DIRECT / PARAGRAPH_STYLE / BASED_ON / DOC_DEFAULTS / BUILTIN）
  - 定义 `ResolvedProperty` 数据类（value, source, source_style）
  - 实现 `__init__(doc)`: 解析 docDefaults (w:rPrDefault, w:pPrDefault)
  - 实现 `resolve_run_properties(run, paragraph)`: 5 层优先级链解析
  - 实现 `resolve_style_properties(style)`: 带缓存的样式链解析
  - 实现 `format_source_message()`: 生成融入来源标注的检查消息文案
  - 实现循环引用检测（visited_set）和深度限制（MAX_BASED_ON_DEPTH=10）
- [x] T010 [US1] 修改 style_checker.py 中的 `check_paragraph_formatting()` 方法，集成 PropertyResolver — `backend/scripts/checker/style_checker.py`
  - 在 DocxChecker.__init__ 中初始化 PropertyResolver 实例
  - `check_paragraph_formatting()` 使用 `resolver.resolve_run_properties()` 替代直接读取 `run.font.*`
  - 使用 `resolver.format_source_message()` 生成包含来源标注的 message 文案
  - 当 Run 直接格式覆盖导致不一致时，标记 fixable=True
- [x] T011 [US1] 运行后端测试验证属性解析增强 — `cd backend && python -m pytest tests/test_checker_inheritance.py tests/ -v`

**Checkpoint**: 属性解析链功能完整；已有测试无回归；新增 test_checker_inheritance.py 全部通过

---

## Phase 4: User Story 2 — 文档结构树验证 (Priority: P1)

**Goal**: 新增标题层级连续性验证和深度限制检查，检出标题层级跳跃等结构问题

**Independent Test**: 上传 H1→H2→H3 文档应通过；上传 H1→H3（跳过 H2）文档应报告 FAIL

### Tests for User Story 2

- [x] T012 [US2] 创建文档结构树验证测试 — `backend/tests/test_checker_structure.py`
  - 测试正常层级（H1→H2→H3→H2→H1→H2）通过
  - 测试层级跳跃（H1→H3）报告 FAIL
  - 测试超过 max_heading_depth 报告 WARN
  - 测试非章节标题（如"非章节标题-摘要结论参考文献"样式）排除
  - 测试空文档（无标题）报告 PASS
  - 测试只有 H1 无子标题不报错

### Implementation for User Story 2

- [x] T013 [US2] 在 heading_validator.py 中实现 `check_heading_hierarchy()` 方法 — `backend/scripts/checker/heading_validator.py`
  - 收集所有标题段落为 HeadingInfo 列表（para_index, outline_level, text, is_chapter, style_name）
  - 通过 `non_chapter_styles` 配置排除非章节标题
  - 线性扫描验证层级连续性：level N 之后不应出现 level > N+1
  - 验证 max_heading_depth 深度限制
  - 检查结果包含具体标题文本和段落位置
- [x] T014 [US2] 在 base.py 的 `run_all_checks()` 中注册 `check_heading_hierarchy` 调用 — `backend/scripts/checker/base.py`
- [x] T015 [US2] 运行后端测试验证结构树验证 — `cd backend && python -m pytest tests/test_checker_structure.py tests/ -v`

**Checkpoint**: 标题层级验证功能完整；已有测试无回归；新增 test_checker_structure.py 全部通过

---

## Phase 5: User Story 3 — 场景化规则预设 (Priority: P2)

**Goal**: 新增"通用学术论文"和"国标公文"2 个预设规则，前端下拉展示 `is_preset` 标签

**Independent Test**: 前端下拉列表显示 4 个规则（含 2 个新预设带"预设"标签）；选择学术论文预设上传文档后检查报告包含学术论文特有检查项

### Tests for User Story 3

- [x] T016 [P] [US3] 创建预设规则加载与格式校验测试 — `backend/tests/test_rule_presets.py`
  - 测试所有预设 YAML 语法正确可加载
  - 测试必要字段完整性（meta.name, meta.is_preset, page_setup, styles）
  - 测试 rules_service 正确识别 is_preset 标记
  - 测试 RuleInfo 响应包含 is_preset 字段

### Implementation for User Story 3

- [x] T017 [P] [US3] 创建通用学术论文预设规则文件 — `backend/rules/academic_paper.yaml`
  - meta: name="通用学术论文", is_preset=true, description
  - page_setup: A4，上下 2.54cm，左右 3.17cm
  - styles: 正文宋体小四 / TNR 12pt，标题黑体分级字号
  - structure: 必须包含摘要、目录、正文、参考文献
  - special_checks: 开启字体一致性检查
- [x] T018 [P] [US3] 创建国标公文预设规则文件 — `backend/rules/gov_document.yaml`
  - meta: name="国标公文 (GB/T 9704)", is_preset=true, description
  - page_setup: A4，上 3.7cm，下 3.5cm，左右 2.8cm
  - styles: 正文仿宋三号，标题方正小标宋/黑体/楷体分级
  - structure: 主送机关、正文、附件、发文机关
- [x] T019 [US3] 修改 RuleInfo schema 新增 `is_preset: bool = False` 字段 — `backend/api/schemas.py`
- [x] T020 [US3] 修改 rules_service.py 读取 `meta.is_preset` 填充到 RuleInfo — `backend/services/rules_service.py`
- [x] T021 [US3] 修改 UploadPanel.tsx 规则下拉，对 `is_preset=true` 的规则项添加"预设"小标签 — `frontend/src/components/UploadPanel.tsx`
- [x] T022 [US3] 修改 UploadPanel.test.tsx 新增预设规则标签展示测试 — `frontend/src/__tests__/components/UploadPanel.test.tsx`
- [x] T023 [US3] 运行全量测试验证预设规则功能 — `cd backend && python -m pytest tests/ -v && cd ../frontend && npx vitest run`

**Checkpoint**: 4 个规则在前端下拉正确展示（含"预设"标签）；使用学术论文预设检查文档正常；全量测试通过

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 最终验证、回归测试和清理

- [x] T024 运行完整后端测试套件确认无回归 — `cd backend && python -m pytest tests/ -v`
- [x] T025 运行完整前端测试套件确认无回归 — `cd frontend && npx vitest run`
- [x] T026 按 quickstart.md 执行端到端验证（属性解析链 / 结构树验证 / 预设规则）
- [x] T027 CLI 验证：使用新预设规则检查 + 使用现有规则检查验证向后兼容 — `python backend/scripts/checker/base.py test.docx --rules backend/rules/academic_paper.yaml`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖 — 立即开始
- **Phase 2 (Foundational 拆分)**: 依赖 Phase 1（子包骨架已创建）— **BLOCKS 所有 User Story**
- **Phase 3 (US1 属性解析)**: 依赖 Phase 2（拆分完成后才能在子模块中新增功能）
- **Phase 4 (US2 结构树)**: 依赖 Phase 2（拆分完成后才能新增 heading_validator 功能）
- **Phase 5 (US3 预设规则)**: 依赖 Phase 2（拆分完成）；不依赖 US1/US2
- **Phase 6 (Polish)**: 依赖全部 Phase 完成

### User Story Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational: checker.py → checker/ 子包拆分)
    ↓
    ├──▶ Phase 3 (US1: 属性解析增强) ←── 独立
    ├──▶ Phase 4 (US2: 结构树验证)   ←── 独立
    └──▶ Phase 5 (US3: 预设规则)     ←── 独立
    ↓
Phase 6 (Polish)
```

**US1、US2、US3 三者完全独立**，Phase 2 完成后可并行开展。

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- 核心模块 → 集成到 checker → 验证测试
- Story complete before moving to next priority

### ⚠️ 同文件冲突注意

- **base.py**: T002（创建骨架）→ T006（更新 run_all_checks）→ T010（初始化 PropertyResolver）→ T014（注册 heading_hierarchy），必须按顺序执行
- **style_checker.py**: T003（迁移方法）→ T010（增强 check_paragraph_formatting），必须按顺序执行
- **heading_validator.py**: T004（迁移方法）→ T013（新增 check_heading_hierarchy），必须按顺序执行

### Parallel Opportunities

```bash
# Phase 2: 三个子模块文件并行迁移
Task: T003 (style_checker.py)
Task: T004 (heading_validator.py)
Task: T005 (numbering_checker.py)

# Phase 3+4+5: 三个 User Story 可并行（Phase 2 完成后）
Task: US1 (T008→T011) — 属性解析
Task: US2 (T012→T015) — 结构树
Task: US3 (T016→T023) — 预设规则

# Phase 5 内部: YAML 文件和 schema 并行
Task: T016 (test_rule_presets.py)
Task: T017 (academic_paper.yaml)
Task: T018 (gov_document.yaml)
Task: T019 (schemas.py)
```

---

## Parallel Example: Phase 2 (子模块迁移)

```bash
# 三个子模块文件可完全并行迁移（操作不同文件）
Task: T003 — style_checker.py (样式相关方法)
Task: T004 — heading_validator.py (标题相关方法)
Task: T005 — numbering_checker.py (编号相关方法)

# 迁移完成后，串行更新 base.py
Task: T006 — 更新 run_all_checks() 调用各子模块
Task: T007 — 全量测试验证
```

## Parallel Example: User Story 3 (预设规则)

```bash
# 四个文件可并行创建/修改
Task: T016 — test_rule_presets.py (测试先行)
Task: T017 — academic_paper.yaml
Task: T018 — gov_document.yaml
Task: T019 — schemas.py (新增 is_preset 字段)

# 串行集成
Task: T020 — rules_service.py (读取 is_preset)
Task: T021 — UploadPanel.tsx (前端标签)
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + 3: Setup + 拆分 + 属性解析)

1. Phase 1: 创建 checker/ 子包骨架
2. Phase 2: 拆分 checker.py 到各子模块 → 全量测试通过
3. Phase 3: 实现 PropertyResolver + 增强 check_paragraph_formatting
4. **STOP and VALIDATE**: 属性解析链功能完整，检出率提升验证

### Incremental Delivery

1. Phase 1+2 → checker/ 子包拆分完成（纯重构，功能不变）
2. +Phase 3 → 属性解析增强上线（MVP！核心能力提升）
3. +Phase 4 → 结构树验证上线（新增检查维度）
4. +Phase 5 → 预设规则上线（降低使用门槛）
5. Phase 6 → 最终验证

### Total Tasks: 27

| 阶段 | 任务数 | 说明 |
|------|--------|------|
| Phase 1 Setup | 2 | 子包骨架 |
| Phase 2 Foundational | 5 | checker.py 拆分迁移 |
| Phase 3 US1 (P1) | 4 | 属性解析增强（1 test + 3 impl） |
| Phase 4 US2 (P1) | 4 | 结构树验证（1 test + 3 impl） |
| Phase 5 US3 (P2) | 8 | 预设规则（1 test + 7 impl） |
| Phase 6 Polish | 4 | 验证与清理 |

---

## Notes

- [P] tasks = different files, no dependencies
- Phase 2（checker.py 拆分）是最关键的前置阶段，MUST 确保拆分后所有现有功能不回归
- base.py 被多个阶段修改，必须严格按 T002 → T006 → T010 → T014 顺序执行
- 预设规则内容（学术论文/国标公文）参考国家标准，需确保规则合理性
- Commit after each task or logical group
- Run `python -m pytest tests/ -v` after each phase checkpoint
