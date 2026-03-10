# Research: 模板提取与规则管理

**Feature**: 003-template-extraction  
**Date**: 2026-03-10  
**Status**: Complete — 所有技术问题已解决

## 概述

本次 research 围绕三个方面展开：
1. localStorage 规则存储方案设计
2. YAML 语法高亮前端方案选型
3. 自定义规则与检查流程集成方式

Technical Context 中无 NEEDS CLARIFICATION 项，以下为对已确定技术决策的论证和备选方案评估。

---

## Research 1: localStorage 规则存储方案

### Decision

使用浏览器 localStorage，键名 `docx-fix:custom-rules`，值为 `CustomRule[]` 的 JSON 序列化字符串。每条规则记录 `created_at` 和 `expires_at`（+30天），页面加载时自动清理过期规则。

### Rationale

- **无服务端状态**：符合 Constitution VI"客户端存储优先"原则，后端保持无状态
- **天然隔离**：不同浏览器/设备的 localStorage 天然隔离，满足 FR-008
- **实现简单**：无需引入 IndexedDB 的复杂异步 API，规则数据量小（单条 < 100KB，总量 < 50 条 ≈ 5MB）

### Alternatives Considered

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **IndexedDB** | 容量更大（50MB+）、支持异步 | API 复杂、需 idb 封装库、规则数据量不需要 | ❌ 过度设计 |
| **服务端数据库** | 跨设备同步 | 需要用户认证体系、违反 Constitution VI | ❌ 违反原则 |
| **SessionStorage** | 实现简单 | 关闭浏览器即丢失 | ❌ 不满足 SC-003 |
| **文件下载/上传** | 无容量限制 | 用户体验差，每次使用需手动操作 | ❌ 体验差 |

### 实现要点

1. **过期清理时机**：在 `ruleStorage.ts` 模块初始化时（`init()`）执行，以及保存/读取时惰性检查
2. **存储容量监控**：保存前估算 JSON 序列化大小，超过 4MB 时提示用户清理
3. **多 Tab 一致性**：监听 `window.addEventListener('storage', ...)` 事件同步状态
4. **隐私模式降级**：try/catch 包裹 localStorage 操作，不可用时给出提示但不阻塞功能

---

## Research 2: YAML 语法高亮方案

### Decision

使用 CSS + 正则手动高亮（轻量方案），或者利用 `<pre><code>` + TDesign 的代码展示组件。不引入 Monaco Editor 或 CodeMirror 等重量级编辑器。

### Rationale

- YAML 预览是**只读展示**为主（保存前可编辑规则名称，但不需要编辑 YAML 正文）
- Constitution VI 明确要求"前端技术栈：React + TDesign + TailwindCSS，无额外组件库"
- YAML 的语法结构简单（键值对、注释、缩进），手动正则高亮已足够

### Alternatives Considered

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **Monaco Editor** | 功能强大、IntelliSense | 包体积 > 2MB、过度复杂 | ❌ 违反简洁原则 |
| **CodeMirror 6** | 模块化、轻量 | 仍需新增依赖 | ❌ 不符合零额外组件库要求 |
| **react-syntax-highlighter** | 易用 | 新增依赖、包含大量语言支持 | ❌ 大部分功能用不到 |
| **手动正则高亮** | 零依赖、完全可控 | 需自行实现 | ✅ 最符合项目约束 |

### 实现要点

- 将 YAML 字符串按行拆分，对 `#` 注释行、键名（`key:`）、字符串值、数字值分别着色
- 使用 `<pre>` + TailwindCSS 类控制样式
- 分节显示（页面设置、样式、编号等），利用 YAML 中的 `# =====` 分隔注释作为分节标记

---

## Research 3: 自定义规则与检查流程集成

### Decision

在 `UploadPanel.tsx` 的规则选择器中，合并展示服务端预置规则（`GET /api/rules`）和 localStorage 中的自定义规则。用户选择自定义规则时，前端将 YAML 内容通过请求体（而非规则文件名）传递给后端检查 API。

### Rationale

- 自定义规则仅存在于客户端，后端无法通过文件路径访问
- 需要扩展 `POST /api/check` 和 `POST /api/fix` 接口，增加 `custom_rules_yaml` 可选字段
- 后端收到自定义 YAML 时，写入临时文件后按现有逻辑处理

### Alternatives Considered

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **前端上传规则文件到后端** | 后端逻辑不变 | 每次检查都要上传，体验差 | ❌ |
| **将规则内容嵌入请求体** | 单次请求完成 | 需要扩展 API schema | ✅ 最佳方案 |
| **后端保存用户规则** | 通过文件名引用 | 违反"无服务端状态"设计 | ❌ |

### 实现要点

1. `POST /api/check` 和 `POST /api/fix` 新增可选的 `custom_rules_yaml: str` 字段
2. 后端收到 `custom_rules_yaml` 时，写入临时 YAML 文件 → 传给 checker/fixer → 完成后清理
3. 前端规则选择器 UI：预置规则（下拉选择）+ 自定义规则（分组展示，来源标签区分）
4. 前端需要区分规则来源：`source: "server"` vs `source: "template-extract"` vs `source: "llm-generate"`

---

## Research 4: LLM 规则生成集成（从 spec-002 迁入）

### Decision

沿用 spec-002 已实现的 `POST /api/ai/generate-rules` 端点，在前端「提取模板」页面新增"文字描述"模式切换，调用该端点。生成的规则同样保存到 localStorage。

### Rationale

- 后端 API 已在 spec-002 中定义并实现（`ai_routes.py` + `llm_service.py` + `ai_prompts.py`）
- 前端仅需新增模式切换 UI 和调用逻辑，复用 `ruleStorage.ts` 的保存机制
- source 字段设为 `"llm-generate"` 与模板提取区分

### 实现要点

- `ExtractPanel.tsx` 顶部增加 Tabs 或 Segmented Control：「上传模板」/「文字描述」
- "文字描述"模式下展示 textarea + "生成规则"按钮
- 调用 `POST /api/ai/generate-rules`，响应中的 `yaml_content` 进入同一个 YAML 预览 + 保存流程
- LLM 不可用时仅影响"文字描述"模式，"上传模板"模式正常工作

---

## 总结

所有技术问题已解决，无残留的 NEEDS CLARIFICATION 项。主要技术决策：

1. ✅ **localStorage** 存储自定义规则（30天过期）
2. ✅ **手动正则 YAML 高亮**（零依赖）
3. ✅ **请求体传递自定义规则 YAML**（扩展 check/fix API）
4. ✅ **复用 spec-002 LLM 端点**（前端新增模式切换）
