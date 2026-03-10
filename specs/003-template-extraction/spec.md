# Feature Specification: 模板提取与规则管理

**Feature Branch**: `003-template-extraction`  
**Created**: 2026-03-10  
**Status**: Draft  
**Input**: 增加模板提取功能的Web入口，实现规则的浏览器本地存储与管理，将spec-002中的规则管理内容整合至此。

## 背景与动机

当前 docx-fix 系统已有完整的模板提取脚本 `rule_extractor.py`（1163行），能从 `.docx` 模板文档自动提取格式规则并生成 YAML 配置文件。但该功能仅能通过 CLI 使用，Web 界面中**缺少提取模板的入口按钮**。

同时，spec-002 中规划的"自然语言格式要求 → YAML 规则"（LLM 生成规则）功能也涉及规则管理，本 spec 将规则管理的全部职责整合到一起，包括：

1. **模板提取**：上传 `.docx` 模板 → 自动提取 → 生成 YAML 规则
2. **LLM 规则生成**：输入自然语言格式要求 → LLM 解析 → 生成 YAML 规则（从 spec-002 User Story 3 迁入）
3. **规则管理**：查看、编辑、删除、重命名用户自定义规则

### 关键设计决策

- **存储位置**：用户提取/生成的自定义规则保存在**浏览器 localStorage** 中，不同用户互不干扰，30天后过期自动删除
- **入口位置**：模板提取/规则管理作为**主页独立入口**，与"上传检查"并列为独立 Tab/按钮
- **后端无状态**：后端仅负责解析 `.docx` 文件并返回 YAML 内容，不持久化用户自定义规则

## Clarifications

### Session 2026-03-10

- Q: 模板提取功能入口位置？ → A: 主页的独立入口（与"上传检查"并列的 Tab/按钮）
- Q: 提取后的规则保存在哪里？ → A: 保存在浏览器 localStorage 中，不同用户互不干扰，30天后过期自动删除
- Q: 脚本文件放在后端还是前端？ → A: 根目录脚本保持不动，通过 `backend/services/extractor_service.py` 薄封装，与 checker/fixer 模式一致
- Q: 是否一并更新 Constitution？ → A: 是，原则 V 和 VI 已更新为反映 CLI + Web 双入口定位
- Q: spec-002 中的规则管理内容？ → A: User Story 3（自然语言格式要求生成 YAML 规则）迁移到本 spec 中统一管理

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 上传模板文档提取规则 (Priority: P1)

用户在 Web 主页点击"提取模板"Tab，进入模板提取页面。用户上传一个 `.docx` 格式的模板文档（如学校发布的论文格式模板），系统调用后端 `rule_extractor.py` 解析文档中的格式信息（页面设置、样式、编号、页眉页脚等），生成与 checker/fixer 兼容的 YAML 规则，并在页面上展示提取结果预览。

预览包括：
- 提取摘要（检测到多少样式、是否有页面设置/编号/页眉页脚等）
- YAML 规则内容的语法高亮展示
- 用户可编辑规则名称

**Why this priority**: 这是 Web 界面中**完全缺失**的核心功能入口，且 `rule_extractor.py` 已经完备，只需接入 Web 即可立即交付价值。

**Independent Test**: 上传一个已知的模板 `.docx` 文件，确认页面正确展示提取摘要和 YAML 预览，YAML 内容与 CLI 直接运行 `rule_extractor.py` 的输出一致。

**Acceptance Scenarios**:

1. **Given** 用户在主页, **When** 点击"提取模板"Tab, **Then** 展示模板提取页面，包含上传区域和说明文字
2. **Given** 模板提取页面已打开, **When** 用户选择一个 `.docx` 模板文件并上传, **Then** 系统显示加载状态，完成后展示提取摘要卡片（样式数量、检测到的模块列表）和 YAML 预览
3. **Given** 提取完成, **When** 用户查看 YAML 预览, **Then** YAML 内容以语法高亮方式展示，分节显示（页面设置、样式、编号等），可滚动浏览
4. **Given** 用户上传非 `.docx` 文件, **When** 系统验证文件类型, **Then** 提示"仅支持 .docx 格式"并拒绝处理
5. **Given** 上传的 `.docx` 文件损坏或无法解析, **When** 系统尝试提取, **Then** 展示友好的错误提示，不崩溃

---

### User Story 2 - 保存和管理自定义规则 (Priority: P2)

用户在模板提取预览页面确认提取结果后，点击"保存规则"按钮。系统将规则名称和 YAML 内容保存到浏览器 localStorage 中，并记录保存时间戳。保存的规则30天后过期自动删除。

用户可在"规则管理"区域查看所有已保存的自定义规则列表，支持：
- 查看规则详情（YAML 预览）
- 重命名规则
- 删除规则
- 在检查/修复流程中选用自定义规则

**Why this priority**: 提取后必须能保存才有完整的使用闭环。浏览器存储方案避免了后端持久化的复杂性，同时实现用户间隔离。

**Independent Test**: 提取规则后点击保存，关闭浏览器后重新打开，确认规则仍在列表中。修改系统时间超过30天后刷新页面，确认规则已被自动清理。

**Acceptance Scenarios**:

1. **Given** 提取结果预览页面, **When** 用户输入规则名称并点击"保存规则", **Then** 规则保存到 localStorage，显示成功提示，规则出现在"规则管理"列表中
2. **Given** 规则管理列表中有已保存的规则, **When** 用户点击某条规则, **Then** 展示该规则的 YAML 详情预览
3. **Given** 规则管理列表, **When** 用户点击"删除"按钮并确认, **Then** 规则从 localStorage 中移除，列表更新
4. **Given** 规则管理列表, **When** 用户点击"重命名"并输入新名称, **Then** 规则名称更新，YAML 内容中的 `meta.name` 同步更新
5. **Given** 已保存的规则超过30天, **When** 用户访问页面, **Then** 过期规则已被自动清理，不再显示在列表中
6. **Given** 用户在上传检查流程中, **When** 选择规则模板, **Then** 除了服务端预置规则外，还能看到并选择 localStorage 中保存的自定义规则

---

### User Story 3 - 自然语言格式要求生成 YAML 规则 (Priority: P3)

*（从 spec-002 User Story 3 迁移）*

用户在"提取模板"页面可以选择"文字描述"模式，通过粘贴/输入学校的自然语言格式要求（如"正文用小四号宋体，1.25倍行距；一级标题用三号黑体居中"），由 LLM 解析后自动生成与 checker.py/fixer.py 兼容的 YAML 规则文件。

**Why this priority**: 面向"没有模板 docx 文件"的场景补充。很多学校只发布文字版格式说明。但此功能对 prompt engineering 要求较高，且依赖 LLM 服务可用性。

**Independent Test**: 输入一段格式要求文本，确认生成的 YAML 规则文件可被 checker.py 正常加载。

**Acceptance Scenarios**:

1. **Given** 用户在提取模板页面, **When** 切换到"文字描述"模式, **Then** 展示文本输入区域和"生成规则"按钮
2. **Given** 用户已输入格式要求文本, **When** 点击"生成规则", **Then** 系统调用 LLM 解析文本，生成 YAML 并展示预览，用户可编辑后保存
3. **Given** 格式要求文本模糊不清, **When** LLM 解析, **Then** LLM 合理推断并在输出中标注"推断值，请确认"
4. **Given** LLM 服务不可用, **When** 用户点击"生成规则", **Then** 显示"AI 服务暂不可用"提示
5. **Given** LLM 生成的规则保存后, **When** 用户在检查流程中选用该规则, **Then** 规则可正常加载并执行检查

---

### Edge Cases

- 浏览器 localStorage 空间不足时，系统应提示"存储空间不足，请删除部分旧规则"
- 用户在隐私/无痕模式下使用时，localStorage 可能不可用或会话结束后清除，系统应提示用户
- 提取的 YAML 内容过大（超过 localStorage 单项 5MB 限制）时，系统应提示并建议用户下载 YAML 文件
- 用户在多个浏览器 Tab 中同时操作规则列表时，应保持数据一致性
- 上传的模板文件为空白文档（无任何格式设置）时，系统应提示"未检测到有效格式规则"
- LLM 生成的 YAML 格式不合法时，系统应捕获解析错误并提示用户手动修正

## Requirements *(mandatory)*

### Functional Requirements

#### 模板提取

- **FR-001**: 系统 MUST 在 Web 主页提供"提取模板"独立 Tab/入口，与"上传检查"并列
- **FR-002**: 系统 MUST 允许用户上传 `.docx` 模板文件，调用后端 `rule_extractor.py` 提取格式规则
- **FR-003**: 系统 MUST 返回提取结果摘要（样式数量、检测模块列表）和格式化的 YAML 规则内容
- **FR-004**: 系统 MUST 在提取预览页面以语法高亮方式展示 YAML 内容，支持滚动浏览
- **FR-005**: 后端 MUST 通过 `backend/services/extractor_service.py` 封装 `rule_extractor.py`，遵循现有 checker/fixer 的服务封装模式

#### 规则本地存储

- **FR-006**: 系统 MUST 将用户自定义规则保存在浏览器 localStorage 中，键名使用唯一前缀避免冲突
- **FR-007**: 每条规则 MUST 记录保存时间戳，超过 30 天后在页面加载时自动清理
- **FR-008**: 不同用户（不同浏览器/设备）的规则 MUST 互不干扰
- **FR-009**: 系统 MUST 在检查/修复流程的规则选择器中，将 localStorage 中的自定义规则与服务端预置规则合并展示

#### 规则管理

- **FR-010**: 系统 MUST 提供规则管理列表，展示所有已保存的自定义规则（名称、来源、保存时间、过期时间）
- **FR-011**: 系统 MUST 支持查看规则 YAML 详情
- **FR-012**: 系统 MUST 支持重命名规则（同步更新 YAML 中的 `meta.name`）
- **FR-013**: 系统 MUST 支持删除规则（需二次确认）
- **FR-014**: 系统 SHOULD 支持下载规则为 `.yaml` 文件

#### LLM 规则生成（从 spec-002 迁入）

- **FR-015**: 系统 MUST 在提取模板页面提供"文字描述"模式切换
- **FR-016**: 系统 MUST 调用后端 LLM 服务将自然语言格式要求转为 YAML 规则
- **FR-017**: LLM 服务不可用时 MUST 不影响模板提取等其他功能

### Key Entities

- **自定义规则（Custom Rule）**: 用户通过模板提取或 LLM 生成的规则，保存在 localStorage 中。包含：规则 ID（UUID）、规则名称、来源（"template-extract" 或 "llm-generate"）、YAML 内容、源文件名（仅模板提取）、保存时间戳、过期时间戳
- **规则存储键（Storage Key）**: localStorage 中的键名，格式为 `docx-fix:custom-rules`，值为所有自定义规则的 JSON 数组
- **提取结果（Extract Result）**: 后端返回的中间结果，包含 YAML 内容和提取摘要，尚未持久化

## API 设计

### POST /api/extract-rules — 从模板文档提取格式规则

**请求**: `multipart/form-data`
- `file`: `.docx` 模板文件
- `name`: 规则名称（可选）

**响应**:
```json
{
  "yaml_content": "# ============================...",
  "summary": {
    "has_page_setup": true,
    "has_header_footer": true,
    "has_numbering": true,
    "has_structure": false,
    "has_special_checks": true,
    "has_heading_style_fix": true,
    "style_count": 8,
    "style_names": ["Normal", "Heading 1", "Heading 2", ...],
    "page_setup_info": { "paper_size": "A4", "width_cm": 21.0, "height_cm": 29.7 },
    "extracted_at": "2026-03-10T03:15:22Z"
  },
  "filename": "template.docx"
}
```

### POST /api/ai/generate-rules — 从文本生成 YAML 规则（已在 spec-002 中定义）

沿用 spec-002 中已定义的 API，不做变更。

## localStorage 数据结构

```typescript
// 键名: "docx-fix:custom-rules"
interface CustomRule {
  id: string;              // UUID
  name: string;            // 用户指定的规则名称
  source: "template-extract" | "llm-generate";
  yaml_content: string;    // 完整的 YAML 规则内容
  source_filename?: string; // 仅模板提取时记录源文件名
  created_at: string;      // ISO 8601 时间戳
  expires_at: string;      // 30天后的过期时间戳
}

// localStorage.getItem("docx-fix:custom-rules") → JSON.stringify(CustomRule[])
```

## 文件结构（新增/修改）

```
docx-fix/
  ├── backend/
  │   ├── services/
  │   │   └── extractor_service.py  [新增] 封装 rule_extractor.py ✅ 已完成
  │   └── api/
  │       ├── routes.py             [修改] 新增 POST /api/extract-rules ✅ 已完成
  │       └── schemas.py            [修改] 新增提取相关 schema ✅ 已完成
  │
  ├── frontend/src/
  │   ├── components/
  │   │   ├── ExtractPanel.tsx      [新增] 模板提取面板（上传+预览+保存）
  │   │   ├── RuleManager.tsx       [新增] 规则管理面板（列表+详情+操作）
  │   │   └── UploadPanel.tsx       [修改] 规则选择器中合并自定义规则
  │   ├── services/
  │   │   ├── api.ts                [修改] 新增 extractRules API 调用
  │   │   └── ruleStorage.ts        [新增] localStorage 规则存储管理
  │   ├── types/
  │   │   └── index.ts              [修改] 新增自定义规则相关类型
  │   └── App.tsx                   [修改] 新增 Tab 路由/状态
  │
  └── .specify/memory/
      └── constitution.md           [修改] 更新原则 V、VI ✅ 已完成
```

## Testing Strategy *(mandatory)*

### 后端测试 (pytest)

- `tests/test_extractor_service.py` — 模板提取服务单元测试（上传模板、YAML 生成、摘要构建）
- `tests/test_api_extract.py` — POST /api/extract-rules API 集成测试（正常提取、文件类型校验、损坏文件处理）

### 前端测试 (Vitest)

- `__tests__/services/ruleStorage.test.ts` — localStorage 规则存储测试（保存/读取/删除/过期清理）
- `__tests__/components/ExtractPanel.test.tsx` — 模板提取面板组件测试
- `__tests__/components/RuleManager.test.tsx` — 规则管理面板组件测试

### 回归测试

每完成一个 Task 后，MUST 运行完整的测试套件确保不引入回归问题。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 用户从点击"提取模板"到看到 YAML 预览的全流程可在 15 秒内完成（普通大小的模板文件）
- **SC-002**: 提取的 YAML 规则与 CLI 直接运行 `rule_extractor.py` 的输出内容完全一致
- **SC-003**: 保存的自定义规则在浏览器关闭后重新打开仍然可用
- **SC-004**: 超过 30 天的规则在页面加载时自动清理
- **SC-005**: 自定义规则可在检查/修复流程中正常选用，检查结果与使用服务端预置规则时行为一致
- **SC-006**: 不同浏览器/设备上的用户看到的自定义规则列表互不干扰

## 约束与风险

- **localStorage 容量限制**：单个域名通常 5-10MB，需监控存储用量，规则过多时引导用户清理
- **隐私模式兼容性**：部分浏览器隐私模式下 localStorage 行为不同（如 Safari 限制写入），需做降级处理
- **LLM 依赖**：User Story 3 依赖 DeepSeek API 可用性，MUST 确保 LLM 不可用时不影响模板提取功能
- **规则兼容性**：自定义规则的 YAML 格式 MUST 与 checker.py/fixer.py 完全兼容，否则检查时应给出清晰的错误提示
