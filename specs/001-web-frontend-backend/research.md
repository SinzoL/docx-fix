# Research: Web 前后端界面

**Feature**: 001-web-frontend-backend | **Date**: 2026-03-09

## R1: 后端框架选型

**Decision**: FastAPI

**Rationale**:
- 原生异步支持，适合文件上传和处理等 IO 密集场景
- 自带 OpenAPI/Swagger 文档，无需额外配置即可调试 API
- python-multipart 集成简单，天然支持文件上传
- 轻量级，仅需 `fastapi` + `uvicorn` 两个包
- 类型提示友好，与 Pydantic 深度集成

**Alternatives considered**:
- Flask：更成熟，但缺乏原生异步和自动文档生成，需额外装 flask-cors 等插件
- Django：过于重量级，引入 ORM 等不需要的组件，违反 Constitution VI
- 直接使用 http.server：过于原始，无路由、无文件上传支持

## R2: 前端框架与组件库

**Decision**: React 18 + TDesign React v1.12.0

**Rationale**:
- 用户明确选择 TDesign (React)
- TDesign 提供完整的企业级组件：Table（报告展示）、Tag（状态标签）、Upload（文件上传）、Select（规则选择）、Collapse（规则详情）、Progress（加载进度）
- 中文文档完善，默认中文 locale
- 搭配 TailwindCSS 可快速实现自定义布局

**Alternatives considered**:
- Ant Design：生态更丰富但体积大，风格偏后台管理
- shadcn/ui：美观但需自行组装，开发速度慢
- MUI：Material Design 风格，中文支持弱

## R3: 前端构建工具

**Decision**: Vite 5

**Rationale**:
- TDesign React 官方推荐搭配 Vite
- 开发热重载极快（ESM native）
- 配置简洁，React + TypeScript 模板开箱即用
- 内置 Less 支持（TDesign 需要）

**Alternatives considered**:
- Webpack：配置繁琐，开发速度慢
- Next.js：引入 SSR 等不需要的功能，过度复杂

## R4: 浏览器本地缓存方案

**Decision**: IndexedDB（通过 `idb` 库封装）

**Rationale**:
- 支持存储大文件 Blob（.docx 文件可达 50MB）
- 异步 API，不阻塞主线程
- `idb` 库提供 Promise 化的简洁 API，避免原生 IndexedDB 的回调地狱
- 浏览器广泛支持（Chrome/Firefox/Safari/Edge）

**Alternatives considered**:
- localStorage：5MB 限制，不支持 Blob，不适合存储文件
- Cache API：适合 HTTP 响应缓存，不适合结构化数据（如检查报告 JSON）
- 服务端数据库：违反 "无需登录" 需求，增加服务端复杂度

## R5: 后端如何调用现有 checker/fixer

**Decision**: 直接 import + 进程内调用（封装 service 层）

**Rationale**:
- checker.py 和 fixer.py 都是纯 Python 类，可直接实例化调用
- `DocxChecker(filepath, rules_path)` → `.run_all_checks()` → `.results` 获取结构化数据
- `DocxFixer(filepath, rules_path)` → `.run_all_fixes()` → `.fixes` 获取修复列表
- 需要将 print 输出的报告改为结构化 JSON 返回，通过 service 层序列化 `.results` 列表

**Alternatives considered**:
- 子进程调用 CLI：需要解析 CLI 输出文本，不可靠且效率低
- 重写 API：重复代码，违反 DRY

## R6: 通用默认检查规则内容

**Decision**: 创建 `rules/default.yaml`，仅包含基础格式设置

**Rationale**:
- 用户明确要求"只检查基础设置"
- 参照现有 `hit_midterm_report.yaml` 的结构，只保留 `page_setup`、基础 `styles`（正文字体字号行距）
- 不包含学校特定的标题编号、目录格式等规则

**检查项范围**:
- `page_setup`: A4 纸张（21.0 × 29.7cm）, 页边距（上下2.54cm，左右3.17cm — Word 默认值）
- `styles.Normal`: 中文宋体 / 英文 Times New Roman / 小四号(12pt) / 1.5 倍行距 / 首行缩进 2 字符
- 不检查：标题样式、编号、目录、页眉页脚（这些是特定模板的要求）

## R7: 文件上传与临时文件管理

**Decision**: 服务端 `/tmp/docx-fix/{session_id}/` 临时目录，处理完后响应返回即清理

**Rationale**:
- 上传文件暂存于服务端临时目录进行处理
- session_id 由前端生成（UUID），确保用户隔离
- check API 返回结构化 JSON 后，原文件可保留供后续 fix 使用
- fix API 返回修复后文件的二进制流后，整个 session 目录可清理
- 设置定时清理（如 1 小时无访问则清除），防止异常情况下的文件堆积

**Alternatives considered**:
- 全部在内存中处理：python-docx 需要文件路径，且大文件可能 OOM
- 永久存储：违反隐私原则，增加存储成本
