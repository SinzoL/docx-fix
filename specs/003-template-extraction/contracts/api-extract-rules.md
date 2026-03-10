# API Contract: 模板提取与规则管理

**Feature**: 003-template-extraction  
**Date**: 2026-03-10  
**Base URL**: `/api`

---

## 1. POST /api/extract-rules — 从模板文档提取格式规则

**状态**: ✅ 已实现（`backend/api/routes.py`）

### Request

- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Max File Size**: 20MB（与 check/fix 一致）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | `File` | ✅ | `.docx` 模板文件 |
| `name` | `string` | ❌ | 规则名称，留空则由文件名自动生成 |

### Response (200 OK)

```json
{
  "yaml_content": "# ============================================================\n# 哈工大中期报告格式\n# ...\n",
  "summary": {
    "has_page_setup": true,
    "has_header_footer": true,
    "has_numbering": true,
    "has_structure": false,
    "has_special_checks": true,
    "has_heading_style_fix": true,
    "style_count": 8,
    "style_names": ["Normal", "Heading 1", "Heading 2", "Heading 3"],
    "page_setup_info": {
      "paper_size": "A4",
      "width_cm": 21.0,
      "height_cm": 29.7
    },
    "extracted_at": "2026-03-10T03:15:22Z"
  },
  "filename": "中期报告模板.docx"
}
```

### Error Responses

| HTTP Code | error | message | 触发条件 |
|-----------|-------|---------|----------|
| 400 | `INVALID_FILE_TYPE` | "仅支持 .docx 格式文件" | 上传非 .docx 文件 |
| 400 | `FILE_TOO_LARGE` | "文件大小超过限制（最大 20MB）" | 文件超过 20MB |
| 422 | `EXTRACT_ERROR` | "模板提取失败: {detail}" | rule_extractor.py 解析失败 |

---

## 2. POST /api/check — 格式检查（扩展：支持自定义规则）

**状态**: 🔧 待扩展（新增 `custom_rules_yaml` 可选字段）

### Request 变更

在现有 `multipart/form-data` 基础上新增：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | `File` | ✅ | 待检查的 `.docx` 文件 |
| `rules` | `string` | ❌ | 服务端预置规则文件名（已有） |
| `custom_rules_yaml` | `string` | ❌ | 自定义规则的 YAML 内容（新增） |

> 当 `custom_rules_yaml` 非空时，忽略 `rules` 字段，使用自定义规则进行检查。

### 行为变更

1. 后端收到 `custom_rules_yaml` 时，写入临时文件
2. 将临时文件路径传给 `checker_service.run_check()`
3. 检查完成后删除临时文件

---

## 3. POST /api/fix — 格式修复（扩展：支持自定义规则）

**状态**: 🔧 待扩展（与 check 相同的扩展方式）

### Request 变更

同上，新增 `custom_rules_yaml` 可选字段。

---

## 4. POST /api/ai/generate-rules — LLM 生成规则

**状态**: ✅ 已实现（`backend/api/ai_routes.py`，spec-002）

### Request

- **Method**: `POST`
- **Content-Type**: `application/json`

```json
{
  "text": "正文用小四号宋体，1.25倍行距；一级标题用三号黑体居中...",
  "name": "我的学校格式规则"
}
```

### Response (200 OK)

```json
{
  "yaml_content": "meta:\n  name: 我的学校格式规则\n  ...",
  "warnings": ["推断：英文字体默认使用 Times New Roman"]
}
```

---

## 5. GET /api/rules — 获取预置规则列表

**状态**: ✅ 已实现，无变更

> 前端在规则选择器中将此接口返回的预置规则与 localStorage 中的自定义规则合并展示。

---

## 前端 localStorage 契约

### 存储键

| 键名 | 值类型 | 说明 |
|------|--------|------|
| `docx-fix:custom-rules` | `JSON string (CustomRule[])` | 所有自定义规则 |

### CustomRule 接口

```typescript
interface CustomRule {
  id: string;                                      // UUID v4
  name: string;                                    // 规则名称（1-100字符）
  source: "template-extract" | "llm-generate";     // 来源
  yaml_content: string;                            // 完整 YAML 内容
  source_filename?: string;                        // 源文件名（仅模板提取）
  created_at: string;                              // ISO 8601
  expires_at: string;                              // ISO 8601（created_at + 30天）
}
```

### ruleStorage API 契约

```typescript
// frontend/src/services/ruleStorage.ts

/** 初始化：清理过期规则 */
function init(): void;

/** 获取所有未过期的自定义规则 */
function getAll(): CustomRule[];

/** 根据 ID 获取单条规则 */
function getById(id: string): CustomRule | null;

/** 保存新规则，返回生成的 ID */
function save(rule: Omit<CustomRule, 'id' | 'created_at' | 'expires_at'>): string;

/** 重命名规则（同步更新 yaml_content 中的 meta.name） */
function rename(id: string, newName: string): boolean;

/** 删除规则 */
function remove(id: string): boolean;

/** 获取存储使用量（字节） */
function getStorageSize(): number;

/** 检查 localStorage 是否可用 */
function isAvailable(): boolean;
```
