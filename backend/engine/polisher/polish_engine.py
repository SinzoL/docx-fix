"""
PolishEngine — LLM 润色引擎

分批调用 LLM 对文档段落进行学术表达优化，支持：
- 分批处理（每批 5-8 段）
- 上下文窗口（前后各 N 段）
- JSON 解析 + 重试机制
- 可选的 Reviewer Agent 语义审核
- SSE 流式生成器
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import AsyncGenerator, Optional

from services import llm_service
from services.ai_prompts import build_polish_messages, build_reviewer_messages
from engine.polisher.text_extractor import ParagraphSnapshot, TextExtractor

logger = logging.getLogger(__name__)


@dataclass
class ChangeDetail:
    """单个修改点的详情"""
    type: str           # "grammar" | "wording" | "punctuation" | "structure" | "academic"
    original: str       # 被修改的原始片段
    revised: str        # 修改后的片段
    explanation: str    # 修改理由


@dataclass
class PolishSuggestion:
    """单条润色建议"""
    paragraph_index: int                    # 段落索引（在 doc.paragraphs 中的位置）
    original_text: str                      # 原始文本
    polished_text: str                      # 润色后文本
    change_type: str                        # 主要修改类型
    changes: list[ChangeDetail] = field(default_factory=list)
    explanation: str = ""                   # 总体修改说明
    confidence: float = 0.8                 # 置信度
    semantic_warning: bool = False          # Reviewer 是否标记语义偏移
    semantic_warning_text: Optional[str] = None  # 语义偏移说明
    source: str = "llm"                      # 建议来源: "llm"(LLM润色) | "rule"(规则引擎)


class PolishEngine:
    """LLM 润色引擎 — 分批润色 + 可选 Reviewer 审核"""

    MAX_RETRIES = 2  # LLM 调用最大重试次数

    def __init__(
        self,
        enable_reviewer: bool = True,
        batch_size: int = 5,
        context_window: int = 2,
    ) -> None:
        self.enable_reviewer = enable_reviewer
        self.batch_size = batch_size
        self.context_window = context_window

    async def polish_batch(
        self,
        batch: list[ParagraphSnapshot],
        all_paragraphs: list[ParagraphSnapshot],
    ) -> list[PolishSuggestion]:
        """润色一批段落

        Args:
            batch: 待润色的段落快照列表
            all_paragraphs: 全部段落快照（用于构建上下文窗口）

        Returns:
            该批段落的润色建议列表（仅包含有修改的段落）
        """
        if not batch:
            return []

        # 构建上下文（使用第一个段落的上下文）
        first_idx = batch[0].index
        context = self._build_context(first_idx, all_paragraphs, self.context_window)

        # 调用 Polisher Agent
        target_texts = [s.text for s in batch]
        raw_results = await self._call_polisher(batch, context)

        if not raw_results:
            return []

        # 解析为 PolishSuggestion
        suggestions = []
        for i, result in enumerate(raw_results):
            if i >= len(batch):
                break

            modified = result.get("modified", False)
            if not modified:
                continue

            polished = result.get("polished", "")
            if not polished or polished == batch[i].text:
                continue

            changes_raw = result.get("changes", [])
            changes = [
                ChangeDetail(
                    type=c.get("type", "grammar"),
                    original=c.get("original", ""),
                    revised=c.get("revised", ""),
                    explanation=c.get("explanation", ""),
                )
                for c in changes_raw
            ]

            # 主要修改类型取第一个 change 的类型
            change_type = changes[0].type if changes else "grammar"
            explanation = "; ".join(c.explanation for c in changes if c.explanation)

            suggestion = PolishSuggestion(
                paragraph_index=batch[i].index,
                original_text=batch[i].text,
                polished_text=polished,
                change_type=change_type,
                changes=changes,
                explanation=explanation,
            )
            suggestions.append(suggestion)

        # 调用 Reviewer Agent（如果启用）
        if self.enable_reviewer and suggestions:
            try:
                original_texts = [s.original_text for s in suggestions]
                polished_texts = [s.polished_text for s in suggestions]
                reviewer_results = await self._call_reviewer(original_texts, polished_texts)

                for j, result in enumerate(reviewer_results):
                    if j < len(suggestions):
                        preserved = result.get("semantic_preserved", True)
                        if not preserved:
                            suggestions[j].semantic_warning = True
                            suggestions[j].semantic_warning_text = result.get("warning", "语义可能有变化")
            except Exception as e:
                logger.warning(f"Reviewer Agent 调用失败，跳过语义审核: {e}")

        return suggestions

    async def polish_document(
        self,
        snapshots: list[ParagraphSnapshot],
    ) -> AsyncGenerator[dict, None]:
        """润色整个文档（SSE 流式生成器）

        分批处理所有可润色段落，每完成一批 yield 一个事件。

        Yields:
            SSE 事件 dict:
            - {"event": "progress", "data": {...}}
            - {"event": "batch_complete", "data": {...}}
            - {"event": "complete", "data": {...}}
            - {"event": "error", "data": {...}}
        """
        # 获取可润色段落并分批
        polishable = [s for s in snapshots if s.is_polishable]
        batches = TextExtractor.batch_paragraphs(snapshots, self.batch_size)

        # 发送初始进度事件
        yield {
            "event": "progress",
            "data": {
                "total_batches": len(batches),
                "status": "polishing",
                "total_paragraphs": len(snapshots),
                "polishable_paragraphs": len(polishable),
            },
        }

        all_suggestions: list[PolishSuggestion] = []

        for i, batch in enumerate(batches):
            try:
                suggestions = await self.polish_batch(batch, snapshots)
                all_suggestions.extend(suggestions)

                yield {
                    "event": "batch_complete",
                    "data": {
                        "batch_index": i,
                        "total_batches": len(batches),
                        "suggestions": [self._suggestion_to_dict(s) for s in suggestions],
                    },
                }
            except Exception as e:
                logger.error(f"润色第 {i} 批段落失败: {e}")
                yield {
                    "event": "error",
                    "data": {
                        "message": f"润色第 {i + 1} 批段落时出错: {str(e)}",
                        "batch_index": i,
                    },
                }

        # 构建完整报告
        session_id = str(uuid.uuid4())
        summary = self._build_summary(snapshots, polishable, all_suggestions)

        yield {
            "event": "complete",
            "data": {
                "session_id": session_id,
                "suggestions": [self._suggestion_to_dict(s) for s in all_suggestions],
                "summary": summary,
                "polished_at": datetime.now().isoformat(),
            },
        }

    def _build_context(
        self,
        target_idx: int,
        all_paragraphs: list[ParagraphSnapshot],
        window: int = 2,
    ) -> dict:
        """为目标段落构建上下文窗口"""
        start = max(0, target_idx - window)
        end = min(len(all_paragraphs), target_idx + window + 1)
        return {
            "context_before": [
                all_paragraphs[i].text for i in range(start, target_idx)
            ],
            "context_after": [
                all_paragraphs[i].text for i in range(target_idx + 1, end)
            ],
        }

    async def _call_reviewer(
        self,
        original_texts: list[str],
        polished_texts: list[str],
    ) -> list[dict]:
        """调用 Reviewer Agent 审核语义一致性

        Returns:
            [{"semantic_preserved": bool, "warning": str | None}, ...]
        """
        messages = build_reviewer_messages(original_texts, polished_texts)

        try:
            response = await llm_service.chat_completion(
                messages=messages,
                max_tokens=2048,
                temperature=0.1,
            )

            parsed = self._parse_reviewer_response(response)
            if parsed is not None:
                return parsed

            logger.warning("Reviewer 返回的 JSON 无效")
            return [{"semantic_preserved": True, "warning": None} for _ in original_texts]

        except Exception as e:
            logger.warning(f"Reviewer Agent 调用异常: {e}")
            return [{"semantic_preserved": True, "warning": None} for _ in original_texts]

    @staticmethod
    def _parse_reviewer_response(response: str) -> list[dict] | None:
        """解析 Reviewer LLM 返回的 JSON 响应"""
        try:
            text = response.strip()
            # 去除可能的 markdown 代码块
            if text.startswith("```"):
                lines = text.split("\n")
                json_lines = []
                in_block = False
                for line in lines:
                    if line.strip().startswith("```") and not in_block:
                        in_block = True
                        continue
                    elif line.strip() == "```" and in_block:
                        break
                    elif in_block:
                        json_lines.append(line)
                text = "\n".join(json_lines)

            data = json.loads(text)
            if isinstance(data, list):
                return data
            return None
        except (json.JSONDecodeError, TypeError):
            return None

    async def _call_polisher(
        self,
        batch: list[ParagraphSnapshot],
        context: dict,
    ) -> list[dict]:
        """调用 Polisher Agent（带重试）

        Returns:
            LLM 返回的 JSON 解析后的段落列表
        """
        target_texts = [s.text for s in batch]
        messages = build_polish_messages(
            target_paragraphs=target_texts,
            context_before=context.get("context_before", []),
            context_after=context.get("context_after", []),
        )

        for attempt in range(self.MAX_RETRIES + 1):
            try:
                response = await llm_service.chat_completion(
                    messages=messages,
                    max_tokens=4096,
                    temperature=0.3,
                )

                # 尝试解析 JSON
                parsed = self._parse_polish_response(response)
                if parsed is not None:
                    return parsed

                logger.warning(
                    f"Polisher 返回的 JSON 无效（第 {attempt + 1} 次尝试）"
                )
            except Exception as e:
                logger.warning(
                    f"Polisher 调用失败（第 {attempt + 1} 次尝试）: {e}"
                )

        logger.error(f"Polisher 所有重试耗尽，跳过此批次（{len(batch)} 段）")
        return []

    @staticmethod
    def _parse_polish_response(response: str) -> Optional[list[dict]]:
        """解析 LLM 返回的 JSON 响应

        支持两种格式：
        1. {"paragraphs": [...]}
        2. 直接的数组 [...]
        """
        try:
            # 尝试从响应中提取 JSON（可能被包裹在 markdown 代码块中）
            text = response.strip()

            # 去除可能的 markdown 代码块
            if text.startswith("```"):
                lines = text.split("\n")
                # 去掉第一行和最后一行（```json 和 ```）
                json_lines = []
                in_block = False
                for line in lines:
                    if line.strip().startswith("```") and not in_block:
                        in_block = True
                        continue
                    elif line.strip() == "```" and in_block:
                        break
                    elif in_block:
                        json_lines.append(line)
                text = "\n".join(json_lines)

            data = json.loads(text)

            if isinstance(data, dict) and "paragraphs" in data:
                return data["paragraphs"]
            elif isinstance(data, list):
                return data
            else:
                return None
        except (json.JSONDecodeError, KeyError, TypeError):
            return None

    @staticmethod
    def _suggestion_to_dict(suggestion: PolishSuggestion) -> dict:
        """将 PolishSuggestion 转换为字典（用于 SSE 传输）"""
        return {
            "paragraph_index": suggestion.paragraph_index,
            "original_text": suggestion.original_text,
            "polished_text": suggestion.polished_text,
            "change_type": suggestion.change_type,
            "changes": [
                {
                    "type": c.type,
                    "original": c.original,
                    "revised": c.revised,
                    "explanation": c.explanation,
                }
                for c in suggestion.changes
            ],
            "explanation": suggestion.explanation,
            "confidence": suggestion.confidence,
            "semantic_warning": suggestion.semantic_warning,
            "semantic_warning_text": suggestion.semantic_warning_text,
            "source": suggestion.source,
        }

    @staticmethod
    def _build_summary(
        all_snapshots: list[ParagraphSnapshot],
        polishable: list[ParagraphSnapshot],
        suggestions: list[PolishSuggestion],
    ) -> dict:
        """构建润色统计信息"""
        by_type: dict[str, int] = {}
        for s in suggestions:
            by_type[s.change_type] = by_type.get(s.change_type, 0) + 1

        return {
            "total_paragraphs": len(all_snapshots),
            "polishable_paragraphs": len(polishable),
            "skipped_paragraphs": len(all_snapshots) - len(polishable),
            "modified_paragraphs": len(suggestions),
            "total_suggestions": len(suggestions),
            "by_type": by_type,
            "semantic_warnings": sum(1 for s in suggestions if s.semantic_warning),
        }
