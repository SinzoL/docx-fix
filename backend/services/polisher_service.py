"""
polisher_service — 润色业务编排

协调段落提取、LLM 润色、回写应用等流程。
Session 管理逻辑已抽取到 services.polish_session_store。
"""

from __future__ import annotations

import json
import os
import logging
from typing import AsyncGenerator

from docx import Document

from engine.polisher.text_extractor import TextExtractor, ParagraphSnapshot
from engine.polisher.polish_engine import PolishEngine, PolishSuggestion
from engine.polisher.text_writer import TextWriter
from engine.polisher.rule_scanner import RuleScanner
from services.session_manager import session_manager
from services.polish_session_store import (
    serialize_session_to_disk,
    get_session,
    check_session_exists,  # noqa: F401 — re-export for polish_routes.py
)

logger = logging.getLogger(__name__)


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

    # 2. 保存 session 数据（通过 SessionManager）
    session_data = {
        "file_path": file_path,
        "filename": filename,
        "snapshots": snapshots,
        "suggestions": [],
        "applied": False,
    }
    session = session_manager.create_memory_session(session_id, session_data)

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
            session["suggestions_data"] = all_suggestions
            event_data["suggestions"] = all_suggestions
            event_data["summary"] = merged_summary
            event_data["session_id"] = session_id
            event_data["filename"] = filename

            # 持久化 session 到磁盘（后端重启后仍可恢复）
            serialize_session_to_disk(session_id, session)

        yield _format_sse(event_name, event_data)

    logger.info(f"[{session_id}] 润色完成（规则 {len(rule_suggestions)} + LLM {len(llm_suggestions)} → 合并 {len(session.get('suggestions_data', []))} 条）")


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
    session = get_session(session_id)
    if not session:
        raise ValueError(f"润色会话 '{session_id}' 不存在或已过期")

    session_manager.touch(session_id)

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
        session_dir = session_manager.create_session_dir(session_id)

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
    serialize_session_to_disk(session_id, session)

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
    session = get_session(session_id)
    if not session:
        raise ValueError(f"润色会话 '{session_id}' 不存在或已过期")

    session_manager.touch(session_id)

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
