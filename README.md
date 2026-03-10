# 📄 docx-fix — Word 文档格式检查与修复工具

一个基于 Web 的 Word 文档（.docx）格式合规性检查与自动修复工具，支持自定义规则、AI 智能分析和模板提取。

> 适用场景：毕业论文格式审查、学术文档规范化、企业公文格式标准化等。

## ✨ 功能特性

### 📋 格式检查
- 上传 `.docx` 文件，自动检测页面设置、字体、段落、编号、标题等格式问题
- 按类别分组展示检查结果（PASS / WARN / FAIL）
- 标记可自动修复项

### 🔧 一键修复
- 对可修复的格式问题一键自动修复
- 修复前后对比展示（改善项高亮）
- 下载修复后的文档

### 📐 规则系统
- 内置默认规则 + 自定义 YAML 规则文件
- 从模板 `.docx` 文件自动提取格式规则
- 通过 AI 文字描述生成规则
- 规则切换与详情查看

### 🤖 AI 智能助手（DeepSeek）
- **AI 总结**：自动生成通俗易懂的检查报告摘要（SSE 流式输出）
- **格式问答**：针对检查结果进行多轮对话，获取修改建议
- **规则生成**：用自然语言描述格式要求，AI 生成 YAML 规则

### 📜 历史记录
- 浏览器本地缓存检查/修复历史（IndexedDB）
- 支持查看历史报告、删除记录
- 自动清理过期数据（30 天）

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + TypeScript + TDesign + Tailwind CSS |
| **构建** | Vite 7 |
| **后端** | FastAPI + Uvicorn |
| **文档处理** | python-docx + lxml |
| **AI 集成** | OpenAI SDK（兼容 DeepSeek API） |
| **测试** | pytest + httpx（后端）/ Vitest + Testing Library（前端） |
| **部署** | Docker Compose + Nginx（HTTPS / SSE 代理） |

## 📁 项目结构

```
docx-fix/
├── backend/                  # 后端服务
│   ├── api/                  # API 路由与数据模型
│   │   ├── routes.py         # 核心 API 端点
│   │   ├── ai_routes.py      # AI 相关端点
│   │   └── schemas.py        # Pydantic 模型
│   ├── services/             # 业务逻辑层
│   │   ├── checker_service.py
│   │   ├── fixer_service.py
│   │   ├── rules_service.py
│   │   ├── extractor_service.py
│   │   ├── llm_service.py
│   │   └── ai_prompts.py
│   ├── scripts/              # 核心处理脚本
│   │   ├── checker.py        # 格式检查引擎
│   │   ├── fixer.py          # 格式修复引擎
│   │   └── rule_extractor.py # 模板规则提取器
│   ├── rules/                # YAML 规则文件
│   │   ├── default.yaml
│   │   └── hit_midterm_report.yaml
│   ├── tests/                # 后端测试
│   ├── app.py                # FastAPI 入口
│   └── requirements.txt
├── frontend/                 # 前端应用
│   ├── src/
│   │   ├── components/       # React 组件
│   │   │   ├── UploadPanel.tsx
│   │   │   ├── CheckReport.tsx
│   │   │   ├── FixPreview.tsx
│   │   │   ├── ExtractPanel.tsx
│   │   │   ├── RuleManager.tsx
│   │   │   ├── RuleDetail.tsx
│   │   │   ├── HistoryList.tsx
│   │   │   ├── AiSummary.tsx
│   │   │   └── AiChatPanel.tsx
│   │   ├── services/         # API 调用与本地存储
│   │   ├── types/            # TypeScript 类型定义
│   │   └── App.tsx           # 应用入口
│   └── package.json
├── deploy/                   # 部署配置
│   ├── nginx.conf            # Nginx 主配置（HTTPS + SSE）
│   └── frontend-nginx.conf   # 前端 Nginx 配置
├── specs/                    # 功能规格文档
├── Dockerfile.backend
├── Dockerfile.frontend
├── docker-compose.yml
└── deploy.sh                 # 一键部署脚本
```

## 🚀 快速启动

### 环境要求

- Python ≥ 3.12
- Node.js ≥ 18
- Docker & Docker Compose（生产部署）

### 本地开发

**1. 启动后端**

```bash
cd backend

# 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量（AI 功能需要）
cp .env.example .env
# 编辑 .env 填入 DeepSeek API Key

# 启动服务
uvicorn app:app --reload --port 8000
```

**2. 启动前端**

```bash
cd frontend

npm install
npm run dev
```

前端默认运行在 `http://localhost:5173`，后端 API 在 `http://localhost:8000`。

### Docker 部署

```bash
# 配置后端环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env 填入 API Key

# 构建并启动
docker compose up -d --build

# 查看状态
docker ps
```

服务启动后：
- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:8000`
- API 文档：`http://localhost:8000/docs`

### 一键远程部署

```bash
# 完整部署（上传 + 构建 + 重启）
./deploy.sh

# 强制无缓存重建
./deploy.sh --no-cache

# 仅上传代码
./deploy.sh --sync-only

# 仅构建重启
./deploy.sh --build-only
```

## 📡 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/rules` | 获取规则列表 |
| `GET` | `/api/rules/{id}` | 获取规则详情 |
| `POST` | `/api/check` | 上传文件并检查格式 |
| `POST` | `/api/fix` | 修复文档格式 |
| `GET` | `/api/fix/download` | 下载修复后的文件 |
| `POST` | `/api/extract-rules` | 从模板提取规则 |
| `POST` | `/api/ai/summarize` | AI 检查报告总结（SSE） |
| `POST` | `/api/ai/chat` | AI 格式问答（SSE） |
| `POST` | `/api/ai/generate-rules` | AI 生成 YAML 规则 |

完整 API 文档启动后端后访问：`http://localhost:8000/docs`

## 🧪 测试

```bash
# 后端测试
cd backend
pytest -v

# 前端测试
cd frontend
npx vitest run

# 前端类型检查
npm run typecheck
```

## 📄 规则文件格式

规则文件使用 YAML 格式，示例：

```yaml
meta:
  name: "通用默认检查"
  description: "基础格式检查规则"

page_setup:
  paper_size: A4
  margin_top_cm: 2.54
  margin_bottom_cm: 2.54

styles:
  Normal:
    font_name_ascii: "Times New Roman"
    font_name_east_asia: "宋体"
    font_size_pt: 12
    line_spacing_type: multiple
    line_spacing_value: 1.5
```

## 📝 License

MIT
