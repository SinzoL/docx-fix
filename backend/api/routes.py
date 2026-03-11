"""
API 路由注册入口

将各功能域的路由统一注册到一个 router 上，
由 app.py 通过 include_router(router, prefix="/api") 挂载。
"""

from fastapi import APIRouter

from api.rule_routes import rule_router
from api.check_routes import check_router
from api.fix_routes import fix_router
from api.extract_routes import extract_router

router = APIRouter()

# 注册各功能域子路由
router.include_router(rule_router)
router.include_router(check_router)
router.include_router(fix_router)
router.include_router(extract_router)
