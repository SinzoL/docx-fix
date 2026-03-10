# Feature Specification: 检查引擎增强 — 样式继承链、结构树验证、场景化预设

**Feature Branch**: `005-checker-enhance`  
**Created**: 2026-03-10  
**Status**: Draft  
**Input**: 基于开源项目（python-docx / unstructured / ragflow / mammoth / docling）分析成果，增强检查引擎核心能力

## 背景与动机

当前 docx-fix 检查引擎（`checker.py`，1323 行）已具备页面设置、样式定义、段落格式、标题编号、文档结构等 16 项检查能力。但在以下方面存在不足：

### 问题 1：样式属性追溯不完整 — 误报与漏报并存

当前 `_get_style_xml_info()` 方法虽已实现 `basedOn` 链的递归追溯，但 **段落级直接格式（Direct Formatting）** 未参与检查逻辑。python-docx 的三态属性设计（`True/False/None`）中，`None` 表示"继承自样式链"，当前检查引擎未区分"显式设置"与"继承值"，导致：

- **误报**：段落 Run 没有直接设置字体（继承样式定义），但检查引擎读取到 `None` 后跳过检查，遗漏了本应由样式提供的属性
- **漏报**：段落 Run 有直接格式覆盖（如用户手动改了字号），但检查引擎只看样式定义级别的属性，没有读取 Run 级别的直接格式

**借鉴来源**：python-docx 的三态属性模型 + 样式继承链设计

### 问题 2：文档结构验证仅检查"存在性"，不验证"合理性"

当前 `check_document_structure()` 仅检查必要章节是否存在（模式匹配一级标题文本），但不验证：

- **标题层级连续性**：H3 不应直接出现在 H1 下面（跳过了 H2）
- **标题顺序合理性**：章节编号应递增（如 1 → 2 → 3，而非 1 → 3 → 2）
- **嵌套深度**：标题层级不应超过规则定义的最大深度

**借鉴来源**：unstructured 的元素层级计算栈算法 + 元素类型体系

### 问题 3：规则文件耦合特定学校模板，缺乏通用预设体系

当前仅有两个规则文件：`default.yaml`（极简通用）和 `hit_midterm_report.yaml`（哈工大中期报告专用）。用户如果要检查其他类型的文档（如期刊论文、企业公文），需要自己编写完整的 YAML 规则文件，门槛很高。

**借鉴来源**：ragflow 的场景化分块策略 + docling 的预设配置系统

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 属性解析增强：正确追溯 Run 的真实生效值 (Priority: P1)

用户上传一份 Word 文档进行格式检查。文档中某些段落的 Run 没有直接设置字体属性（依赖样式继承），另一些 Run 有直接格式覆盖（用户手动修改过字号/字体）。检查引擎应正确解析每个 Run 的"真实生效值"——按照 OOXML 的优先级链：Run 直接格式 → 段落样式 Run 属性 → basedOn 链继承 → 文档默认样式 → Word 内置默认值。

增强后，检查引擎能更精准地报告格式问题：直接格式覆盖的属性如果与规则不符，报告为 FAIL 并标记为 fixable（因为可以清除直接格式使其回退到样式值）；样式级别的不一致则按现有逻辑报告。

**Why this priority**: 属性解析是检查引擎的根基。不正确的属性读取会导致所有后续检查项的可信度下降。

**Independent Test**: 上传一个已知包含"样式定义正确但 Run 直接格式覆盖了字号"的测试文档，检查引擎应报告 FAIL 并标记可修复。上传一个样式完全正确且无直接格式覆盖的文档，应报告全部 PASS。

**Acceptance Scenarios**:

1. **Given** 某段落 Run 未设置字体（继承自样式"论文正文-首行缩进" → Normal → 宋体）, **When** 检查引擎解析该 Run 的中文字体, **Then** 正确获取到"宋体"（沿 basedOn 链追溯），检查通过
2. **Given** 某段落 Run 直接设置了字号为 14pt 但规则要求 12pt, **When** 检查引擎执行格式检查, **Then** 报告 FAIL，消息说明"Run 直接格式覆盖：当前 14pt，要求 12pt"，标记 fixable
3. **Given** 某样式的 basedOn 链为 "论文正文-首行缩进" → "Normal", **When** "论文正文-首行缩进"未设 font_eastAsia 但 "Normal" 定义了 font_eastAsia=宋体, **Then** 检查引擎正确继承到"宋体"
4. **Given** 文档默认样式（docDefaults）定义了 fontSize=24 half-pt(12pt), **When** 某 Run 和样式链均未设字号, **Then** 检查引擎从 docDefaults 获取默认字号进行比对

---

### User Story 2 — 文档结构树验证：标题层级连续性与顺序检查 (Priority: P1)

用户上传文档后，检查引擎不仅验证必要章节是否存在，还构建一棵文档结构树，验证标题的层级关系和编号顺序是否合理。

检查引擎扫描所有标题段落（大纲级别 < 9），按出现顺序构建层级树。验证规则：
- 标题层级不能跳跃（如从 level 0 直接到 level 2，中间缺少 level 1）
- 同级标题在同一父节点下应按顺序排列
- 标题最大深度不超过规则定义的 `max_heading_depth`（默认 3）

结构问题报告为 WARN 级别（因为可能是文档有意设计），但明显的层级跳跃报告为 FAIL。

**Why this priority**: 文档结构是论文的骨架，结构错误（如标题层级跳跃）在学术论文中是严重的格式问题，且不易被用户发现。

**Independent Test**: 上传一个标题层级正确（1 → 1.1 → 1.1.1 → 1.2 → 2 → 2.1）的文档应通过；上传一个存在层级跳跃（1 → 1.1.1，缺少 1.1）的文档应报告 FAIL。

**Acceptance Scenarios**:

1. **Given** 文档标题层级为 H1 → H2 → H3 → H2 → H1 → H2, **When** 结构树验证执行, **Then** 报告 PASS（层级连续，无跳跃）
2. **Given** 文档中 H1 后直接出现 H3（跳过了 H2）, **When** 结构树验证执行, **Then** 报告 FAIL，消息说明"标题层级跳跃：'xxx'(H3) 出现在 H1 之后，缺少 H2 级别的标题"
3. **Given** 文档标题深度到了 level 4 但规则 `max_heading_depth` 设为 3, **When** 结构树验证执行, **Then** 报告 WARN，消息说明"标题层级超过最大深度 3"
4. **Given** 文档中摘要、参考文献等非章节标题使用"非章节标题"样式, **When** 结构树验证执行, **Then** 这些标题不参与连续性检查（它们不属于编号章节体系）

---

### User Story 3 — 场景化规则预设：开箱即用的多场景支持 (Priority: P2)

用户在 Web 界面的上传面板选择"规则集"时，除了现有的"哈工大中期报告"和"通用默认"外，还能看到更多内置预设规则：
- **通用学术论文**：适用于一般性学术论文，覆盖中文学术论文的常见格式要求
- **国标公文 GB/T 9704**：适用于党政机关公文格式

预设规则以 YAML 文件形式存储在 `backend/rules/` 目录下，遵循现有规则结构。用户在前端下拉选择时，后端自动加载对应的规则文件。

**Why this priority**: 预设规则降低使用门槛，用户无需手动编写 YAML 即可检查常见文档类型。但不影响核心检查能力。

**Independent Test**: 在前端上传面板选择"通用学术论文"预设后上传文档，确认检查报告使用了学术论文规则（如检查摘要、参考文献章节）。

**Acceptance Scenarios**:

1. **Given** 后端 `rules/` 目录下有 `academic_paper.yaml` 文件, **When** 用户在前端选择"通用学术论文"预设, **Then** 后端使用 `academic_paper.yaml` 执行检查
2. **Given** "通用学术论文"预设规则, **When** 上传一份标准学术论文, **Then** 检查报告包含摘要、正文、参考文献等学术论文特有的结构检查项
3. **Given** "国标公文"预设规则, **When** 上传一份公文文档, **Then** 检查报告验证公文特有的格式要求（如标题字体、正文仿宋、页边距等）
4. **Given** 用户已在本地存储了自定义规则, **When** 下拉选择切换到预设规则, **Then** 预设规则与自定义规则正确区分，互不影响

---

### Edge Cases

- 样式 basedOn 链存在循环引用（A → B → A）时，应检测并终止递归，报告 WARN
- 文档没有任何标题段落时，结构树验证应跳过并报告 PASS（"无标题段落"）
- 文档只有 H1 没有子标题时，不应报告层级跳跃问题
- 预设 YAML 文件格式损坏时，应返回清晰的错误信息而非 500 错误
- 用户自定义规则与预设规则同名时，自定义规则优先
- 样式链追溯深度超过 10 层时应终止（防止异常文档导致无限递归）

## Requirements *(mandatory)*

### Functional Requirements

#### 样式继承链与属性解析增强

- **FR-001**: 检查引擎 MUST 实现完整的属性解析优先级链：Run 直接格式 → 段落样式 rPr → basedOn 链 → docDefaults → Word 内置默认值
- **FR-002**: `_get_style_xml_info()` 方法 MUST 支持读取文档默认样式（`w:docDefaults/w:rPrDefault` 和 `w:pPrDefault`）作为最终回退
- **FR-003**: 段落格式检查 MUST 区分"Run 直接格式覆盖"和"样式继承值"，检查报告中明确标注来源
- **FR-004**: 当 Run 直接格式覆盖导致不一致时，MUST 标记为 fixable（修复方式为清除直接格式）
- **FR-005**: 样式 basedOn 链追溯 MUST 设置最大深度限制（默认 10 层），超过时终止并报告 WARN
- **FR-006**: basedOn 链 MUST 检测循环引用，发现循环时终止并报告 WARN

#### 文档结构树验证

- **FR-007**: 检查引擎 MUST 新增 `check_heading_hierarchy()` 方法，构建文档标题的层级树
- **FR-008**: MUST 检查标题层级连续性：level N 标题之后，下一个标题的 level 不应超过 N+1（层级跳跃检查）
- **FR-009**: MUST 支持通过规则配置 `structure.max_heading_depth` 指定最大标题深度（默认 3），超过时报告 WARN
- **FR-010**: 层级检查 MUST 排除"非章节标题"样式的段落（如摘要、参考文献等使用 `非章节标题-摘要结论参考文献` 样式的 H1）
- **FR-011**: 检查结果 MUST 包含具体的标题文本和段落位置，便于用户定位问题

#### 场景化规则预设

- **FR-012**: MUST 新增至少 2 个预设规则文件：`academic_paper.yaml`（通用学术论文）、`gov_document.yaml`（国标公文 GB/T 9704）
- **FR-013**: 每个预设规则文件 MUST 遵循现有 YAML 规则结构（meta / page_setup / styles / structure / numbering / special_checks）
- **FR-014**: 后端 rules_service MUST 在列出可用规则时包含预设规则，并标注 `is_preset: true` 区分预设与用户自定义规则
- **FR-015**: 前端上传面板的规则下拉 MUST 展示预设规则组和用户自定义规则组，预设规则不可编辑/删除
- **FR-016**: 预设规则 MUST 包含 `meta.description` 字段，前端下拉列表 SHOULD 展示该描述作为提示

### Key Entities

- **属性解析链（Property Resolution Chain）**: Run 直接格式 → 段落样式 → basedOn 链 → docDefaults → 内置默认，每层按 OOXML 优先级顺序查找
- **文档结构树（Document Heading Tree）**: 以标题段落为节点、层级关系为边的树结构，用于验证文档骨架合理性
- **规则预设（Rule Preset）**: 预装在 `backend/rules/` 目录下的 YAML 规则文件，具有 `meta.is_preset: true` 标记，不可被用户修改/删除

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 对于包含直接格式覆盖的测试文档，检查引擎检出率从当前的 ~60% 提升到 95% 以上（通过对比新旧引擎的检查结果数量验证）
- **SC-002**: 标题层级跳跃问题（如 H1→H3）100% 被检出并报告
- **SC-003**: 用户可从前端下拉列表直接选择 4 种以上规则预设（含现有 2 个 + 新增 2 个），无需手动编写 YAML
- **SC-004**: 所有新增检查项在标准测试文档上的执行时间 < 500ms（不包含文档加载时间）
- **SC-005**: 现有测试套件全部通过，无回归

## 文件结构（新增/修改）

```
backend/
  ├── scripts/
  │   └── checker.py                    [修改] 新增属性解析链 + 结构树验证 + 增强现有检查
  ├── rules/
  │   ├── default.yaml                  [保留] 通用默认
  │   ├── hit_midterm_report.yaml       [保留] 哈工大中期报告
  │   ├── academic_paper.yaml           [新增] 通用学术论文预设
  │   └── gov_document.yaml             [新增] 国标公文预设
  ├── services/
  │   └── rules_service.py              [修改] 列出规则时标注 is_preset
  └── tests/
      ├── test_checker_inheritance.py   [新增] 样式继承链解析测试
      ├── test_checker_structure.py     [新增] 文档结构树验证测试
      └── test_rule_presets.py          [新增] 预设规则加载与格式校验测试

frontend/src/
  └── components/
      └── UploadPanel.tsx               [修改] 规则下拉列表区分预设/自定义规则
```

## Testing Strategy *(mandatory)*

### 后端单元测试 (pytest)

- `test_checker_inheritance.py` — 属性解析链测试：
  - Run 直接格式 > 样式定义的优先级
  - basedOn 多层继承（3+ 层）正确回退
  - docDefaults 作为最终回退值
  - 循环引用检测与终止
  - 最大深度限制

- `test_checker_structure.py` — 文档结构树验证测试：
  - 正常层级（H1→H2→H3）通过
  - 层级跳跃（H1→H3）报告 FAIL
  - 超过最大深度报告 WARN
  - 非章节标题排除
  - 空文档（无标题）通过
  - 只有 H1 无子标题通过

- `test_rule_presets.py` — 预设规则测试：
  - 所有预设 YAML 语法正确可加载
  - 必要字段（meta.name / page_setup / styles）完整性
  - 预设标记 `is_preset` 正确识别

### 前端测试 (Vitest)

- `UploadPanel.test.tsx` — [修改] 新增预设/自定义规则分组展示测试

### 回归测试

每完成一个 Task 后，MUST 运行完整的测试套件确保不引入回归问题。

## 约束与风险

- **Constitution 约束**：核心引擎仅依赖 `python-docx`、`lxml`、`pyyaml`，新增功能不得引入额外依赖
- **向后兼容**：现有 `hit_midterm_report.yaml` 和 `default.yaml` 的检查结果不得因引擎增强而改变语义（可增加新检查项，但不得改变现有检查项的 PASS/FAIL 判定）
- **性能风险**：basedOn 链递归追溯和结构树构建新增了计算量，MUST 确保对大文档（500+ 段落）的总检查时间仍在可接受范围内（< 5s）
- **规则质量**：新增预设规则 MUST 经过至少 3 份真实文档验证，避免规则过严或过松导致大量误报/漏报
- **checker.py 复杂度**：当前文件已 1323 行，新增功能应尽量模块化（可考虑提取 helper 函数），避免文件过度膨胀
