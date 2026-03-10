"""
FastAPI 应用入口

提供 Word 文档格式检查和修复的 REST API。
"""

import os
import shutil
import asyncio
from contextlib import asynccontextmanager

# 加载 .env 文件（需在其他模块导入前加载）
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from api.routes import router  # noqa: E402
from api.ai_routes import ai_router  # noqa: E402

# 临时文件目录
TEMP_DIR = os.environ.get("DOCX_FIX_TEMP_DIR", "/tmp/docx-fix")


async def cleanup_expired_sessions():
    """后台任务：定期清理过期的 session 目录（超过 1 小时）"""
    import time

    while True:
        try:
            if os.path.exists(TEMP_DIR):
                now = time.time()
                for session_dir in os.listdir(TEMP_DIR):
                    session_path = os.path.join(TEMP_DIR, session_dir)
                    if os.path.isdir(session_path):
                        # 检查目录修改时间
                        mtime = os.path.getmtime(session_path)
                        if now - mtime > 3600:  # 1 小时
                            shutil.rmtree(session_path, ignore_errors=True)
        except Exception:
            pass
        await asyncio.sleep(600)  # 每 10 分钟检查一次


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时确保临时目录存在
    os.makedirs(TEMP_DIR, exist_ok=True)

    # 启动后台清理任务
    cleanup_task = asyncio.create_task(cleanup_expired_sessions())

    yield

    # 关闭时取消清理任务
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="docx-fix API",
    description="Word 文档格式检查与修复 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置 — 允许前端开发服务器访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载 API 路由
app.include_router(router, prefix="/api")
app.include_router(ai_router, prefix="/api")
