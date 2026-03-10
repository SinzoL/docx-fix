# Data Model: Web 前后端界面

**Feature**: 001-web-frontend-backend | **Date**: 2026-03-09

## Server-side Entities (Pydantic Models)

### RuleInfo

规则文件的元信息，用于前端展示规则选择器。

| Field | Type | Description |
|-------|------|-------------|
| id | string | 规则文件名（不含扩展名），如 `hit_midterm_report` |
| filename | string | 文件名，如 `hit_midterm_report.yaml` |
| name | string | `meta.name` 值，如 "哈工大(深圳)毕业论文中期报告" |
| description | string | `meta.description` 值 |
| is_default | boolean | 是否为通用默认规则 |

### CheckItemResult

单条检查结果，对应 `checker.py` 中的 `CheckResult` 类。

| Field | Type | Description |
|-------|------|-------------|
| category | string | 检查类别，如 "页面设置"、"字体样式" |
| item | string | 检查项名称 |
| status | enum | `PASS` / `WARN` / `FAIL` |
| message | string | 详细说明 |
| location | string? | 位置信息，如 "段落 35" |
| fixable | boolean | 是否可自动修复 |

### CheckReport

一次检查的完整报告。

| Field | Type | Description |
|-------|------|-------------|
| filename | string | 被检查的文件名 |
| rule_name | string | 所用规则的名称 |
| rule_id | string | 所用规则的 id |
| items | CheckItemResult[] | 所有检查项结果 |
| summary | object | 汇总：`{ pass: int, warn: int, fail: int, fixable: int }` |
| checked_at | string | 检查时间 ISO 8601 |

### FixItemResult

单条修复结果，对应 `fixer.py` 中的 `fixes` 列表元素。

| Field | Type | Description |
|-------|------|-------------|
| category | string | 修复类别 |
| description | string | 修复描述 |

### FixReport

修复结果预览，包含修复前后对比。

| Field | Type | Description |
|-------|------|-------------|
| filename | string | 被修复的文件名 |
| rule_name | string | 所用规则名称 |
| fix_items | FixItemResult[] | 修复项列表 |
| before_summary | object | 修复前检查汇总 `{ pass, warn, fail }` |
| after_summary | object | 修复后检查汇总 `{ pass, warn, fail }` |
| before_items | CheckItemResult[] | 修复前检查结果（仅状态变化的项） |
| after_items | CheckItemResult[] | 修复后检查结果（仅状态变化的项） |
| fixed_at | string | 修复时间 ISO 8601 |

## Client-side Entities (IndexedDB)

### DB: `docx-fix-cache`

#### Store: `history`

| Field | Type | Index | Description |
|-------|------|-------|-------------|
| id | string (PK) | ✅ | UUID，唯一标识一次检查记录 |
| filename | string | ✅ | 原始文件名 |
| file_blob | Blob | | 上传的原始 .docx 文件 |
| rule_id | string | | 所用规则 id |
| rule_name | string | | 所用规则名称 |
| check_report | CheckReport | | 检查报告 JSON |
| fix_report | FixReport? | | 修复报告 JSON（如有） |
| fixed_file_blob | Blob? | | 修复后的文件 Blob（如有） |
| created_at | number | ✅ | 创建时间戳（ms），用于过期清理 |
| expires_at | number | ✅ | 过期时间戳 = created_at + 30 天 |

**过期清理策略**：
- 每次打开页面时，查询 `expires_at < Date.now()` 的记录并删除
- 缓存空间不足时，按 `created_at` 升序删除最旧记录

## State Transitions

### Document Processing Flow

```
[IDLE] → 上传文件+选规则 → [UPLOADING] → 上传完成 → [CHECKING]
  → 检查完成 → [REPORT_READY]
  → 用户点修复 → [FIXING] → 修复完成 → [FIX_PREVIEW]
  → 用户点下载 → [DOWNLOADED]
```

| State | UI 表现 | 可用操作 |
|-------|---------|---------|
| IDLE | 上传区域 + 模板选择器 | 选文件、选模板 |
| UPLOADING | 上传进度条 | 无 |
| CHECKING | 检查中 Loading | 无 |
| REPORT_READY | 检查报告展示 | 一键修复（有 fixable 项时）、切换规则、查看规则详情 |
| FIXING | 修复中 Loading | 无 |
| FIX_PREVIEW | 修复前后对比预览 | 下载修复文件 |
| DOWNLOADED | 下载完成提示 | 返回上传新文件 |
