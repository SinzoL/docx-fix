"""
FastAPI 应用入口

提供 Word 文档格式检查和修复的 REST API。
"""

import os
import logging
import asyncio
from contextlib import asynccontextmanager

# 加载 .env 文件（需在其他模块导入前加载）
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from config import TEMP_DIR, SESSION_CLEANUP_INTERVAL, CORS_ORIGINS, ENABLE_CORS_MIDDLEWARE, setup_logging  # noqa: E402
from api.routes import router  # noqa: E402
from services.session_manager import session_manager  # noqa: E402

# 初始化日志
setup_logging()
logger = logging.getLogger(__name__)


async def cleanup_expired_sessions():
    """后台任务：定期清理过期的 session（磁盘 + 内存）"""
    while True:
        try:
            session_manager.cleanup_all_expired()
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

# CORS 配置 — 开发环境启用（生产环境由 Nginx 统一处理，避免双重 CORS 头）
if ENABLE_CORS_MIDDLEWARE:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    logger.info("CORS 中间件已启用（开发模式）")
else:
    logger.info("CORS 中间件已跳过（生产模式，由 Nginx 处理）")

# 挂载 API 路由（所有子路由已在 routes.py 中统一注册）
app.include_router(router, prefix="/api")
