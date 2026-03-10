# API Contract: Web 前后端界面

**Feature**: 001-web-frontend-backend | **Date**: 2026-03-09
**Base URL**: `http://localhost:8000/api`

## Endpoints

### 1. GET /rules — 获取可用规则列表

**Description**: 扫描 `rules/` 目录，返回所有可用的 YAML 规则文件信息。

**Response** `200 OK`:

```json
{
  "rules": [
    {
      "id": "default",
      "filename": "default.yaml",
      "name": "通用默认检查",
      "description": "仅检查基础格式设置（页面设置、基本字体、基本段落格式）",
      "is_default": true
    },
    {
      "id": "hit_midterm_report",
      "filename": "hit_midterm_report.yaml",
      "name": "哈工大(深圳)毕业论文中期报告",
      "description": "哈尔滨工业大学（深圳）毕业论文中期报告格式规范",
      "is_default": false
    }
  ]
}
```

---

### 2. POST /check — 上传文件并执行格式检查

**Description**: 上传 .docx 文件，使用指定规则进行格式检查。

**Request**: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | ✅ | .docx 文件（≤50MB） |
| rule_id | string | ❌ | 规则 id，默认 `default` |
| session_id | string | ✅ | 前端生成的 UUID，用于关联后续 fix 请求 |

**Response** `200 OK`:

```json
{
  "session_id": "uuid-xxx",
  "filename": "论文.docx",
  "rule_id": "hit_midterm_report",
  "rule_name": "哈工大(深圳)毕业论文中期报告",
  "items": [
    {
      "category": "页面设置",
      "item": "纸张大小",
      "status": "PASS",
      "message": "A4 (21.0 × 29.7 cm) ✓",
      "location": null,
      "fixable": false
    },
    {
      "category": "字体样式",
      "item": "正文中文字体",
      "status": "FAIL",
      "message": "期望: 宋体, 实际: 微软雅黑",
      "location": "段落 15",
      "fixable": true
    }
  ],
  "summary": {
    "pass": 12,
    "warn": 2,
    "fail": 5,
    "fixable": 4
  },
  "checked_at": "2026-03-09T14:30:00Z"
}
```

**Error Responses**:

- `400 Bad Request`: 文件格式不是 .docx / 文件过大 / rule_id 无效
- `422 Unprocessable Entity`: 文件损坏，无法解析

```json
{
  "error": "INVALID_FILE_TYPE",
  "message": "仅支持 .docx 格式文件"
}
```

---

### 3. POST /fix — 执行修复并返回预览

**Description**: 对已上传的文件执行格式修复，返回修复前后对比报告。

**Request**: `application/json`

```json
{
  "session_id": "uuid-xxx",
  "rule_id": "hit_midterm_report"
}
```

**Response** `200 OK`:

```json
{
  "session_id": "uuid-xxx",
  "filename": "论文.docx",
  "rule_name": "哈工大(深圳)毕业论文中期报告",
  "fix_items": [
    {
      "category": "字体样式",
      "description": "正文中文字体: 微软雅黑 → 宋体"
    },
    {
      "category": "页面设置",
      "description": "上边距: 2.0cm → 2.54cm"
    }
  ],
  "before_summary": { "pass": 12, "warn": 2, "fail": 5 },
  "after_summary": { "pass": 17, "warn": 1, "fail": 1 },
  "changed_items": [
    {
      "category": "字体样式",
      "item": "正文中文字体",
      "before_status": "FAIL",
      "after_status": "PASS",
      "message": "宋体 ✓"
    }
  ],
  "fixed_at": "2026-03-09T14:31:00Z"
}
```

**Error Responses**:

- `404 Not Found`: session_id 对应的文件不存在（可能已过期清理）
- `400 Bad Request`: 无可修复项

---

### 4. GET /fix/download?session_id={session_id} — 下载修复后文件

**Description**: 下载修复后的 .docx 文件。

**Response** `200 OK`:
- Content-Type: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Content-Disposition: `attachment; filename="论文_fixed.docx"`
- Body: 文件二进制流

**Error Responses**:

- `404 Not Found`: session_id 对应的修复文件不存在

---

### 5. GET /rules/{rule_id} — 获取规则详情

**Description**: 返回指定规则文件的完整内容（可读化格式）。

**Response** `200 OK`:

```json
{
  "id": "hit_midterm_report",
  "name": "哈工大(深圳)毕业论文中期报告",
  "description": "...",
  "sections": [
    {
      "name": "页面设置",
      "rules": [
        { "item": "纸张大小", "value": "A4 (21.0 × 29.7 cm)" },
        { "item": "上边距", "value": "3.0 cm" },
        { "item": "下边距", "value": "2.5 cm" }
      ]
    },
    {
      "name": "正文样式",
      "rules": [
        { "item": "中文字体", "value": "宋体" },
        { "item": "英文字体", "value": "Times New Roman" },
        { "item": "字号", "value": "小四 (12pt)" }
      ]
    }
  ]
}
```

---

## CORS Configuration

后端配置 CORS 允许前端开发服务器访问：

```python
origins = [
    "http://localhost:5173",  # Vite dev server
    "http://localhost:3000",
]
```

## Error Response Format

所有错误统一格式：

```json
{
  "error": "ERROR_CODE",
  "message": "人类可读的错误描述"
}
```

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| INVALID_FILE_TYPE | 400 | 文件格式非 .docx |
| FILE_TOO_LARGE | 400 | 文件超过 50MB |
| INVALID_RULE | 400 | rule_id 不存在 |
| FILE_CORRUPTED | 422 | .docx 文件损坏 |
| SESSION_NOT_FOUND | 404 | session_id 无效或已过期 |
| FIX_ERROR | 500 | 修复过程中出错 |
| NO_FIXABLE_ITEMS | 400 | 无可修复项 |
