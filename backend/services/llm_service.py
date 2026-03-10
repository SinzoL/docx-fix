"""
LLM 服务封装

使用 OpenAI Python SDK 调用 DeepSeek API（兼容 OpenAI 接口）。
提供流式（streaming）和非流式两种调用模式。
"""

import logging
from typing import AsyncGenerator, Optional

from openai import AsyncOpenAI

from config import (
    DEEPSEEK_API_KEY as _api_key,
    DEEPSEEK_BASE_URL as _base_url,
    DEEPSEEK_MODEL as _model,
    LLM_DEFAULT_MAX_TOKENS as DEFAULT_MAX_TOKENS,
    LLM_DEFAULT_TEMPERATURE as DEFAULT_TEMPERATURE,
)

logger = logging.getLogger(__name__)

# 初始化 AsyncOpenAI 客户端（兼容 DeepSeek）
_client: Optional[AsyncOpenAI] = None


def _get_client() -> AsyncOpenAI:
    """懒初始化 OpenAI 客户端"""
    global _client
    if _client is None:
        if not _api_key:
            raise RuntimeError(
                "DEEPSEEK_API_KEY 未配置。请在 backend/.env 中设置。"
            )
        _client = AsyncOpenAI(
            api_key=_api_key,
            base_url=_base_url,
        )
    return _client


def is_available() -> bool:
    """检查 LLM 服务是否可用（API Key 已配置）"""
    return bool(_api_key)


async def chat_completion(
    messages: list[dict],
    max_tokens: int = DEFAULT_MAX_TOKENS,
    temperature: float = DEFAULT_TEMPERATURE,
) -> str:
    """非流式调用 LLM，返回完整响应文本。

    Args:
        messages: OpenAI 格式的消息列表 [{"role": "system", "content": "..."}, ...]
        max_tokens: 最大生成 token 数
        temperature: 温度参数

    Returns:
        LLM 生成的完整文本

    Raises:
        RuntimeError: API Key 未配置
        Exception: API 调用失败
    """
    client = _get_client()

    try:
        response = await client.chat.completions.create(
            model=_model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=False,
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"LLM 非流式调用失败: {e}")
        raise


async def chat_completion_stream(
    messages: list[dict],
    max_tokens: int = DEFAULT_MAX_TOKENS,
    temperature: float = DEFAULT_TEMPERATURE,
) -> AsyncGenerator[str, None]:
    """流式调用 LLM，逐 token 返回文本片段。

    Args:
        messages: OpenAI 格式的消息列表
        max_tokens: 最大生成 token 数
        temperature: 温度参数

    Yields:
        每次产出一个文本片段（token）

    Raises:
        RuntimeError: API Key 未配置
        Exception: API 调用失败
    """
    client = _get_client()

    try:
        stream = await client.chat.completions.create(
            model=_model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    except Exception as e:
        logger.error(f"LLM 流式调用失败: {e}")
        raise
