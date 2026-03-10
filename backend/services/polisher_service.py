"""
polisher_service — 润色业务编排

协调段落提取、LLM 润色、回写应用等流程。
管理润色会话（session）的临时数据。
"""

from __future__ import annotations

import json
import os
import logging
import uuid
from typing import AsyncGenerator

from docx import Document

from config import TEMP_DIR
from scripts.polisher.text_extractor import TextExtractor, ParagraphSnapshot
from scripts.polisher.polish_engine import PolishEngine, PolishSuggestion
from scripts.polisher.text_writer import TextWriter

logger = logging.getLogger(__name__)

# 内存中的 session 数据（简单实现，生产环境应使用 Redis）
_sessions: dict[str, dict] = {}


def _session_dir(session_id: str) -> str:
    """获取 session 的临时目录路径"""
    return os.path.join(TEMP_DIR, session_id)


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

    # 2. 保存 session 数据
    _sessions[session_id] = {
        "file_path": file_path,
        "filename": filename,
        "snapshots": snapshots,
        "suggestions": [],
        "applied": False,
    }

    # 3. 分批润色（SSE 流式）
    engine = PolishEngine(
        enable_reviewer=enable_reviewer,
        batch_size=5,
        context_window=2,
    )

    async for event in engine.polish_document(snapshots):
        event_name = event["event"]
        event_data = event["data"]

        # 收集所有建议
        if event_name == "complete":
            # 将 suggestions 存入 session
            suggestions_data = event_data.get("suggestions", [])
            _sessions[session_id]["suggestions_data"] = suggestions_data
            # 注入 session_id 和 filename
            event_data["session_id"] = session_id
            event_data["filename"] = filename

        yield _format_sse(event_name, event_data)

    logger.info(f"[{session_id}] 润色完成")


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
    session = _sessions.get(session_id)
    if not session:
        raise ValueError(f"润色会话 '{session_id}' 不存在或已过期")

    if session.get("applied"):
        raise ValueError(f"会话 '{session_id}' 的修改已被应用")

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
        raise ValueError("没有有效的润色建议被选中")

    # 打开文档并应用修改
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

    # 标记为已应用
    session["applied"] = True
    session["polished_path"] = output_path
    session["polished_filename"] = polished_filename

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
    session = _sessions.get(session_id)
    if not session:
        raise ValueError(f"润色会话 '{session_id}' 不存在或已过期")

    polished_path = session.get("polished_path")
    if not polished_path or not os.path.exists(polished_path):
        raise ValueError("润色后的文件不存在，请先应用修改")

    return polished_path, session.get("polished_filename", "polished.docx")


def _format_sse(event: str, data: dict) -> str:
    """格式化为 SSE 字符串"""
    json_str = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {json_str}\n\n"
