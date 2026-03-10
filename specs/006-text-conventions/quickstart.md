# Quickstart: 通用文本排版习惯检查

**Feature**: 006-text-conventions | **Date**: 2026-03-10

## Prerequisites

- Python ≥ 3.12
- Node.js ≥ 18
- DeepSeek API Key 已配置（AI 审查需要，可选）
- 项目已按照 spec-001 的 quickstart 完成初始设置

## 1. 后端启动

```bash
cd docx-fix/backend
source venv/bin/activate
uvicorn app:app --reload --port 8000
```

## 2. 前端启动

```bash
cd docx-fix/frontend
npm run dev
```

## 3. 验证确定性文本检查

### 3.1 括号不对称

1. 准备测试文档，某段落包含 `（内容不完整`（缺右括号）
2. 上传检查，报告应在"通用排版习惯"区域显示"括号不对称"FAIL
3. 如果下一段开头 5 字符内有 `）`，则不报告（相邻段落宽松匹配）

### 3.2 连续标点

1. 文档中包含 `。。` → 应报告"连续标点"FAIL，fixable=true
2. 文档中包含 `！！` → 不应报告（强调语气合法）
3. 文档中包含 `……`（两个 U+2026）→ 不应报告（中文省略号）

### 3.3 中文之间多余空格

1. 文档中包含 `你 好 世 界` → 应报告"中文之间多余空格"FAIL
2. 文档中包含 `使用 Python 进行` → 不应报告（中英文交界）

### 3.4 表格/脚注遍历

1. 表格单元格中包含 `。。` → 应检出，location 标注"表格"
2. 脚注中包含 `你 好` → 应检出，location 标注"脚注"

### 3.5 段落级跳过

1. CJK 字符占比 < 10% 的纯英文段落 → 跳过中文相关检查
2. 代码样式段落 → 跳过空格和全半角检查（标点检查保留）
3. 数学公式（OMath）段落 → 全部跳过

## 4. 验证 LLM 争议审查

### 4.1 异步两步流程

1. `POST /api/check` 返回时包含 `text_convention_meta`（disputed_items + document_stats）
2. 前端自动发起 `POST /api/ai/review-conventions`
3. 审查结果通过 `id` 匹配合并到检查项，显示 AI 标签

### 4.2 AI 标签

- **"AI 确认 ✓"**（绿色）：LLM 判断确实有问题
- **"AI 可忽略 ○"**（灰色）：LLM 判断是合理用法
- **"待确认 ?"**（黄色）：LLM 不确定或超时

### 4.3 LLM 不可用降级

1. 未配置 API Key 时，争议项显示 WARN + "AI 审查不可用，请人工判断"
2. 审查超时（>15s）时，显示 "AI 审查超时"

## 5. 验证前端分层展示

### 5.1 两大区域

1. "格式检查"区域：现有格式属性检查结果
2. "通用排版习惯"区域：文本内容检查结果，按子类分组（通用·标点/通用·空格/通用·全半角）

### 5.2 分层统计

- 汇总区域显示：`格式: ✓5 ⚠2 ✗3 | 排版习惯: ⚠1 ✗2`

### 5.3 文本修复开关

- 有文本排版问题时，修复按钮区域显示"包含文本排版修复"开关（默认关闭）

## 6. 验证文本修复

1. 开启文本修复开关，点击修复
2. 连续标点 `。。` → 修复为 `。`
3. 中文间空格 `你 好` → 修复为 `你好`
4. 全角空格 → 替换为半角
5. 修复后格式属性不变
6. 修复项在报告中标记 `fix_layer: "text_convention"`

## 7. 运行测试

```bash
cd docx-fix/backend && python -m pytest tests/ -v
cd docx-fix/frontend && npx vitest run
```

## 8. 关键文件索引

| 文件 | 说明 |
|------|------|
| `backend/scripts/checker/text_convention_checker.py` | 文本检查器 |
| `backend/scripts/text_convention_fixer.py` | 文本修复器 |
| `backend/services/checker_service.py` | 检查服务（集成文本检查） |
| `backend/services/fixer_service.py` | 修复服务（集成文本修复） |
| `backend/services/ai_prompts.py` | 争议审查 prompt |
| `backend/api/ai_routes.py` | /api/ai/review-conventions |
| `backend/api/schemas.py` | 扩展的数据模型 |
| `backend/rules/default.yaml` | text_conventions 配置 |
| `frontend/src/components/CheckReport.tsx` | 分层展示 + AI 标签 |
| `frontend/src/services/api.ts` | reviewConventions API |
| `frontend/src/types/index.ts` | 类型定义 |

## 9. 调试提示

- **段落遍历调试**：在 `iter_all_paragraphs()` 中添加 `print()` 查看来源和段落文本
- **CJK 占比调试**：`_cjk_ratio()` 返回值 < 0.1 时跳过中文检查
- **争议项调试**：检查 `text_convention_meta.disputed_items` 是否正确生成
- **LLM 响应调试**：在 `_parse_review_response()` 中打印 raw_response
- **Run 回写调试**：在 `_apply_text_to_runs()` 中比较修复前后 Run 文本
- **前端 AI 审查**：浏览器 DevTools → Network → 查看 `/api/ai/review-conventions` 请求和响应
