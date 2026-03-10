# Feature Specification: 通用文本排版习惯检查 — 标点·空格·全半角 + LLM 争议审查

**Feature Branch**: `006-text-conventions`  
**Created**: 2026-03-10  
**Status**: Draft  
**Input**: 用户希望系统除了"格式属性检查"外，还能检测文本内容层面的通用排版问题（标点不对称、多余空格、中英文间距、全半角混用等），并引入 LLM 对高误判争议项进行二次审查。

## 背景与动机

### 现有系统的能力边界

当前 docx-fix 的检查引擎（`checker.py`）是一个 **格式属性检查器**——它对比 docx XML 中的样式属性值（字号、字体、行距、缩进、页边距等）与 YAML 规则中的期望值，做精确的数值比较。这套系统在"格式层"工作得很好，但**完全不读取段落的文本内容**。

然而在实际的学术论文/公文排版中，有大量的 **文本内容层排版规范** 是普遍认可的：

- 中文句子中出现不配对的括号 `（内容` 是排版错误
- 连续的标点 `。。` 是输入错误
- 中文之间出现多余空格 `你 好` 是排版问题
- 全角半角标点混用 `你好,世界` 在中文文档中不规范

这些问题目前被完全忽略了。

### 与现有框架的核心冲突

| 维度 | 现有格式检查 | 新需求：文本排版习惯检查 |
|------|------------|----------------------|
| **检查对象** | XML 属性（`w:sz`, `w:jc`, `w:rFonts`...） | Run/段落的 **文本内容**（`.text`） |
| **规则来源** | 模板提取的确定值（YAML） | **无模板对应**，是跨模板的通用规范 |
| **期望值** | 精确数值（如 `font_size_pt: 12`） | **模式匹配 / 上下文判断**（正则、字符分析） |
| **修复方式** | 修改 XML 属性 | 修改 Run 的 **文本字符串** |
| **确定性** | 高（数值比较） | **低→高 分层**（部分确定，部分需 LLM 辅助） |
| **YAML 结构** | `styles.Normal.character.font_size_pt` | **无对应位置**，需新增 `text_conventions` 顶层 section |

### 解决策略概述

1. **YAML 新增 `text_conventions` section** — 与模板提取无关的通用规则，内置默认开启，用户可手动关闭
2. **Checker 子包新增 `text_convention_checker.py` 模块** — 在 `scripts/checker/` 子包内新增模块，遍历段落文本内容执行正则/字符级检查，在 `run_all_checks()` 中注册（与 `style_checker.py`、`heading_validator.py` 架构一致）
3. **Fixer 新增 `TextConventionFixer` 独立模块** — 修改文本内容的修复逻辑，与格式修复分离
4. **前端结果展示增加分组层级** — "格式检查"与"通用排版习惯"分开展示
5. **LLM 争议审查管道（异步两步）** — 前端先渲染确定性检查结果，同时自动发起 AI 审查请求，审查结果返回后动态更新 UI 标签

### Constitution 影响

> **Principle II（只改格式，不动内容）的 Justified Violation**：
> 
> 文本排版习惯的修复（删多余空格、替换半角标点为全角）本质是"修改文本内容"。这违反了 Principle II 的字面表述。但从用户意图看，修复 `你好,世界` → `你好，世界` 不是"修改论文内容"，而是"修正排版笔误"。
>
> **缓解措施**：
> - 文本修复必须独立于格式修复，用户可单独开关
> - 默认行为是 **WARN（仅警告）不自动修复**，用户需显式确认
> - LLM 争议审查为高误判项提供决策支持
> - 修复前依然自动备份

> **Principle I（规则驱动）的合规性**：
>
> 默认 `text_conventions` 配置 **写入 `default.yaml` 和所有预置 YAML 规则文件**，代码中仅作为 fallback（类似 Python 函数的默认参数）。这样 YAML 中始终有对应的可见配置，用户可以直接在 YAML 中查看和修改每条规则的开关状态，不存在"仅在代码中的隐性规则"。

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — 确定性文本检查：标点不对称、连续标点、多余空格 (Priority: P1)

用户上传一份 Word 文档进行检查。除了现有的格式属性检查外，系统还自动扫描文档的文本内容，检测以下 **高确定性** 的排版问题：

- **括号不对称**：`（内容` 缺右括号，或 `内容）` 缺左括号；支持中/英文圆括号、方括号、花括号。**检查范围为段落级**，但增加"相邻段落宽松匹配"规则：如果当前段落的未闭合括号在下一段开头 5 个字符内找到了对应的右括号，则不报告
- **引号不匹配**：`"内容` 缺右引号；支持中文引号 `""''` 和英文引号 `""`
- **连续标点**：`。。`、`，，`、`、、`、`；；`、`：：`、`..`（非省略号）等报告为连续标点。**不报告**：`！！`、`？？`（强调语气的合法用法）、`……`（两个 U+2026 即中文省略号）、单个 `…`（U+2026）、`...`（英文省略号上下文中的连续点号）
- **中文之间多余空格**：`你 好 世 界` → 中文字符之间不应有空格（排除中英文交界处）
- **连续多个空格**：文本中出现 2 个以上连续空格
- **行首/行尾空格**：段落文本以空格开头或结尾（排除首行缩进由 XML 属性控制的情况）
- **全角空格混入**：正文中出现全角空格 `　`（U+3000）

这些检查结果在报告中以独立的分组"通用排版习惯"展示，与格式检查结果分开。每条结果包含段落位置、来源区域（主体/表格/脚注）和问题上下文片段。

**Why this priority**: 这些规则确定性极高（近乎 0 误判），可以直接实现，无需 LLM 辅助。

**Independent Test**: 上传一个包含 `（你好`、`。。`、`你 好` 的测试文档，确认 3 类问题均被检出并归入"通用排版习惯"分组。

**Acceptance Scenarios**:

1. **Given** 段落文本中有 `（内容不完整`, **When** 文本检查执行, **Then** 报告 FAIL，category="通用·标点"，message 说明"括号不对称：第 X 段发现未闭合的中文左括号 '（'"，location 包含段落号、来源区域和上下文片段
2. **Given** 段落文本中有 `。。`, **When** 文本检查执行, **Then** 报告 FAIL，category="通用·标点"，message 说明"连续标点：'。。'"，标记 fixable=true（可自动删除重复标点）
3. **Given** 段落文本中有 `你 好 世 界`, **When** 文本检查执行, **Then** 报告 FAIL，category="通用·空格"，message 说明"中文之间多余空格"，标记 fixable=true
4. **Given** 段落文本中有 `使用 Python 进行开发`（中文和英文之间有空格）, **When** 文本检查执行, **Then** 不报告为"中文之间多余空格"（因为这是中英文交界，由 US2 的 LLM 审查处理）
5. **Given** 段落文本中有 `　`（全角空格）, **When** 文本检查执行, **Then** 报告 WARN，category="通用·空格"，标记 fixable=true
6. **Given** 段落首行缩进由 XML `w:ind` 属性控制, **When** 文本检查执行, **Then** 不报告行首空格问题
7. **Given** YAML 规则中 `text_conventions.bracket_mismatch.enabled: false`, **When** 文本检查执行, **Then** 跳过括号检查
8. **Given** 段落文本中有 `！！`, **When** 文本检查执行, **Then** 不报告为连续标点（强调语气合法用法）
9. **Given** 段落文本中有 `……`（两个 U+2026）, **When** 文本检查执行, **Then** 不报告为连续标点（中文省略号）
10. **Given** 当前段落以 `（说明` 结尾，下一段以 `的内容）` 开头, **When** 文本检查执行, **Then** 不报告当前段落的括号不对称（相邻段落宽松匹配规则生效）
11. **Given** 表格单元格中的文本包含 `。。`, **When** 文本检查执行, **Then** 同样检出连续标点问题，location 标注来源为"表格"
12. **Given** 脚注中的文本包含 `你 好`, **When** 文本检查执行, **Then** 同样检出中文间多余空格，location 标注来源为"脚注"

---

### User Story 2 — LLM 争议审查：中英文间距、全半角标点混用 (Priority: P1)

对于 **高误判风险** 的文本检查项，系统先用规则引擎检出候选问题，然后调用 LLM 进行二次审查。LLM 基于段落上下文判断该问题是"确认有误"、"合理使用（忽略）"还是"不确定"。

**异步两步流程（方案 B）**：
1. `POST /api/check` 返回确定性检查结果 + 争议项候选 + `text_convention_meta`（统计数据 + 争议项列表）
2. 前端先渲染确定性结果，同时自动发起 `POST /api/ai/review-conventions`（传入 `text_convention_meta` 中的数据）
3. AI 审查结果返回后，前端通过检查项 `id` 匹配合并，动态更新 AI 标签

需要 LLM 审查的规则：

- **中英文间距不一致**：同一文档中，有些地方 `使用Python` 无空格，有些地方 `使用 Python` 有空格 → LLM 判断文档的整体风格倾向，并标记不一致的位置
- **全半角标点混用**：中文段落中出现英文逗号 `,`、句号 `.`、冒号 `:`、分号 `;` → LLM 判断是否是代码引用/特殊标记/公式上下文
- **句末标点缺失**：段落末尾无句号 → LLM 判断该段落是正文（需要句号）还是标题/列表/公式（不需要句号）

LLM 审查结果以 **标签** 形式附加在检查项上（"AI：确认问题"/"AI：可忽略"/"AI：需人工确认"），用户可展开查看 LLM 的分析理由。

**Why this priority**: 这些规则如果不加 LLM 审查会产生大量误报，严重影响用户体验。LLM 审查是本功能的核心创新点。

**Independent Test**: 上传一个包含 `使用Python语言`（无空格）和 `使用 Java 语言`（有空格）的文档，系统应检出不一致，LLM 应判断出风格不统一并建议统一为某一种。

**Acceptance Scenarios**:

1. **Given** 文档中 70% 的中英文交界处有空格，30% 没有, **When** 文本检查+LLM 审查执行, **Then** LLM 判断"文档倾向于中英文之间加空格"，30% 无空格的位置被标记为 WARN + "AI：确认问题 — 建议统一添加空格"
2. **Given** 中文段落中有 `print("hello")`, **When** 全半角检查标记了英文括号和引号, **Then** LLM 审查判断"这是代码引用，标点使用正确"，标记为"AI：可忽略"
3. **Given** 段落 `1. 实验环境` 末尾无句号, **When** 句末标点检查标记了缺失, **Then** LLM 审查判断"这是列表/标题类段落，无需句号"，标记为"AI：可忽略"
4. **Given** 段落 `本实验使用了以下工具` 末尾无句号, **When** 句末标点检查标记了缺失, **Then** LLM 审查判断"这是正文段落，应以句号结尾"，标记为"AI：确认问题"
5. **Given** LLM API 不可用, **When** 系统尝试调用 LLM 审查, **Then** 争议项保留原始 WARN 状态，附加说明"AI 审查暂不可用，请人工判断"，不影响其他检查结果
6. **Given** YAML 规则中 `text_conventions.ai_review.enabled: false`, **When** 文本检查执行, **Then** 争议项直接以 WARN 输出，不调用 LLM
7. **Given** `POST /api/check` 返回, **When** 前端自动发起 `/api/ai/review-conventions`, **Then** 前端通过 `text_convention_meta` 中的 `disputed_items` 和 `document_stats` 发起请求，无需重新打开文档

---

### User Story 3 — 文本排版修复：确定性问题自动修复 (Priority: P2)

对于确定性高的文本排版问题（连续标点、中文之间多余空格、全角空格等），用户可以在修复预览中选择是否一并修复。文本修复与格式修复分开展示，用户可独立控制。

修复逻辑：
- **连续标点** `。。` → `。`（保留第一个）
- **中文之间多余空格** `你 好` → `你好`（删除中文字符间的空格）
- **连续多个空格** `word   word` → `word word`（压缩为单个空格）
- **全角空格** `　` → ` `（替换为半角空格）或直接删除（视上下文）
- **行首/行尾空格** → trim（排除 XML 缩进控制的段落）

LLM 标记为"AI：确认问题"的争议项也可纳入修复，但默认关闭，需用户手动勾选。

**文本修复集成到修复流程**：
- `FixRequest` 新增 `include_text_fix: bool = False`（默认不执行文本修复）
- 文本修复在**同一个 `_fixed` 文件**上叠加（先格式修复，再文本修复）
- `FixItemResult` 新增可选 `fix_layer: "format" | "text_convention"` 字段

**Why this priority**: 修复功能依赖 US1 和 US2 的检查结果，且涉及 Constitution Principle II 的 justified violation，需要谨慎实现。

**Independent Test**: 对包含 `。。` 和 `你 好` 的文档执行修复，确认修复后文本变为 `。` 和 `你好`，同时格式属性不受影响。

**Acceptance Scenarios**:

1. **Given** 检查报告包含 3 个确定性文本问题（连续标点×1、多余空格×2）, **When** 用户点击修复（`include_text_fix: true`）, **Then** 修复报告中的"文本修复"分组显示 3 项修复，`fix_layer: "text_convention"`，修复后重新检查确认问题消失
2. **Given** 检查报告包含 2 个 LLM 审查通过的争议项, **When** 用户在修复预览中勾选"包含 AI 建议修复项", **Then** 这 2 项也被纳入修复
3. **Given** 用户只想修复格式不想修复文本, **When** 用户点击修复（`include_text_fix: false`，默认值）, **Then** 文本修复不执行，格式修复正常进行，`fix_items` 中所有项的 `fix_layer` 为 `"format"`
4. **Given** 修复"中文之间多余空格"时, **When** 修复引擎处理文本, **Then** 仅删除两个中文字符之间的空格，不影响中英文交界处的空格
5. **Given** 段落包含多个 Run, **When** 修复文本内容, **Then** 修复操作正确处理 Run 边界（同一问题可能跨 Run）

---

### User Story 4 — 前端展示：分层结果展示 + AI 审查标签 (Priority: P1)

检查报告页面在现有格式检查结果基础上，新增"通用排版习惯"分组区域。两个区域视觉上明确区分：

- **格式检查**（已有）：规则驱动的属性比对结果，依赖 YAML 规则文件
- **通用排版习惯**（新增）：内置的文本内容检查结果，独立于 YAML 规则

"通用排版习惯"区域内部按子类分组：`通用·标点`、`通用·空格`、`通用·全半角`。

**前端异步流程**：
1. `POST /api/check` 返回后，前端立即渲染确定性结果（包括格式检查和文本习惯确定性项）
2. 如果存在 `text_convention_meta`（即有争议项），前端自动发起 `POST /api/ai/review-conventions`
3. AI 审查返回后，前端通过检查项 `id` 匹配，动态更新对应检查项的 `ai_review` 字段和 AI 标签

对于经过 LLM 审查的争议项，在检查结果行右侧显示 AI 审查标签（"AI 确认 ✓"/"AI 可忽略 ○"/"待确认 ?"），可展开查看 LLM 的分析理由。

**Why this priority**: 前端展示直接影响用户体验，需要让"格式检查"和"文本习惯检查"的边界清晰可感知。

**Independent Test**: 上传一个同时存在格式问题和文本习惯问题的文档，确认两类问题在报告中分组展示，AI 标签正确显示。

**Acceptance Scenarios**:

1. **Given** 检查报告包含格式问题 5 条 + 文本习惯问题 3 条, **When** 用户查看报告, **Then** 页面分为两个可视区域："格式检查（5）"和"通用排版习惯（3）"，每个区域可独立折叠
2. **Given** 文本习惯问题中有 2 条经过 LLM 审查, **When** 用户查看, **Then** 这 2 条结果右侧显示 AI 审查标签（如"AI 确认 ✓"绿色标签），点击可展开查看 LLM 分析理由
3. **Given** LLM 审查标记某项为"AI：可忽略", **When** 用户查看, **Then** 该项显示灰色"AI 可忽略 ○"标签，视觉上弱化，暗示用户可以忽略
4. **Given** 汇总统计区域, **When** 用户查看, **Then** 汇总中分别统计格式问题数和文本习惯问题数（如"格式: ✓5 ⚠2 ✗3 | 排版习惯: ⚠1 ✗2"）
5. **Given** AI 审查请求进行中, **When** 用户查看争议项, **Then** 争议项显示加载中标签（如 spinner + "AI 审查中..."），审查完成后替换为结果标签

---

### Edge Cases

- **段落级中文判定**：如果单个段落中 CJK 字符占比 < 10%，则该段落跳过中文相关检查（中文间空格、全半角混用等），而非使用全文档级判断。这样混合中英文的文档中，纯英文段落不会被误检
- **表格单元格遍历**：通过 `doc.tables` → 每个 cell 的 `paragraphs` 遍历表格中的文本
- **脚注/尾注遍历**：通过 `doc.part.footnotes_part`（如果存在）和 `doc.part.endnotes_part`（如果存在）遍历脚注和尾注中的文本
- **段落来源标记**：每个段落附加来源标记（`"body"` / `"table"` / `"footnote"` / `"endnote"`），用于在检查报告中精确定位
- **遍历顺序**：`iter_all_paragraphs(doc)` 生成器按以下顺序遍历：1) `doc.paragraphs`（主体）→ 2) `doc.tables` → `cell.paragraphs`（表格）→ 3) 脚注/尾注段落
- 页眉/页脚中的文本不检查（通常是固定模板内容）
- 代码样式的段落（如果样式名包含 "Code"/"代码"）应跳过全半角和空格检查
- 数学公式（OMath 元素）不参与文本检查
- 引号跨段落时（如多段引用），不应报告引号不匹配
- URL 和邮箱地址中的英文标点不应被报告为全半角问题
- 空段落（无文本内容）应跳过
- LLM 审查的批量请求应合并（多个争议项在一次 LLM 调用中审查，减少 API 调用次数和延迟）
- LLM 审查超时（>15s）时应降级为无 AI 标签的 WARN + `"uncertain"` + "AI 审查超时"

---

## Requirements *(mandatory)*

### Functional Requirements

#### YAML 规则扩展

- **FR-001**: YAML 规则结构 MUST 新增 `text_conventions` 顶层 section，与现有的 `page_setup`、`styles`、`structure` 等同级
- **FR-002**: `text_conventions` MUST 包含以下子规则组，每组都有 `enabled: bool` 开关：
  ```yaml
  text_conventions:
    bracket_mismatch:           # 括号不匹配检查
      enabled: true
    quote_mismatch:             # 引号不匹配检查
      enabled: true
    duplicate_punctuation:      # 连续标点检查
      enabled: true
    extra_spaces_in_chinese:    # 中文之间多余空格
      enabled: true
    consecutive_spaces:         # 连续多个空格
      enabled: true
    leading_trailing_spaces:    # 行首/行尾空格
      enabled: true
    fullwidth_space:            # 全角空格混入
      enabled: true
    cjk_english_spacing:        # 中英文间距一致性
      enabled: true
      require_space: null       # true=要求有空格, false=要求无空格, null=检查一致性
    fullwidth_halfwidth_punctuation:  # 全半角标点混用
      enabled: true
      context: "chinese"        # 以中文语境为基准
    sentence_ending_punctuation: # 句末标点检查
      enabled: true
    ai_review:                  # LLM 争议审查总开关
      enabled: true
  ```
- **FR-003**: 默认 `text_conventions` 配置 MUST 写入 `default.yaml` 和所有预置 YAML 规则文件中（全部开启），代码中仅作 fallback。这确保 YAML 中始终有对应的可见配置，符合 Constitution Principle I（规则驱动）
- **FR-004**: `text_conventions` section MUST 不依赖模板提取——`rule_extractor.py` 不提取此 section，它始终使用默认值或用户手动配置

#### 文本检查引擎

- **FR-005**: 文本检查 MUST 实现为 `scripts/checker/text_convention_checker.py` 模块（checker 子包内），在 `run_all_checks()` 中注册调用，与 `style_checker.py`、`heading_validator.py` 等架构一致，共享 `CheckResult`、`add_result()` 等基础设施
- **FR-006**: 文本检查 MUST 按段落遍历，每个段落将所有 Run 的文本拼接后检查（因为一个"词"可能跨多个 Run）
- **FR-006a**: 文本检查 MUST 通过 `iter_all_paragraphs(doc)` 生成器遍历所有段落，包括文档主体、表格单元格、脚注和尾注。每个段落附加来源标记（`"body"` / `"table"` / `"footnote"` / `"endnote"`）用于定位
- **FR-007**: 每条检查结果 MUST 包含精确的位置信息：段落号 + 来源区域 + 字符偏移范围 + 上下文片段（前后各 10 字符），格式为 `"段落N [来源], 第M字符: '...上下文...'"`
- **FR-008**: 检查结果的 `category` MUST 使用 `"通用·标点"`、`"通用·空格"`、`"通用·全半角"` 前缀，与格式检查的 category 区分
- **FR-009**: MUST 自动跳过以下段落的文本检查：
  - 页眉/页脚段落
  - 数学公式（OMath）元素
  - 样式名包含 "Code"、"代码" 的段落（仅跳过空格和全半角检查，标点检查保留）
  - 空段落
- **FR-009a**: MUST 按段落级判断是否跳过中文相关检查：如果单个段落中 CJK 字符（U+4E00-U+9FFF 等）占总字符数的比例 < 10%，则该段落跳过中文间空格、全半角混用等中文相关检查
- **FR-010**: 中文之间多余空格的检查 MUST 使用 Unicode 范围精确匹配中文字符（CJK Unified Ideographs: U+4E00-U+9FFF 等），不误判中英文交界处
- **FR-010a**: 连续标点检查规则细化：
  - 报告为连续标点：`。。`、`，，`、`、、`、`；；`、`：：`、`..`（非省略号上下文）
  - **不报告**：`！！`、`？？`（强调语气合法用法）、`……`（两个 U+2026 中文省略号）、单个 `…`（U+2026）、`...`（英文省略号上下文）
- **FR-010b**: 括号不对称检查采用**段落级**检查，但增加"相邻段落宽松匹配"：如果当前段落的未闭合括号在下一段开头 5 个字符内找到了对应的右括号，则不报告

#### LLM 争议审查

- **FR-011**: MUST 新增 `POST /api/ai/review-conventions` API 端点，接收争议项列表和段落上下文，返回 LLM 审查结果
- **FR-011a**: LLM 审查采用**异步两步流程**：`POST /api/check` 先返回确定性结果 + `text_convention_meta`，前端再调用 `/api/ai/review-conventions` 进行 AI 审查。两个请求独立，不阻塞
- **FR-012**: LLM 审查 MUST 将多个争议项合并为一次 API 调用（batch 审查），减少延迟和成本
- **FR-013**: LLM 审查结果 MUST 是三态：`"confirmed"`（确认问题）、`"ignored"`（可忽略）、`"uncertain"`（不确定）
- **FR-014**: 每个审查结果 MUST 包含 `reason` 字段（LLM 的分析理由），前端可展示
- **FR-015**: LLM 审查 MUST 有超时保护（默认 **15s**），超时时所有争议项降级为 `"uncertain"` + "AI 审查超时"
- **FR-016**: 当 LLM 不可用（API Key 未配置、网络错误等）时，争议项 MUST 以 WARN 状态直接输出，附加 "AI 审查不可用，请人工判断"
- **FR-017**: LLM 审查的 system prompt MUST 明确限定审查范围为"中文学术文档排版规范"，提供常见的合理例外场景（代码引用、公式、URL 等）

#### 文本修复引擎

- **FR-018**: MUST 新增独立的文本修复模块（`text_convention_fixer.py`），与格式修复器（`fixer.py`）分离
- **FR-019**: 文本修复 MUST 在 Run 级别操作（修改 `run.text`），保持 Run 的格式属性不变
- **FR-020**: 跨 Run 的文本问题（如空格在两个 Run 的交界处）MUST 能正确处理
- **FR-021**: 文本修复 MUST 默认关闭（opt-in），需要用户在前端显式开启才执行
- **FR-021a**: `FixRequest` MUST 新增 `include_text_fix: bool = False` 参数，默认不执行文本修复
- **FR-021b**: 文本修复在**同一个 `_fixed` 文件**上叠加（先格式修复，再文本修复）
- **FR-022**: LLM 标记为 `"ignored"` 的争议项 MUST NOT 被修复；标记为 `"confirmed"` 的争议项可修复但默认不修复，需用户手动勾选

#### 前端展示

- **FR-023**: 检查报告 MUST 将"通用排版习惯"检查结果与"格式检查"结果分为两个可视区域，各自可折叠
- **FR-024**: 汇总统计 MUST 分别统计格式检查和文本习惯检查的 PASS/WARN/FAIL 数量
- **FR-025**: LLM 审查标签 MUST 以视觉标签形式展示在检查结果行右侧：
  - `"confirmed"` → 绿色标签 "AI 确认 ✓"
  - `"ignored"` → 灰色标签 "AI 可忽略 ○"
  - `"uncertain"` → 黄色标签 "待确认 ?"
- **FR-026**: 点击 AI 审查标签 MUST 展开显示 LLM 的分析理由文本
- **FR-027**: 修复按钮区域 MUST 提供"文本修复"独立开关（默认关闭），与"格式修复"按钮分开
- **FR-027a**: AI 审查进行中时，争议项 MUST 显示加载中状态（spinner + "AI 审查中..."），审查完成后替换为结果标签

#### 检查结果数据结构扩展

- **FR-028**: `CheckItemResult` MUST 新增可选字段 `ai_review`，结构为：
  ```json
  {
    "verdict": "confirmed" | "ignored" | "uncertain",
    "reason": "LLM 分析理由文本"
  }
  ```
- **FR-029**: `CheckItemResult` MUST 新增可选字段 `check_layer`，值为 `"format"` 或 `"text_convention"`，用于前端分组。**所有现有格式检查项 MUST 统一标记 `check_layer: "format"`**，文本习惯检查项标记 `check_layer: "text_convention"`
- **FR-029a**: `CheckItemResult` MUST 新增可选字段 `id: string`（格式如 `"tc-001"`），仅文本习惯检查项有，用于前端在异步 AI 审查返回后通过 ID 匹配合并结果
- **FR-029b**: `CheckReport` MUST 新增可选字段 `text_convention_meta`，包含 `disputed_items` 列表和 `document_stats` 统计数据。后端检查时顺便统计这些数据并附加在响应中，前端在调用 AI 审查时直接回传，避免后端在 AI 审查时重新打开文档
- **FR-029c**: `FixItemResult` MUST 新增可选字段 `fix_layer`，值为 `"format"` 或 `"text_convention"`，用于前端分组显示修复结果

### Key Entities

- **文本排版规则（Text Convention Rule）**: 内置的通用排版检查规则，存储在 YAML 的 `text_conventions` section 中，与模板无关
- **争议项（Disputed Item）**: 由规则引擎检出但确定性不高的文本问题，需要 LLM 二次审查
- **AI 审查结果（AI Review Verdict）**: LLM 对争议项的三态判断（confirmed/ignored/uncertain）+ 分析理由
- **文本修复器（Text Convention Fixer）**: 独立于格式修复器的文本内容修复模块
- **段落来源（Paragraph Source）**: 标记段落来自文档的哪个区域（body/table/footnote/endnote），用于精确定位
- **文本习惯检查元数据（Text Convention Meta）**: 附加在 `CheckReport` 中的元数据，包含争议项列表和文档统计，用于前端发起 AI 审查

---

## API 设计

### 1. POST /api/ai/review-conventions — LLM 争议审查（JSON）

**请求体**:
```json
{
  "session_id": "xxx",
  "disputed_items": [
    {
      "id": "tc-001",
      "rule": "cjk_english_spacing",
      "paragraph_index": 15,
      "paragraph_source": "body",
      "text_context": "...本实验使用Python语言进行...",
      "issue_description": "中英文之间缺少空格: 'Python' 前后无空格"
    },
    {
      "id": "tc-002",
      "rule": "fullwidth_halfwidth_punctuation",
      "paragraph_index": 23,
      "paragraph_source": "body",
      "text_context": "...调用 print(\"hello\") 函数...",
      "issue_description": "中文段落中出现英文括号和引号"
    }
  ],
  "document_stats": {
    "total_paragraphs": 120,
    "cjk_spaced_count": 45,
    "cjk_unspaced_count": 12
  }
}
```

**响应**:
```json
{
  "reviews": [
    {
      "id": "tc-001",
      "verdict": "confirmed",
      "reason": "文档中 78% 的中英文交界处有空格，此处缺少空格属于不一致的笔误。建议统一添加空格。"
    },
    {
      "id": "tc-002",
      "verdict": "ignored",
      "reason": "此处是代码函数调用 print(\"hello\")，使用英文括号和引号是正确的。"
    }
  ]
}
```

### 2. 扩展现有 POST /api/check 响应

`CheckReport` 新增字段：

- `text_convention_meta`（可选）：包含争议项和统计数据，仅在存在文本习惯检查结果时返回

```json
{
  "session_id": "xxx",
  "filename": "...",
  "rule_id": "...",
  "rule_name": "...",
  "items": [
    {
      "id": "tc-001",
      "category": "通用·全半角",
      "item": "中英文间距不一致",
      "status": "WARN",
      "message": "...",
      "location": "段落15 [主体], 第23字符: '...使用Python语言...'",
      "fixable": true,
      "check_layer": "text_convention",
      "ai_review": null
    }
  ],
  "summary": { ... },
  "text_convention_meta": {
    "disputed_items": [
      {
        "id": "tc-001",
        "rule": "cjk_english_spacing",
        "paragraph_index": 15,
        "paragraph_source": "body",
        "text_context": "...本实验使用Python语言进行...",
        "issue_description": "中英文之间缺少空格: 'Python' 前后无空格"
      }
    ],
    "document_stats": {
      "total_paragraphs": 120,
      "cjk_spaced_count": 45,
      "cjk_unspaced_count": 12
    }
  },
  "checked_at": "..."
}
```

- `items` 中的每个 `CheckItemResult` 新增字段：
  - `check_layer: "format" | "text_convention"`（所有项都有，现有格式项为 `"format"`）
  - `id: string`（可选，仅文本习惯检查项有）
  - `ai_review: { verdict, reason } | null`（可选，仅争议项在经过 LLM 审查后有此字段）

### 3. 扩展现有 POST /api/fix 请求/响应

**请求体新增字段**：
```json
{
  "session_id": "xxx",
  "rule_id": "xxx",
  "include_text_fix": false
}
```

**响应 `fix_items` 中每项新增**：
```json
{
  "category": "通用·标点",
  "description": "连续标点 '。。' → '。'",
  "fix_layer": "text_convention"
}
```

---

## 文件结构（新增/修改）

```
backend/
  ├── scripts/
  │   ├── checker/
  │   │   ├── __init__.py             [修改] 导出新模块
  │   │   ├── base.py                 [修改] run_all_checks() 注册文本检查
  │   │   └── text_convention_checker.py  [新增] 文本排版习惯检查器（checker 子包内模块）
  │   └── text_convention_fixer.py    [新增] 文本排版修复器（独立脚本）
  ├── services/
  │   ├── checker_service.py          [修改] 集成文本检查，序列化 check_layer/id/text_convention_meta
  │   ├── fixer_service.py            [修改] 支持 include_text_fix 参数，集成文本修复
  │   └── ai_prompts.py              [修改] 新增争议审查 prompt
  ├── api/
  │   ├── schemas.py                  [修改] 扩展 CheckItemResult/CheckReport/FixRequest/FixItemResult + 新增 AI Review 模型
  │   ├── ai_routes.py                [修改] 新增 /api/ai/review-conventions
  │   └── routes.py                   [修改] check 流程集成文本检查
  ├── rules/
  │   └── default.yaml                [修改] 新增 text_conventions section
  └── tests/
      ├── test_text_convention_checker.py  [新增] 文本检查单元测试
      ├── test_text_convention_fixer.py    [新增] 文本修复单元测试
      └── test_ai_review.py               [新增] LLM 审查集成测试

frontend/src/
  ├── components/
  │   ├── CheckReport.tsx             [修改] 分层展示 + AI 标签 + 异步 AI 审查加载态
  │   └── TextConventionSection.tsx    [新增] "通用排版习惯"结果展示区域
  ├── services/
  │   └── api.ts                      [修改] 新增 reviewConventions API
  └── types/
      └── index.ts                    [修改] 扩展类型定义（CheckItemResult/CheckReport/FixRequest/FixItemResult）
```

---

## 实现计划

| 阶段 | 任务 | 依赖 | 说明 |
|------|------|------|------|
| **Phase 1: 规则 & 检查器** | | | |
| 1.1 | YAML `text_conventions` section 设计 + default.yaml 更新 + 所有预置 YAML 更新 | 无 | 定义规则结构，更新默认规则和所有预置规则文件 |
| 1.2 | `scripts/checker/text_convention_checker.py` — 确定性检查规则 + `iter_all_paragraphs()` 遍历器 | 1.1 | 7 类确定性检查（标点/空格），支持表格/脚注/尾注遍历，段落级 CJK 占比判断 |
| 1.3 | `base.py` 的 `run_all_checks()` 注册文本检查 | 1.2 | 在 run_all_checks() 中调用文本检查模块 |
| 1.4 | `schemas.py` 扩展 + `checker_service.py` 集成 | 1.3 | CheckItemResult 新增 id/check_layer/ai_review，CheckReport 新增 text_convention_meta，现有格式项补 check_layer: "format" |
| **Phase 2: LLM 审查** | | | |
| 2.1 | `ai_prompts.py` 新增争议审查 prompt | 无 | 设计高质量 system prompt |
| 2.2 | `POST /api/ai/review-conventions` 端点 | 2.1 | batch 审查 + 15s 超时保护 |
| 2.3 | 检查流程集成 — 确保 text_convention_meta 在 CheckReport 中正确返回 | 2.2, 1.4 | 前端可直接回传给 AI 审查端点 |
| **Phase 3: 前端展示** | | | |
| 3.1 | 前端类型扩展（`index.ts`） | 1.4 | CheckItemResult/CheckReport/FixRequest 类型更新 |
| 3.2 | `TextConventionSection.tsx` 组件 | 3.1 | 通用排版习惯结果展示区域 |
| 3.3 | `CheckReport.tsx` 分层展示改造 + 异步 AI 审查流程 | 3.2 | 格式检查 vs 文本习惯分组，自动发起 AI 审查，加载态 |
| 3.4 | AI 审查标签 + 展开理由 + ID 匹配合并 | 3.3 | confirmed/ignored/uncertain 标签，通过 id 匹配异步结果 |
| 3.5 | 汇总统计分层 | 3.3 | 分别统计两类检查 |
| **Phase 4: 修复** | | | |
| 4.1 | `text_convention_fixer.py` | 1.2 | 确定性文本修复 |
| 4.2 | `FixRequest` 扩展 + `fixer_service.py` 集成文本修复 | 4.1 | include_text_fix 参数，同一 _fixed 文件叠加，fix_layer 字段 |
| 4.3 | 前端修复按钮区域改造 | 4.2, 3.3 | 文本修复独立开关 |
| **Phase 5: 测试 & 打磨** | | | |
| 5.1 | 后端单元测试 | 全部 | 文本检查 + 修复 + AI 审查 |
| 5.2 | 前端组件测试 | 全部 | 分层展示 + AI 标签 + 异步加载 |
| 5.3 | 端到端验证 | 全部 | 真实文档测试 |

---

## Testing Strategy *(mandatory)*

### 后端单元测试 (pytest)

- `test_text_convention_checker.py` — 文本检查测试：
  - 括号不对称检测（中/英文圆括号、方括号、花括号、嵌套括号）
  - 括号相邻段落宽松匹配（跨段落不误报）
  - 引号不匹配检测（中/英文引号、跨段落引号不误报）
  - 连续标点检测：`。。`/`，，`/`、、`/`；；`/`：：` 报告，`！！`/`？？` 不报告，`……`（两个 U+2026）不报告，单个 `…` 不报告，`...` 非省略号上下文报告
  - 中文之间多余空格（精确匹配 CJK 范围，不误判中英文交界）
  - 连续多个空格
  - 全角空格检测
  - 代码段落自动跳过
  - 空段落跳过
  - 段落级 CJK 占比 < 10% 跳过中文相关检查
  - 各规则 `enabled: false` 时正确跳过
  - `iter_all_paragraphs()` 正确遍历表格、脚注、尾注
  - 段落来源标记正确（body/table/footnote/endnote）
  - `check_layer` 和 `id` 字段正确设置

- `test_text_convention_fixer.py` — 文本修复测试：
  - 连续标点修复（`。。` → `。`）
  - 中文间空格修复（`你 好` → `你好`，不影响中英文交界）
  - 连续空格压缩（`a   b` → `a b`）
  - 全角空格替换
  - 跨 Run 边界修复
  - 修复不改变格式属性
  - `include_text_fix: false` 时不执行文本修复
  - `fix_layer` 字段正确设置

- `test_ai_review.py` — LLM 审查测试：
  - 请求参数校验（空列表、超长文本）
  - 15s 超时降级（mock 超时）
  - LLM 不可用降级
  - 响应格式校验（三态 verdict）
  - batch 合并逻辑
  - `text_convention_meta` 在 CheckReport 中正确返回

### 前端测试 (Vitest)

- `TextConventionSection.test.tsx` — 排版习惯展示测试
- `CheckReport.test.tsx` — [修改] 新增分层展示测试
- AI 标签渲染和展开交互测试
- 异步 AI 审查加载态和 ID 匹配合并测试

### 回归测试

每完成一个 Phase 后，MUST 运行完整的测试套件确保不引入回归问题。特别关注：
- 现有格式检查结果不受文本检查新增的影响
- 现有 `CheckItemResult` 新增可选字段的向后兼容性
- `check_layer: "format"` 在所有现有格式项上正确设置

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 对包含已知标点/空格问题的测试文档，确定性检查的检出率 ≥ 95%（括号不对称、连续标点、中文间空格等）
- **SC-002**: 确定性检查的误报率 ≤ 5%（通过排除规则正确过滤代码段落、公式、URL 等）
- **SC-003**: LLM 争议审查将高误判规则（中英文间距、全半角混用、句末标点）的有效问题识别准确率提升至 ≥ 80%（对比无 LLM 审查时 ≤ 40% 的可信度）
- **SC-004**: LLM 审查的端到端延迟（含 API 调用）< 8s（batch 模式，15 个争议项以内）
- **SC-005**: 现有全部测试套件通过，格式检查结果无回归
- **SC-006**: 文本修复后，文档的格式属性（字体/字号/行距等）无任何改变（仅文本内容变化）

---

## 约束与风险

### Constitution 约束

- **Principle II Justified Violation**: 文本修复涉及修改文档文字内容。缓解：默认仅 WARN 不修复；修复需用户 opt-in；修复前自动备份
- **Principle I**: 文本检查规则通过 YAML `text_conventions` section 驱动，不硬编码在 Python 代码中（每条规则可独立 `enabled: false`）。默认配置写入所有预置 YAML 文件，代码仅作 fallback
- **Principle III**: 文本检查器和文本修复器作为独立模块，保持检查与修复分离
- **Principle VI**: 不引入新的核心依赖——文本检查基于 `re`（标准库）+ `python-docx`（已有）

### 技术风险

- **Run 边界问题**：Word 文档中一个"词"可能被拆分到多个 Run 中（如部分加粗），文本检查需要拼接所有 Run 的文本后检查，但修复时需要定位回具体的 Run → 需要维护字符偏移到 Run 的映射关系
- **LLM 成本**：每次检查可能产生 LLM 调用费用。缓解：batch 合并 + 结果缓存（同一 session 内不重复审查）
- **LLM 质量**：DeepSeek 对中文排版规范的理解质量需要通过 prompt 工程优化。回退：prompt 中提供明确的判断规则和示例
- **性能**：大文档（500+ 段落）的文本检查 + LLM 审查可能耗时较长。缓解：确定性检查同步执行（预计 < 1s），LLM 审查**异步执行**——前端先展示确定性结果，自动发起 AI 审查请求，LLM 标签后续动态更新
- **向后兼容**：新增的 `check_layer`、`ai_review`、`id`、`text_convention_meta` 字段为可选，不影响现有前端（旧前端会忽略这些字段）。现有格式检查项统一补 `check_layer: "format"` 确保分组逻辑确定性
- **表格/脚注遍历**：`python-docx` 的 `doc.paragraphs` 不包含表格和脚注段落，需要额外遍历 `doc.tables` 和脚注/尾注 part。`iter_all_paragraphs()` 生成器统一封装此逻辑

---

## Clarify 决策记录

以下是 spec clarify 阶段的 12 个问题及采纳的决策，作为实现时的参考：

| # | 问题 | 决策 |
|---|------|------|
| Q1 | LLM 审查触发时机 | **方案 B（异步两步）**：`/api/check` 先返回确定性结果，前端再异步调用 `/api/ai/review-conventions` |
| Q2 | `document_stats` 谁来统计 | 后端检查时顺便统计，附加在 `CheckReport.text_convention_meta` 中，前端回传给 AI 审查 |
| Q3 | 括号检查范围 | **段落级** + 相邻段落宽松匹配（下一段开头 5 字符内找到对应右括号则不报告） |
| Q4 | 连续标点精确定义 | `！！`/`？？` 不报告（强调语气），省略号相关不报告，`、、`/`；；`/`：：` 等报告 |
| Q5 | 前端 ID 匹配 | `CheckItemResult` 新增可选 `id` 字段，通过 ID 匹配合并 AI 审查结果 |
| Q6 | 文本检查器架构 | **方案 A**：`scripts/checker/text_convention_checker.py`（checker 子包内模块），在 `run_all_checks()` 注册 |
| Q7 | Principle I 合规 | 默认配置写入所有预置 YAML 文件，代码仅作 fallback |
| Q8 | `check_layer` 向后兼容 | 现有格式检查项统一补 `check_layer: "format"`，文本项标记 `"text_convention"` |
| Q9 | 修复集成方式 | `FixRequest` 新增 `include_text_fix: bool = False`，同一 `_fixed` 文件叠加，`FixItemResult` 新增 `fix_layer` |
| Q10 | AI 审查数据来源 | `CheckReport` 新增 `text_convention_meta` 字段，前端直接回传 |
| Q11 | 中文文档判定 | **段落级** CJK 占比 < 10% 则跳过该段落的中文相关检查 |
| Q12 | 表格/脚注遍历 | `iter_all_paragraphs(doc)` 生成器按序遍历主体/表格/脚注/尾注，附加来源标记 |

---

*超时统一为 **15s**（FR-015），取消了 Edge Cases 中原有的 10s 不一致。*
