"""
session_manager — 统一 Session 管理

为 check / polish 模块提供统一的 Session 生命周期管理：
- create: 创建 session（磁盘目录 + 可选内存缓存）
- get: 获取 session（先查内存，miss 后尝试磁盘恢复）
- touch: 续命（更新内存 _last_access + 磁盘 mtime）
- cleanup: 定期清理过期 session（磁盘 + 内存）
- evict: LRU 淘汰超限 session（内存）

设计原则：
- check 模块只使用磁盘 session（元信息 _meta.json + 上传文件）
- polish 模块使用内存缓存 + 磁盘持久化（snapshots、suggestions 等大对象）
- 两个模块共享同一套磁盘目录管理和清理时钟
"""

from __future__ import annotations

import json
import os
import shutil
import logging
import time
import threading

from config import TEMP_DIR, SESSION_EXPIRE_SECONDS

logger = logging.getLogger(__name__)

# ========================================
# 常量
# ========================================

# 单个 session 最大存活时间（秒）
SESSION_TTL = SESSION_EXPIRE_SECONDS  # 1 小时

# 内存中最多保留的 session 数量（防 OOM）
MAX_MEMORY_SESSIONS = 50


class SessionManager:
    """统一 Session 管理器

    管理磁盘 session 目录和内存 session 缓存。
    check 模块仅依赖磁盘目录（_meta.json）；
    polish 模块额外依赖内存缓存（snapshots / suggestions）。
    """

    def __init__(
        self,
        temp_dir: str = TEMP_DIR,
        ttl: int = SESSION_TTL,
        max_memory_sessions: int = MAX_MEMORY_SESSIONS,
    ):
        self._temp_dir = temp_dir
        self._ttl = ttl
        self._max_memory_sessions = max_memory_sessions

        # 内存 session 存储（供 polish 等需要内存缓存的模块使用）
        self._sessions: dict[str, dict] = {}
        self._lock = threading.Lock()

    # ========================================
    # 磁盘 session 目录管理
    # ========================================

    def session_dir(self, session_id: str) -> str:
        """获取 session 的磁盘目录路径"""
        return os.path.join(self._temp_dir, session_id)

    def create_session_dir(self, session_id: str) -> str:
        """创建 session 磁盘目录，返回目录路径"""
        sd = self.session_dir(session_id)
        os.makedirs(sd, exist_ok=True)
        return sd

    def session_dir_exists(self, session_id: str) -> bool:
        """检查 session 磁盘目录是否存在"""
        return os.path.exists(self.session_dir(session_id))

    # ========================================
    # 磁盘元信息读写（_meta.json / 兼容 _meta.txt）
    # ========================================

    def read_meta(self, session_id: str) -> dict:
        """读取 session 元信息。兼容旧格式 _meta.txt 和新格式 _meta.json。"""
        sd = self.session_dir(session_id)
        json_path = os.path.join(sd, "_meta.json")
        txt_path = os.path.join(sd, "_meta.txt")

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

    def write_meta(self, session_id: str, meta: dict) -> None:
        """写入 session 元信息（JSON 格式）。"""
        sd = self.session_dir(session_id)
        json_path = os.path.join(sd, "_meta.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

    # ========================================
    # touch — 续命
    # ========================================

    def touch(self, session_id: str) -> None:
        """续命：更新磁盘目录 mtime + 内存 _last_access。

        同时更新两者，避免 app.py 后台清理任务按 mtime 删除目录
        而内存 session 还在的不一致问题。
        """
        # 磁盘续命
        sd = self.session_dir(session_id)
        try:
            os.utime(sd, None)
        except OSError:
            pass

        # 内存续命（线程安全）
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session["_last_access"] = time.time()

    # ========================================
    # 内存 session CRUD
    # ========================================

    def create_memory_session(self, session_id: str, data: dict) -> dict:
        """创建内存 session（用于 polish 等需要内存缓存的场景）。

        自动添加 _created_at 和 _last_access 时间戳，并执行 LRU 淘汰。
        """
        now = time.time()
        data.setdefault("_created_at", now)
        data.setdefault("_last_access", now)
        with self._lock:
            self._evict_if_needed_locked()
            self._sessions[session_id] = data
        return data

    def get_memory_session(self, session_id: str) -> dict | None:
        """获取内存 session（仅查内存，不尝试磁盘恢复）"""
        return self._sessions.get(session_id)

    def set_memory_session(self, session_id: str, data: dict) -> None:
        """直接设置内存 session（用于磁盘恢复后存入内存）"""
        with self._lock:
            self._evict_if_needed_locked()
            self._sessions[session_id] = data

    def remove_memory_session(self, session_id: str) -> None:
        """从内存中移除 session"""
        with self._lock:
            self._sessions.pop(session_id, None)

    # ========================================
    # cleanup — 过期清理
    # ========================================

    def cleanup_expired_disk_sessions(self) -> int:
        """清理过期的磁盘 session 目录，返回清理数量。

        遍历 TEMP_DIR 下所有子目录，按 mtime 判断是否过期。
        """
        if not os.path.exists(self._temp_dir):
            return 0

        now = time.time()
        cleaned = 0
        for entry in os.listdir(self._temp_dir):
            session_path = os.path.join(self._temp_dir, entry)
            if os.path.isdir(session_path):
                try:
                    mtime = os.path.getmtime(session_path)
                    if now - mtime > self._ttl:
                        shutil.rmtree(session_path, ignore_errors=True)
                        cleaned += 1
                except OSError:
                    pass

        if cleaned > 0:
            logger.info(f"清理了 {cleaned} 个过期 session 目录")
        return cleaned

    def cleanup_expired_memory_sessions(self) -> int:
        """清理过期的内存 session，返回清理数量。"""
        now = time.time()
        expired_ids = []
        with self._lock:
            for sid, session in self._sessions.items():
                last_access = session.get("_last_access", session.get("_created_at", 0))
                if now - last_access > self._ttl:
                    expired_ids.append(sid)
            for sid in expired_ids:
                del self._sessions[sid]

        if expired_ids:
            logger.info(f"清理了 {len(expired_ids)} 个过期内存 session")
        return len(expired_ids)

    def cleanup_all_expired(self) -> tuple[int, int]:
        """清理所有过期 session（磁盘 + 内存），返回 (磁盘清理数, 内存清理数)"""
        disk_count = self.cleanup_expired_disk_sessions()
        mem_count = self.cleanup_expired_memory_sessions()
        return disk_count, mem_count

    # ========================================
    # evict — LRU 淘汰
    # ========================================

    def _evict_if_needed(self) -> None:
        """如果内存 session 数量超过上限，淘汰最旧的 session（自动加锁）"""
        with self._lock:
            self._evict_if_needed_locked()

    def _evict_if_needed_locked(self) -> None:
        """内部方法：淘汰最旧 session（调用方必须已持有 self._lock）"""
        if len(self._sessions) <= self._max_memory_sessions:
            return
        sorted_sessions = sorted(
            self._sessions.items(),
            key=lambda kv: kv[1].get("_last_access", 0),
        )
        evict_count = len(self._sessions) - self._max_memory_sessions
        for sid, _ in sorted_sessions[:evict_count]:
            del self._sessions[sid]
        logger.info(
            f"淘汰了 {evict_count} 个最旧的内存 session（上限 {self._max_memory_sessions}）"
        )


# ========================================
# 全局单例
# ========================================
session_manager = SessionManager()
