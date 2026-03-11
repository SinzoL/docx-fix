"""
polisher_service — 润色业务编排

协调段落提取、LLM 润色、回写应用等流程。
管理润色会话（session）的临时数据，支持磁盘持久化。
"""

from __future__ import annotations

import json
import os
import logging
import time
import threading
import uuid
from dataclasses import asdict
from typing import AsyncGenerator

from docx import Document

from config import TEMP_DIR, SESSION_EXPIRE_SECONDS
from scripts.polisher.text_extractor import TextExtractor, ParagraphSnapshot, RunInfo
from scripts.polisher.polish_engine import PolishEngine, PolishSuggestion
from scripts.polisher.text_writer import TextWriter
from scripts.polisher.rule_scanner import RuleScanner

logger = logging.getLogger(__name__)

# ========================================
# 润色 session 内存存储（带过期 + 大小限制）
# ========================================
_sessions: dict[str, dict] = {}
_sessions_lock = threading.Lock()

# 单个 session 最大存活时间（秒），与文件 session 一致
POLISH_SESSION_TTL = SESSION_EXPIRE_SECONDS  # 1 小时
# 内存中最多保留的 session 数量（防 OOM）
MAX_POLISH_SESSIONS = 50

# 磁盘持久化文件名
_SESSION_PERSIST_FILE = "_polish_session.json"


def _touch_polish_session(session_id: str) -> None:
    """更新润色 session 的最后访问时间"""
    session = _sessions.get(session_id)
    if session:
        session["_last_access"] = time.time()


def cleanup_expired_polish_sessions() -> int:
    """清理过期的润色 session 内存数据，返回清理数量。
    由 app.py 的后台清理任务定期调用。"""
    now = time.time()
    expired_ids = []
    with _sessions_lock:
        for sid, session in _sessions.items():
            last_access = session.get("_last_access", session.get("_created_at", 0))
            if now - last_access > POLISH_SESSION_TTL:
                expired_ids.append(sid)
        for sid in expired_ids:
            del _sessions[sid]
    if expired_ids:
        logger.info(f"清理了 {len(expired_ids)} 个过期润色 session（内存）")
    return len(expired_ids)


def _evict_if_needed() -> None:
    """如果 session 数量超过上限，淘汰最旧的 session"""
    with _sessions_lock:
        if len(_sessions) <= MAX_POLISH_SESSIONS:
            return
        # 按最后访问时间排序，淘汰最旧的
        sorted_sessions = sorted(
            _sessions.items(),
            key=lambda kv: kv[1].get("_last_access", 0),
        )
        evict_count = len(_sessions) - MAX_POLISH_SESSIONS
        for sid, _ in sorted_sessions[:evict_count]:
            del _sessions[sid]
        logger.info(f"淘汰了 {evict_count} 个最旧的润色 session（内存上限 {MAX_POLISH_SESSIONS}）")


def _session_dir(session_id: str) -> str:
    """获取 session 的临时目录路径"""
    return os.path.join(TEMP_DIR, session_id)


# ========================================
# 磁盘持久化：序列化 / 反序列化
# ========================================

def _serialize_session_to_disk(session_id: str, session: dict) -> None:
    """将 session 的关键数据序列化到磁盘 JSON 文件。

    持久化的字段：file_path, filename, snapshots, suggestions_data, applied,
    polished_path, polished_filename, _applied_count, _created_at, _last_access。

    ParagraphSnapshot / RunInfo 通过 dataclasses.asdict 转换为 dict。
    """
    session_dir = _session_dir(session_id)
    os.makedirs(session_dir, exist_ok=True)
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

    如果恢复成功，自动存入 _sessions 字典并返回；
    如果磁盘文件不存在或已过期，返回 None。
    """
    session_dir = _session_dir(session_id)
    persist_path = os.path.join(session_dir, _SESSION_PERSIST_FILE)

    if not os.path.exists(persist_path):
        return None

    try:
        with open(persist_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # 检查是否过期（基于 _created_at）
        created_at = data.get("_created_at", 0)
        if time.time() - created_at > POLISH_SESSION_TTL:
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

        # 存入内存并返回
        _evict_if_needed()
        _sessions[session_id] = session
        logger.info(f"[{session_id}] session 已从磁盘恢复到内存")
        return session

    except Exception as e:
        logger.warning(f"[{session_id}] 从磁盘恢复 session 失败: {e}")
        return None


def _get_session(session_id: str) -> dict | None:
    """获取 session：先查内存，miss 后尝试从磁盘恢复"""
    session = _sessions.get(session_id)
    if session is not None:
        return session
    return _restore_session_from_disk(session_id)


def check_session_exists(session_id: str) -> dict:
    """检查 session 是否存在且可用。

    Returns:
        {"exists": True/False, "applied": bool, "filename": str}
    """
    session = _get_session(session_id)
    if session is None:
        return {"exists": False, "applied": False, "filename": ""}

    _touch_polish_session(session_id)
    return {
        "exists": True,
        "applied": session.get("applied", False),
        "filename": session.get("filename", ""),
    }


async def polish_file(
    file_path: str,
    filename: str,
    session_id: str,
    enable_reviewer: bool = True,
) -> AsyncGenerator[str, None]:
    """编排润色流程：提取 → 润色 → SSE 推送

    Args:
        file_path: 上传文件的临时路径
        filename: 原始文件名
        session_id: 会话 ID
        enable_reviewer: 是否启用 Reviewer Agent

    Yields:
        SSE 格式的事件字符串 ("event: xxx\ndata: {...}\n\n")
    """
    # 1. 打开文档 + 提取段落
    doc = Document(file_path)
    extractor = TextExtractor(doc)
    snapshots = extractor.extract_paragraphs()

    logger.info(
        f"[{session_id}] 提取完成：{len(snapshots)} 段落，"
        f"其中 {sum(1 for s in snapshots if s.is_polishable)} 段可润色"
    )

    # 2. 保存 session 数据（带时间戳）
    _evict_if_needed()
    now = time.time()
    _sessions[session_id] = {
        "file_path": file_path,
        "filename": filename,
        "snapshots": snapshots,
        "suggestions": [],
        "applied": False,
        "_created_at": now,
        "_last_access": now,
    }

    # 3. 规则扫描阶段（毫秒级，先于 LLM 润色）
    rule_scanner = RuleScanner()
    rule_suggestions = rule_scanner.scan_document(doc, snapshots)

    if rule_suggestions:
        logger.info(
            f"[{session_id}] 规则扫描检出 {len(rule_suggestions)} 条建议"
        )
        yield _format_sse("rule_scan_complete", {
            "suggestions": rule_suggestions,
            "count": len(rule_suggestions),
        })

    # 4. 分批 LLM 润色（SSE 流式）
    engine = PolishEngine(
        enable_reviewer=enable_reviewer,
        batch_size=5,
        context_window=2,
    )

    llm_suggestions: list[dict] = []

    async for event in engine.polish_document(snapshots):
        event_name = event["event"]
        event_data = event["data"]

        # 收集 LLM 建议
        if event_name == "batch_complete":
            batch_suggestions = event_data.get("suggestions", [])
            llm_suggestions.extend(batch_suggestions)

        if event_name == "complete":
            # 用 complete 事件中的完整 suggestions
            llm_suggestions = event_data.get("suggestions", [])

            # 5. 合并规则建议 + LLM 建议
            all_suggestions = _merge_suggestions(rule_suggestions, llm_suggestions)

            # 重新构建 summary（包含合并后的统计）
            merged_summary = _build_merged_summary(
                event_data.get("summary", {}),
                rule_suggestions,
                all_suggestions,
            )

            # 将合并后的数据存入 session
            _sessions[session_id]["suggestions_data"] = all_suggestions
            event_data["suggestions"] = all_suggestions
            event_data["summary"] = merged_summary
            event_data["session_id"] = session_id
            event_data["filename"] = filename

            # 持久化 session 到磁盘（后端重启后仍可恢复）
            _serialize_session_to_disk(session_id, _sessions[session_id])

        yield _format_sse(event_name, event_data)

    logger.info(f"[{session_id}] 润色完成（规则 {len(rule_suggestions)} + LLM {len(llm_suggestions)} → 合并 {len(_sessions[session_id].get('suggestions_data', []))} 条）")


async def apply_polish(
    session_id: str,
    accepted_indices: list[int],
) -> dict:
    """应用用户选中的润色修改

    Args:
        session_id: 会话 ID
        accepted_indices: 用户接受的建议索引列表

    Returns:
        {"session_id", "filename", "applied_count", "download_url"}

    Raises:
        ValueError: session 不存在或已应用
    """
    session = _get_session(session_id)
    if not session:
        raise ValueError(f"润色会话 '{session_id}' 不存在或已过期")

    _touch_polish_session(session_id)

    # 幂等保护：如果已应用，直接返回上次结果（而不是报错）
    if session.get("applied"):
        polished_path = session.get("polished_path")
        if polished_path and os.path.exists(polished_path):
            return {
                "session_id": session_id,
                "filename": session["filename"],
                "applied_count": session.get("_applied_count", 0),
                "download_url": f"/api/polish/download/{session_id}",
            }
        raise ValueError(f"会话 '{session_id}' 的修改已被应用但文件已失效")

    # 立即标记为已应用（防止并发双击）
    session["applied"] = True

    file_path = session["file_path"]
    filename = session["filename"]
    snapshots: list[ParagraphSnapshot] = session["snapshots"]
    suggestions_data: list[dict] = session.get("suggestions_data", [])

    # 过滤用户接受的建议
    accepted_suggestions = []
    for idx in accepted_indices:
        if 0 <= idx < len(suggestions_data):
            sd = suggestions_data[idx]
            suggestion = PolishSuggestion(
                paragraph_index=sd["paragraph_index"],
                original_text=sd["original_text"],
                polished_text=sd["polished_text"],
                change_type=sd["change_type"],
            )
            accepted_suggestions.append(suggestion)

    if not accepted_suggestions:
        # 回滚标记
        session["applied"] = False
        raise ValueError("没有有效的润色建议被选中")

    # 打开文档并应用修改
    try:
        doc = Document(file_path)
        writer = TextWriter(doc)
        applied_count = writer.apply_suggestions(accepted_suggestions, snapshots)

        # 保存修改后的文件
        session_dir = _session_dir(session_id)
        os.makedirs(session_dir, exist_ok=True)

        base, ext = os.path.splitext(filename)
        polished_filename = f"{base}_polished{ext}"
        output_path = os.path.join(session_dir, polished_filename)

        writer.save(output_path)
    except Exception:
        # 操作失败，回滚标记允许重试
        session["applied"] = False
        raise

    # 持久化应用结果（用于幂等返回）
    session["polished_path"] = output_path
    session["polished_filename"] = polished_filename
    session["_applied_count"] = applied_count

    # 更新磁盘持久化数据
    _serialize_session_to_disk(session_id, session)

    logger.info(
        f"[{session_id}] 应用了 {applied_count}/{len(accepted_suggestions)} 条修改"
    )

    return {
        "session_id": session_id,
        "filename": filename,
        "applied_count": applied_count,
        "download_url": f"/api/polish/download/{session_id}",
    }


def get_polished_file(session_id: str) -> tuple[str, str]:
    """获取润色后的文件路径和文件名

    Returns:
        (file_path, filename)

    Raises:
        ValueError: session 不存在或文件未就绪
    """
    session = _get_session(session_id)
    if not session:
        raise ValueError(f"润色会话 '{session_id}' 不存在或已过期")

    _touch_polish_session(session_id)

    polished_path = session.get("polished_path")
    if not polished_path or not os.path.exists(polished_path):
        raise ValueError("润色后的文件不存在，请先应用修改")

    return polished_path, session.get("polished_filename", "polished.docx")


def _format_sse(event: str, data: dict) -> str:
    """格式化为 SSE 字符串"""
    json_str = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {json_str}\n\n"


def _merge_suggestions(
    rule_suggestions: list[dict],
    llm_suggestions: list[dict],
) -> list[dict]:
    """合并规则建议和 LLM 建议，处理冲突去重。

    去重策略：
    1. 不同段落 → 直接合并
    2. 同段落 + 不同类型修改 → 两条都保留
    3. 同段落 + 同类型（都改标点等）→ 优先保留 LLM 的（更全面）

    排序策略：按段落索引排序，同段落内规则建议排在前。

    Returns:
        合并后的建议列表
    """
    if not rule_suggestions and not llm_suggestions:
        return []
    if not rule_suggestions:
        return llm_suggestions
    if not llm_suggestions:
        return rule_suggestions

    # 构建 LLM 建议的段落索引 → 类型集合 映射
    llm_by_para: dict[int, dict[str, dict]] = {}
    for s in llm_suggestions:
        para_idx = s.get("paragraph_index", -1)
        change_type = s.get("change_type", "")
        if para_idx not in llm_by_para:
            llm_by_para[para_idx] = {}
        llm_by_para[para_idx][change_type] = s

    # 过滤规则建议：如果 LLM 已经对同段落做了相同类型的修改，跳过规则建议
    # 映射规则类型 → LLM 类型
    rule_type_overlap = {
        "rule_punctuation": "punctuation",
        "rule_space": "wording",     # LLM 可能在用词优化中处理空格
        "rule_fullwidth": "punctuation",
    }

    filtered_rules: list[dict] = []
    for rs in rule_suggestions:
        para_idx = rs.get("paragraph_index", -1)
        rule_type = rs.get("change_type", "")
        llm_types = llm_by_para.get(para_idx, {})

        # 检查 LLM 是否已对同段落做了涵盖性修改
        mapped_llm_type = rule_type_overlap.get(rule_type)
        if mapped_llm_type and mapped_llm_type in llm_types:
            # LLM 已做了对应修改，跳过规则建议
            continue
        filtered_rules.append(rs)

    # 合并并排序
    all_suggestions = filtered_rules + llm_suggestions
    all_suggestions.sort(key=lambda s: (s.get("paragraph_index", 0), 0 if s.get("source") == "rule" else 1))

    return all_suggestions


def _build_merged_summary(
    llm_summary: dict,
    rule_suggestions: list[dict],
    all_suggestions: list[dict],
) -> dict:
    """构建合并后的统计信息。

    基于 LLM 的 summary，加入规则建议的统计。

    Returns:
        合并后的 summary dict
    """
    summary = dict(llm_summary) if llm_summary else {}

    # 重新计算 by_type
    by_type: dict[str, int] = {}
    for s in all_suggestions:
        ct = s.get("change_type", "unknown")
        by_type[ct] = by_type.get(ct, 0) + 1
    summary["by_type"] = by_type

    # 更新 total_suggestions
    summary["total_suggestions"] = len(all_suggestions)

    # 更新 modified_paragraphs（去重段落索引）
    para_indices = set(s.get("paragraph_index", -1) for s in all_suggestions)
    summary["modified_paragraphs"] = len(para_indices)

    # 新增 by_source 统计
    rule_count = sum(1 for s in all_suggestions if s.get("source") == "rule")
    llm_count = sum(1 for s in all_suggestions if s.get("source") != "rule")
    summary["by_source"] = {"rule": rule_count, "llm": llm_count}

    return summary
