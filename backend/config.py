"""
统一配置管理

集中管理所有后端配置项（环境变量 + 默认值），
避免配置分散在各模块中。
"""

import os
import logging
from pathlib import Path


# ========================================
# 目录路径
# ========================================

# 后端根目录
BACKEND_DIR = Path(__file__).parent.resolve()

# 临时文件目录
TEMP_DIR = os.environ.get("DOCX_FIX_TEMP_DIR", "/tmp/docx-fix")

# 规则文件目录
RULES_DIR = str(BACKEND_DIR / "rules")

# 脚本目录
SCRIPTS_DIR = str(BACKEND_DIR / "scripts")


# ========================================
# 文件上传限制
# ========================================

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


# ========================================
# Session 过期时间
# ========================================

SESSION_EXPIRE_SECONDS = 3600  # 1 小时
SESSION_CLEANUP_INTERVAL = 600  # 每 10 分钟清理一次


# ========================================
# LLM (DeepSeek) 配置
# ========================================

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
LLM_DEFAULT_MAX_TOKENS = 2048
LLM_DEFAULT_TEMPERATURE = 0.3  # 偏低温度，输出更稳定


# ========================================
# CORS 配置
# ========================================

# 从环境变量读取额外的 CORS 域名（逗号分隔）
_extra_origins = os.environ.get("CORS_EXTRA_ORIGINS", "")

CORS_ORIGINS = [
    "http://localhost:5173",  # Vite dev server
    "http://localhost:3000",
    "https://do-not-go-to.icu",
    "https://www.do-not-go-to.icu",
] + [o.strip() for o in _extra_origins.split(",") if o.strip()]


# ========================================
# 日志配置
# ========================================

def setup_logging() -> None:
    """配置全局日志格式。

    格式: [时间] [级别] [模块] 消息
    """
    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()

    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # 降低第三方库的日志级别
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
