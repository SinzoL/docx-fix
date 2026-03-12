"""
模板提取 LLM 智能审核服务

调用 LLM 对提取结果进行四维度审核（标题级别异常、特殊颜色字体隐含规则、
规则内部矛盾、综合质量评估），产出独立的审核建议列表。
LLM 只做内容评判，ID 生成和格式校验由本模块完成。
"""

from __future__ import annotations

import asyncio
import json
import logging
import re

import yaml

from api._helpers import llm_semaphore
from config import LLM_REVIEW_MAX_TOKENS
from services import llm_service
from services.ai_prompts import build_review_extract_messages

logger = logging.getLogger(__name__)

# 合法的 category 和 severity 值域
_VALID_CATEGORIES = {"heading_error", "hidden_rule", "contradiction", "quality"}
_VALID_SEVERITIES = {"error", "warning", "info"}

# section_path 格式校验（点分路径，至少一段）
_SECTION_PATH_RE = re.compile(r'^[\w][\w.-]*(?:\.[\w][\w.-]*)*$')

# 审核超时时间（秒）
_REVIEW_TIMEOUT = 30

# 输入截断限制
_MAX_YAML_CHARS = 8000          # YAML 内容最大字符数
_MAX_COLORED_PARAGRAPHS = 20    # 特殊颜色字体段落最大条数
_MAX_HEADING_ITEMS = 30         # 标题结构摘要最大条数


def _truncate_inputs(
    yaml_content: str,
    colored_text_paragraphs: list[dict],
    heading_structure: list[dict],
) -> tuple[str, list[dict], list[dict]]:
    """截断输入以控制 LLM 上下文长度。"""
    # YAML 截断
    if len(yaml_content) > _MAX_YAML_CHARS:
        yaml_content = yaml_content[:_MAX_YAML_CHARS] + "\n# ... (已截断)"
        logger.info("YAML 内容已截断至 %d 字符", _MAX_YAML_CHARS)

    # 颜色段落截断
    if len(colored_text_paragraphs) > _MAX_COLORED_PARAGRAPHS:
        colored_text_paragraphs = colored_text_paragraphs[:_MAX_COLORED_PARAGRAPHS]
        logger.info("特殊颜色字体段落已截断至 %d 条", _MAX_COLORED_PARAGRAPHS)

    # 标题结构截断
    if len(heading_structure) > _MAX_HEADING_ITEMS:
        heading_structure = heading_structure[:_MAX_HEADING_ITEMS]
        logger.info("标题结构摘要已截断至 %d 条", _MAX_HEADING_ITEMS)

    return yaml_content, colored_text_paragraphs, heading_structure


async def review_extract_rules(
    yaml_content: str,
    colored_text_paragraphs: list[dict] | None = None,
    heading_structure: list[dict] | None = None,
) -> list[dict]:
    """对提取的规则进行 LLM 智能审核。

    Args:
        yaml_content: 提取后的 YAML 规则内容
        colored_text_paragraphs: 特殊颜色字体段落列表
        heading_structure: 标题结构摘要列表

    Returns:
        审核建议列表，每项包含 id, category, severity, description,
        section_path, yaml_snippet, source_text
    """
    if not yaml_content or not yaml_content.strip():
        return []

    # LLM 不可用时直接返回空列表
    if not llm_service.is_available():
        logger.info("LLM 服务不可用，跳过模板提取审核")
        return []

    colored_text_paragraphs = colored_text_paragraphs or []
    heading_structure = heading_structure or []

    # 输入截断控制
    yaml_content, colored_text_paragraphs, heading_structure = _truncate_inputs(
        yaml_content, colored_text_paragraphs, heading_structure,
    )

    # 构建 LLM 消息
    messages = build_review_extract_messages(
        yaml_content=yaml_content,
        colored_text_paragraphs=colored_text_paragraphs,
        heading_structure=heading_structure,
    )

    # 调用 LLM（带超时）
    try:
        async with llm_semaphore:
            raw_response = await asyncio.wait_for(
                llm_service.chat_completion(
                    messages=messages,
                    max_tokens=LLM_REVIEW_MAX_TOKENS,
                    temperature=0.2,  # 低温度，输出更稳定
                ),
                timeout=_REVIEW_TIMEOUT,
            )
    except asyncio.TimeoutError:
        logger.warning("模板提取审核 LLM 调用超时（%ds）", _REVIEW_TIMEOUT)
        return []
    except Exception as e:
        logger.warning("模板提取审核 LLM 调用失败: %s", e)
        return []

    # 解析 LLM 输出
    items = _parse_llm_response(raw_response)
    if items is None:
        return []

    # 为每条建议生成 ID 并进行二次校验
    validated_items = []
    for i, item in enumerate(items):
        validated = _validate_review_item(item, i + 1)
        if validated is not None:
            validated_items.append(validated)

    logger.info("模板提取审核完成：LLM 产出 %d 条，校验通过 %d 条",
                len(items), len(validated_items))

    return validated_items


def _parse_llm_response(raw_response: str) -> list[dict] | None:
    """解析 LLM 的 JSON 响应。

    支持纯 JSON 和 markdown 代码块包裹的 JSON。

    Returns:
        解析后的列表，解析失败返回 None
    """
    if not raw_response or not raw_response.strip():
        logger.warning("LLM 审核返回空响应")
        return None

    text = raw_response.strip()

    # 尝试去除 markdown 代码块包裹
    code_block_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', text, re.DOTALL)
    if code_block_match:
        text = code_block_match.group(1).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning("LLM 审核输出 JSON 解析失败: %s\n原始内容: %s", e, text[:500])
        return None

    if not isinstance(parsed, list):
        logger.warning("LLM 审核输出不是数组类型: %s", type(parsed).__name__)
        return None

    return parsed


def _validate_review_item(item: dict, seq: int) -> dict | None:
    """校验单条审核建议并生成 ID。

    Args:
        item: LLM 输出的原始建议字典
        seq: 序号（从 1 开始），用于生成 ID

    Returns:
        校验通过的建议字典（含 ID），不合法返回 None
    """
    if not isinstance(item, dict):
        logger.warning("审核建议 #%d 不是字典类型，已丢弃", seq)
        return None

    # 必填字段检查
    category = item.get("category", "")
    severity = item.get("severity", "")
    description = item.get("description", "")
    section_path = item.get("section_path", "")

    if not description:
        logger.warning("审核建议 #%d 缺少 description 字段，已丢弃", seq)
        return None

    # category 值域校验
    if category not in _VALID_CATEGORIES:
        logger.warning("审核建议 #%d category='%s' 不合法，已丢弃", seq, category)
        return None

    # severity 值域校验
    if severity not in _VALID_SEVERITIES:
        logger.warning("审核建议 #%d severity='%s' 不合法，已丢弃", seq, severity)
        return None

    # section_path 格式校验
    if not section_path or not _SECTION_PATH_RE.match(section_path):
        logger.warning("审核建议 #%d section_path='%s' 格式不合法，已丢弃",
                        seq, section_path)
        return None

    # yaml_snippet 合法性校验
    yaml_snippet = item.get("yaml_snippet", "")
    if yaml_snippet:
        try:
            yaml.safe_load(yaml_snippet)
        except yaml.YAMLError as e:
            logger.warning("审核建议 #%d yaml_snippet 不是合法 YAML: %s，已丢弃",
                            seq, e)
            return None

    source_text = item.get("source_text", "")

    return {
        "id": f"rev-{seq:03d}",
        "category": category,
        "severity": severity,
        "description": description,
        "section_path": section_path,
        "yaml_snippet": yaml_snippet,
        "source_text": source_text,
    }
