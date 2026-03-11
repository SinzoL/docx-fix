"""
FastAPI 应用入口

提供 Word 文档格式检查和修复的 REST API。
"""

import os
import shutil
import time
import logging
import asyncio
from contextlib import asynccontextmanager

# 加载 .env 文件（需在其他模块导入前加载）
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from config import TEMP_DIR, SESSION_EXPIRE_SECONDS, SESSION_CLEANUP_INTERVAL, CORS_ORIGINS, setup_logging  # noqa: E402
from api.routes import router  # noqa: E402
from api.ai_routes import ai_router  # noqa: E402
from api.polish_routes import polish_router  # noqa: E402
from services.polisher_service import cleanup_expired_polish_sessions  # noqa: E402

# 初始化日志
setup_logging()
logger = logging.getLogger(__name__)


async def cleanup_expired_sessions():
    """后台任务：定期清理过期的 session 目录"""
    while True:
        try:
            if os.path.exists(TEMP_DIR):
                now = time.time()
                cleaned = 0
                for session_dir in os.listdir(TEMP_DIR):
                    session_path = os.path.join(TEMP_DIR, session_dir)
                    if os.path.isdir(session_path):
                        mtime = os.path.getmtime(session_path)
                        if now - mtime > SESSION_EXPIRE_SECONDS:
                            shutil.rmtree(session_path, ignore_errors=True)
                            cleaned += 1
                if cleaned > 0:
                    logger.info(f"清理了 {cleaned} 个过期 session 目录")

            # 同步清理内存中的润色 session
            cleanup_expired_polish_sessions()

        except Exception as e:
            logger.error(f"清理过期 session 时出错: {e}")
        await asyncio.sleep(SESSION_CLEANUP_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时确保临时目录存在
    os.makedirs(TEMP_DIR, exist_ok=True)
    logger.info(f"docx-fix API 启动，临时目录: {TEMP_DIR}")

    # 启动后台清理任务
    cleanup_task = asyncio.create_task(cleanup_expired_sessions())

    yield

    # 关闭时取消清理任务
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    logger.info("docx-fix API 关闭")


app = FastAPI(
    title="docx-fix API",
    description="Word 文档格式检查与修复 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置 — 允许前端开发服务器访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载 API 路由
app.include_router(router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(polish_router, prefix="/api")
