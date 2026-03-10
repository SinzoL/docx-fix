# Quickstart: Web 前后端界面

**Feature**: 001-web-frontend-backend | **Date**: 2026-03-09

## Prerequisites

- Python ≥ 3.12
- Node.js ≥ 18
- npm ≥ 9

## 1. 后端启动

```bash
cd docx-fix/backend

# 创建虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate  # macOS/Linux

# 安装依赖
pip install -r requirements.txt

# 启动开发服务器
uvicorn app:app --reload --port 8000
```

后端运行于 `http://localhost:8000`，API 文档查看 `http://localhost:8000/docs`。

## 2. 前端启动

```bash
cd docx-fix/frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端运行于 `http://localhost:5173`，自动代理 API 请求到后端。

## 3. 运行测试

### 后端测试

```bash
cd docx-fix/backend

# 安装测试依赖（已包含在 requirements.txt）
pip install -r requirements.txt

# 运行全量后端测试
python -m pytest tests/ -v
```

### 前端测试

```bash
cd docx-fix/frontend

# 安装依赖（已包含测试依赖）
npm install

# 运行全量前端测试
npx vitest run
```

### 全量回归测试（每个新特性完成后必须运行）

```bash
# 从项目根目录一键执行
cd docx-fix/backend && python -m pytest tests/ -v && cd ../frontend && npx vitest run
```

> ⚠️ **重要**：每完成一个新特性后，MUST 运行全量回归测试。全部通过后才可进入下一个任务。

## 4. 验证

1. 打开 `http://localhost:5173`
2. 选择一个 `.docx` 文件
3. 选择检查模板（默认"通用默认检查"）
4. 点击上传，查看检查报告
5. 如有可修复项，点击"一键修复"
6. 预览修复结果，点击"下载修复文件"

## 后端依赖清单

```text
# requirements.txt
fastapi>=0.104.0
uvicorn>=0.24.0
python-multipart>=0.0.6
python-docx>=0.8.11
lxml>=4.9.0
pyyaml>=6.0

# 测试依赖
pytest>=7.0
httpx>=0.25.0
pytest-asyncio>=0.23.0
```

## 前端依赖清单

```text
# package.json 核心依赖
react: ^18
react-dom: ^18
tdesign-react: ^1.12.0
tdesign-icons-react: ^0.5.0
idb: ^8  (IndexedDB 封装)

# 开发依赖
vite: ^5
typescript: ^5
tailwindcss: ^3.4.17
tailwind-merge: ^2.5.5
tailwindcss-animate: ^1.0.7
postcss: ^8.5
autoprefixer: ^10.4.20
less: ^4.3.0
@types/react: ^18
@types/react-dom: ^18

# 测试依赖
vitest: ^2
@testing-library/react: ^16
@testing-library/jest-dom: ^6
@testing-library/user-event: ^14
jsdom: ^25
fake-indexeddb: ^6
```
