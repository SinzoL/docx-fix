# Quickstart: 模板提取与规则管理

**Feature**: 003-template-extraction  
**Date**: 2026-03-10

## 前置条件

- Python ≥ 3.9 + pip
- Node.js ≥ 18 + npm
- 已有 docx-fix 项目代码

## 1. 启动后端

```bash
cd docx-fix/backend

# 安装依赖（如果尚未安装）
pip install -r requirements.txt

# 启动开发服务器
uvicorn app:app --reload --port 8000
```

验证后端启动成功：

```bash
# 测试提取 API
curl -X POST http://localhost:8000/api/extract-rules \
  -F "file=@../rules/hit_midterm_report.yaml;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document" \
  -F "name=测试规则"

# 注意：实际使用时需要上传 .docx 文件，上面只是格式示例
```

## 2. 启动前端

```bash
cd docx-fix/frontend

# 安装依赖（如果尚未安装）
npm install

# 启动开发服务器
npm run dev
```

浏览器打开 `http://localhost:5173`

## 3. 使用模板提取功能

### 3.1 上传模板提取

1. 在主页点击 **「提取模板」** Tab
2. 点击上传区域，选择一个 `.docx` 格式的模板文件
3. 等待提取完成，查看：
   - **提取摘要卡片**：样式数量、检测到的模块（页面设置/编号/页眉页脚等）
   - **YAML 预览区域**：语法高亮的规则内容
4. 输入规则名称（或使用默认名称），点击 **「保存规则」**
5. 规则保存到浏览器本地，30 天后自动过期

### 3.2 文字描述生成（LLM）

1. 在「提取模板」页面切换到 **「文字描述」** 模式
2. 输入格式要求文本，如：
   ```
   正文用小四号宋体，1.25倍行距
   一级标题用三号黑体，居中
   页面 A4，上下边距 2.5cm，左右边距 3cm
   ```
3. 点击 **「生成规则」**，等待 AI 生成 YAML
4. 查看预览，编辑名称后保存

### 3.3 规则管理

1. 在「提取模板」页面下方查看 **「我的规则」** 列表
2. 支持操作：
   - 点击规则查看 YAML 详情
   - 重命名规则
   - 删除规则（需确认）
   - 下载为 `.yaml` 文件

### 3.4 使用自定义规则检查文档

1. 切换到 **「上传检查」** Tab
2. 上传待检查的 `.docx` 文件
3. 在规则选择器中，除服务端预置规则外，还能看到浏览器本地保存的自定义规则
4. 选择自定义规则后点击检查/修复

## 4. 运行测试

### 后端测试

```bash
cd docx-fix/backend
pytest tests/ -v
```

### 前端测试

```bash
cd docx-fix/frontend
npm run test
```

## 5. 关键文件索引

| 文件 | 说明 |
|------|------|
| `backend/services/extractor_service.py` | 模板提取服务封装 |
| `backend/api/routes.py` | `POST /api/extract-rules` 路由 |
| `backend/api/schemas.py` | 提取相关 Pydantic schema |
| `frontend/src/services/ruleStorage.ts` | localStorage 规则管理 |
| `frontend/src/components/ExtractPanel.tsx` | 模板提取面板组件 |
| `frontend/src/components/RuleManager.tsx` | 规则管理面板组件 |
| `rule_extractor.py` | 核心模板提取引擎（根目录） |

## 6. 调试提示

- **提取失败**：检查上传的是否为有效 `.docx` 文件（非 `.doc`），文件是否损坏
- **保存失败**：浏览器可能处于隐私模式（localStorage 不可用），或存储空间不足
- **规则消失**：规则已超过 30 天过期被自动清理
- **LLM 不可用**：确认 `backend/.env` 中 `DEEPSEEK_API_KEY` 配置正确
