"""
API 公共工具函数

提供路由层共用的安全校验、文件处理、Session 管理等工具，
消除各路由模块（check_routes / fix_routes / polish_routes 等）之间的重复代码。
"""

from __future__ import annotations

import json
import os
import re
import logging
from pathlib import Path
from typing import Optional

from fastapi import UploadFile, HTTPException

from api.schemas import ErrorResponse
from config import TEMP_DIR, MAX_FILE_SIZE
from services.rules_service import get_rules_list, get_rule_path

logger = logging.getLogger(__name__)

# session_id 合法格式：UUID v4
_SESSION_ID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


# ========================================
# Session ID 校验
# ========================================

def validate_session_id(session_id: str) -> str:
    """校验 session_id 格式，防止路径穿越攻击。"""
    if not _SESSION_ID_PATTERN.match(session_id):
        logger.warning(f"非法 session_id 被拦截: {session_id!r}")
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_SESSION_ID",
                message="会话 ID 格式无效"
            ).model_dump(),
        )
    return session_id


# ========================================
# 安全路径构建
# ========================================

def safe_session_dir(session_id: str) -> str:
    """根据已校验的 session_id 构建安全的 session 目录路径。"""
    session_dir = Path(TEMP_DIR) / session_id
    resolved = session_dir.resolve()
    temp_resolved = Path(TEMP_DIR).resolve()
    if not str(resolved).startswith(str(temp_resolved)):
        logger.error(f"路径穿越检测: session_id={session_id!r}, resolved={resolved}")
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_SESSION_ID",
                message="会话 ID 格式无效"
            ).model_dump(),
        )
    return str(session_dir)


def safe_filename(filename: str) -> str:
    """清理文件名，移除路径分隔符等危险字符。"""
    safe = Path(filename).name
    safe = safe.replace("/", "_").replace("\\", "_").replace("..", "_")
    if not safe:
        safe = "document.docx"
    return safe


# ========================================
# Session 管理
# ========================================

def touch_session(session_dir: str) -> None:
    """更新 session 目录的 mtime，防止活跃 session 被误清理。"""
    try:
        os.utime(session_dir, None)
    except OSError:
        pass


def read_session_meta(session_dir: str) -> dict:
    """读取 session 元信息。兼容旧格式 _meta.txt 和新格式 _meta.json。"""
    json_path = os.path.join(session_dir, "_meta.json")
    txt_path = os.path.join(session_dir, "_meta.txt")

    # 优先读取 JSON 格式
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    # 兼容旧的 _meta.txt 格式
    if os.path.exists(txt_path):
        try:
            with open(txt_path, "r", encoding="utf-8") as f:
                lines = f.read().strip().split("\n")
                meta = {"filename": lines[0] if lines else "unknown.docx"}
                if len(lines) > 1:
                    meta["rule_id"] = lines[1]
                return meta
        except OSError:
            pass

    return {}


def write_session_meta(session_dir: str, meta: dict) -> None:
    """写入 session 元信息（JSON 格式）。"""
    json_path = os.path.join(session_dir, "_meta.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


# ========================================
# 规则来源解析
# ========================================

class ResolvedRules:
    """规则解析结果，包含路径、名称和清理函数"""
    def __init__(self, path: str, name: str, tmpfile_path: Optional[str] = None):
        self.path = path
        self.name = name
        self._tmpfile_path = tmpfile_path

    def cleanup(self):
        """清理临时文件"""
        if self._tmpfile_path and os.path.exists(self._tmpfile_path):
            os.unlink(self._tmpfile_path)


def resolve_rules(rule_id: str, custom_rules_yaml: Optional[str] = None) -> ResolvedRules:
    """统一处理规则来源：自定义 YAML 或服务端预置规则。

    当 custom_rules_yaml 非空时，写入临时 YAML 文件并返回其路径。
    否则根据 rule_id 查找服务端预置规则。

    Raises:
        HTTPException: 规则无效或自定义规则内容无效
    """
    import tempfile

    if custom_rules_yaml:
        try:
            os.makedirs(TEMP_DIR, exist_ok=True)
            tmpfile = tempfile.NamedTemporaryFile(
                mode="w", suffix=".yaml", delete=False, dir=TEMP_DIR
            )
            tmpfile.write(custom_rules_yaml)
            tmpfile.close()
            return ResolvedRules(path=tmpfile.name, name="自定义规则", tmpfile_path=tmpfile.name)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="INVALID_CUSTOM_RULES",
                    message="自定义规则内容无效"
                ).model_dump(),
            )
    else:
        rules_path = get_rule_path(rule_id)
        if rules_path is None:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="INVALID_RULE",
                    message=f"规则 '{rule_id}' 不存在"
                ).model_dump(),
            )
        rule_name = rule_id
        for r in get_rules_list():
            if r.id == rule_id:
                rule_name = r.name
                break
        return ResolvedRules(path=rules_path, name=rule_name)


# ========================================
# 文件上传验证
# ========================================

async def validate_and_read_upload(file: UploadFile) -> bytes:
    """统一的文件上传验证：扩展名、大小、魔数校验。

    Returns:
        文件内容字节

    Raises:
        HTTPException: 文件类型/大小/内容无效
    """
    # 1. 验证文件扩展名
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_FILE_TYPE",
                message="仅支持 .docx 格式文件"
            ).model_dump(),
        )

    # 2. 流式读取文件并验证大小
    content = bytearray()
    chunk_size = 64 * 1024
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        content.extend(chunk)
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="FILE_TOO_LARGE",
                    message=f"文件大小超过限制（最大 {MAX_FILE_SIZE // 1024 // 1024}MB）"
                ).model_dump(),
            )
    content = bytes(content)

    # 3. 验证文件内容魔数
    if len(content) < 4 or content[:4] != b"PK\x03\x04":
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="INVALID_FILE_CONTENT",
                message="文件内容无效：不是有效的 .docx 文件（文件可能已损坏或被篡改）"
            ).model_dump(),
        )

    return content
