# Quickstart: 内容润色

**Feature**: 007-text-polish | **Date**: 2026-03-10

## Prerequisites

- Python ≥ 3.12
- Node.js ≥ 18
- DeepSeek API Key 已配置（`backend/.env` 中的 `DEEPSEEK_API_KEY`）
- 项目已按照 spec-001 的 quickstart 完成初始设置

## 1. 后端启动

```bash
cd docx-fix/backend

# 激活虚拟环境
source venv/bin/activate  # macOS/Linux

# 确认 .env 中有 DEEPSEEK_API_KEY
cat .env

# 启动开发服务器
uvicorn app:app --reload --port 8000
```

## 2. 前端启动

```bash
cd docx-fix/frontend
npm run dev
```

## 3. 验证段落提取

### 3.1 正常段落提取

1. 准备一个包含多个段落的学术论文文档（含摘要、正文、图注、表注、参考文献）
2. 上传文档并选择"内容润色"模式
3. 系统应提取正文段落用于润色，跳过：
   - 目录（TOC）段落
   - 图注（"图X-Y"开头）
   - 表注（"表X-Y"开头）
   - 参考文献列表项（`[数字]` 开头）
   - 公式段落
   - 短文本（< 5 字符）段落

### 3.2 Run 结构保留

1. 在文档中确认某段落包含加粗/斜体等特殊格式的 Run
2. 润色并应用修改后，验证加粗/斜体格式是否保留

## 4. 验证 LLM 润色

### 4.1 语病修正

1. 在文档中包含 "这个实验表明了该方法具有较好效果"
2. 润色后应建议修正为 "该实验结果表明此方法具有较好的效果" 或类似修改
3. 修改类型应为 "grammar"

### 4.2 用词优化

1. 在文档中包含 "我们使用了一种很好的方法来解决这个问题"
2. 润色后应建议将"我们"改为"本文"等学术化表达
3. 修改类型应为 "wording"

### 4.3 不需要修改

1. 在文档中包含一段已经规范的学术表达
2. 润色引擎应返回 modified=false，不生成建议

### 4.4 数据/专有名词不修改

1. 段落中包含 "精度达到 95.3%" 和 "TensorFlow"
2. 验证润色后数字 "95.3%" 和专有名词 "TensorFlow" 未被修改

## 5. 验证润色预览

### 5.1 Diff 对比展示

1. 润色完成后进入预览模式
2. 每条建议应显示：
   - 原文（红色/删除样式）
   - 润色后文本（绿色/新增样式）
   - 修改类型标签
   - 修改说明

### 5.2 逐条接受/拒绝

1. 点击某条建议的 ✅ 接受按钮 → 标记为已接受
2. 点击某条建议的 ❌ 拒绝按钮 → 标记为已拒绝
3. 点击"全部接受" → 所有建议变为已接受
4. 点击"全部拒绝" → 所有建议变为已拒绝

### 5.3 按类型筛选

1. 点击"语病修正"筛选标签 → 仅显示 grammar 类型的建议
2. 点击"全部"标签 → 显示所有建议

## 6. 验证应用修改 + 下载

1. 接受部分建议（如 10 条中接受 6 条）
2. 点击"应用选中的修改并下载"
3. 下载的文档应仅包含 6 条接受的修改
4. 其他段落保持不变
5. 所有格式属性保持不变

## 7. 验证双 Agent 语义守护

1. 如果 polisher 将具体数据改为笼统描述（如 "O(n²)" → "较高"），reviewer 应标记 ⚠️
2. 如果 polisher 仅做了主语代词替换（如 "我们" → "本文"），reviewer 应不标记
3. 标记了 ⚠️ 的建议在预览中应有醒目的提示

## 8. 运行测试

### 后端测试

```bash
cd docx-fix/backend
python -m pytest tests/ -v
```

预期所有测试通过，包括新增的：
- `tests/test_text_extractor.py` — 段落提取测试
- `tests/test_polish_engine.py` — 润色引擎测试
- `tests/test_text_writer.py` — 格式保留回写测试
- `tests/test_diff_calculator.py` — Diff 计算测试

### 前端测试

```bash
cd docx-fix/frontend
npx vitest run
```

### 全量回归测试

```bash
cd docx-fix/backend && python -m pytest tests/ -v && cd ../frontend && npx vitest run
```

## 9. 关键文件索引

| 文件 | 说明 |
|------|------|
| `backend/scripts/polisher/__init__.py` | polisher 子包入口 |
| `backend/scripts/polisher/text_extractor.py` | 段落文本提取 |
| `backend/scripts/polisher/polish_engine.py` | LLM 润色引擎 |
| `backend/scripts/polisher/diff_calculator.py` | Diff 计算 |
| `backend/scripts/polisher/text_writer.py` | 格式保留回写 |
| `backend/services/polisher_service.py` | 润色业务编排 |
| `backend/services/ai_prompts.py` | 润色 Prompt 模板（polisher + reviewer） |
| `backend/api/polish_routes.py` | 润色 API 路由 |
| `backend/api/schemas.py` | 润色相关 Schema |
| `frontend/src/components/PolishPanel.tsx` | 润色主面板 |
| `frontend/src/components/PolishPreview.tsx` | 润色预览（Diff + 接受/拒绝） |
| `frontend/src/components/UploadPanel.tsx` | 上传面板（新增润色 Tab） |
| `frontend/src/types/index.ts` | 润色相关类型 |

## 10. 调试提示

- **段落提取调试**：在 `text_extractor.py` 的 `extract_paragraphs()` 中添加 `logging.debug()` 查看每个段落的分类结果
- **LLM 响应调试**：在 `polish_engine.py` 中 `logging.debug()` 打印 LLM 的原始响应 JSON
- **Run 结构调试**：回写前打印段落的 Run 列表和偏移量，确认映射正确
- **SSE 调试**：浏览器 DevTools → Network → 查看 EventStream 类型的请求，检查 SSE 事件是否正确推送
- **Reviewer 调试**：如果 reviewer 标记率过高，检查 reviewer Prompt 是否对"语义变化"的阈值设置过低
