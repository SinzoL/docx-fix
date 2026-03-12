"""
polish_session_store — 润色 session 持久化存储

从 polisher_service.py 抽取的润色 session 管理逻辑：
- 磁盘序列化/反序列化（ParagraphSnapshot ↔ JSON）
- 内存缓存 get/set（委托给 SessionManager）
- session 有效性检查
- 过期清理入口

polisher_service.py 只负责业务编排，不再直接操作 session 存储。
"""

from __future__ import annotations

import json
import os
import logging
import time
from dataclasses import asdict

from config import SESSION_EXPIRE_SECONDS
from engine.polisher.text_extractor import ParagraphSnapshot, RunInfo
from services.session_manager import session_manager

logger = logging.getLogger(__name__)

# 磁盘持久化文件名
_SESSION_PERSIST_FILE = "_polish_session.json"

# TTL（用于磁盘恢复时判断过期）
_POLISH_SESSION_TTL = SESSION_EXPIRE_SECONDS


# ========================================
# 过期清理（供 app.py 调用）
# ========================================

def cleanup_expired_polish_sessions() -> int:
    """清理过期的润色 session 内存数据，返回清理数量。
    由 app.py 的后台清理任务定期调用。
    委托给 SessionManager。
    """
    return session_manager.cleanup_expired_memory_sessions()


# ========================================
# 磁盘持久化：序列化 / 反序列化
# ========================================

def serialize_session_to_disk(session_id: str, session: dict) -> None:
    """将 session 的关键数据序列化到磁盘 JSON 文件。

    持久化的字段：file_path, filename, snapshots, suggestions_data, applied,
    polished_path, polished_filename, _applied_count, _created_at, _last_access。

    ParagraphSnapshot / RunInfo 通过 dataclasses.asdict 转换为 dict。
    """
    session_dir = session_manager.create_session_dir(session_id)
    persist_path = os.path.join(session_dir, _SESSION_PERSIST_FILE)

    try:
        # 将 ParagraphSnapshot 列表序列化为 dict 列表
        snapshots_data = []
        for snap in session.get("snapshots", []):
            if isinstance(snap, ParagraphSnapshot):
                snapshots_data.append(asdict(snap))
            elif isinstance(snap, dict):
                snapshots_data.append(snap)

        persist_data = {
            "file_path": session.get("file_path"),
            "filename": session.get("filename"),
            "snapshots": snapshots_data,
            "suggestions_data": session.get("suggestions_data", []),
            "applied": session.get("applied", False),
            "polished_path": session.get("polished_path"),
            "polished_filename": session.get("polished_filename"),
            "_applied_count": session.get("_applied_count", 0),
            "_created_at": session.get("_created_at", time.time()),
            "_last_access": session.get("_last_access", time.time()),
        }

        with open(persist_path, "w", encoding="utf-8") as f:
            json.dump(persist_data, f, ensure_ascii=False)

        logger.debug(f"[{session_id}] session 已持久化到磁盘")
    except Exception as e:
        logger.warning(f"[{session_id}] session 持久化失败: {e}")


def _deserialize_snapshots(snapshots_data: list[dict]) -> list[ParagraphSnapshot]:
    """从 dict 列表反序列化为 ParagraphSnapshot 列表"""
    snapshots = []
    for sd in snapshots_data:
        runs = []
        for rd in sd.get("runs", []):
            runs.append(RunInfo(**rd))
        snap = ParagraphSnapshot(
            index=sd["index"],
            text=sd["text"],
            style_name=sd["style_name"],
            element_type=sd["element_type"],
            runs=runs,
            is_polishable=sd.get("is_polishable", True),
            skip_reason=sd.get("skip_reason"),
        )
        snapshots.append(snap)
    return snapshots


def _restore_session_from_disk(session_id: str) -> dict | None:
    """尝试从磁盘恢复 session 数据到内存。

    如果恢复成功，自动存入 SessionManager 并返回；
    如果磁盘文件不存在或已过期，返回 None。
    """
    session_dir = session_manager.session_dir(session_id)
    persist_path = os.path.join(session_dir, _SESSION_PERSIST_FILE)

    if not os.path.exists(persist_path):
        return None

    try:
        with open(persist_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # 检查是否过期（基于 _created_at）
        created_at = data.get("_created_at", 0)
        if time.time() - created_at > _POLISH_SESSION_TTL:
            logger.info(f"[{session_id}] 磁盘 session 已过期，跳过恢复")
            return None

        # 检查原始文件是否还存在
        file_path = data.get("file_path")
        if not file_path or not os.path.exists(file_path):
            logger.info(f"[{session_id}] 原始文件已不存在，无法恢复 session")
            return None

        # 反序列化 snapshots
        snapshots = _deserialize_snapshots(data.get("snapshots", []))

        # 构建内存 session
        now = time.time()
        session = {
            "file_path": data["file_path"],
            "filename": data["filename"],
            "snapshots": snapshots,
            "suggestions_data": data.get("suggestions_data", []),
            "applied": data.get("applied", False),
            "polished_path": data.get("polished_path"),
            "polished_filename": data.get("polished_filename"),
            "_applied_count": data.get("_applied_count", 0),
            "_created_at": created_at,
            "_last_access": now,
        }

        # 存入 SessionManager 内存并返回
        session_manager.set_memory_session(session_id, session)
        logger.info(f"[{session_id}] session 已从磁盘恢复到内存")
        return session

    except Exception as e:
        logger.warning(f"[{session_id}] 从磁盘恢复 session 失败: {e}")
        return None


# ========================================
# 公共 API
# ========================================

def get_session(session_id: str) -> dict | None:
    """获取 session：先查内存，miss 后尝试从磁盘恢复"""
    session = session_manager.get_memory_session(session_id)
    if session is not None:
        return session
    return _restore_session_from_disk(session_id)


def check_session_exists(session_id: str) -> dict:
    """检查 session 是否存在且可用。

    除了检查内存/磁盘 session 元数据是否存在，还会验证
    底层文件是否真正存在（防止磁盘已被清理但内存未同步）。

    Returns:
        {"exists": True/False, "applied": bool, "filename": str}
    """
    session = get_session(session_id)
    if session is None:
        return {"exists": False, "applied": False, "filename": ""}

    # 验证底层文件是否仍然存在（防止磁盘已被清理）
    file_path = session.get("file_path")
    if not file_path or not os.path.exists(file_path):
        # 磁盘文件已丢失，清理内存中的无效 session
        session_manager.remove_memory_session(session_id)
        return {"exists": False, "applied": False, "filename": ""}

    session_manager.touch(session_id)
    return {
        "exists": True,
        "applied": session.get("applied", False),
        "filename": session.get("filename", ""),
    }
