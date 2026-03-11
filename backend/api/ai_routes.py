"""
AI 相关 API 路由

提供 LLM 增强功能的 REST/SSE 端点：
- POST /api/ai/summarize  — 检查报告 AI 总结（SSE 流式）
- POST /api/ai/chat       — 格式问答（SSE 流式）
- POST /api/ai/generate-rules — 从文本生成 YAML 规则（JSON）
- POST /api/ai/review-conventions — 文本排版争议审查（JSON）
"""

import json
import logging
import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from config import MAX_CONCURRENT_UPLOADS

from api.schemas import (
    AiSummarizeRequest,
    AiChatRequest,
    AiGenerateRulesRequest,
    AiGenerateRulesResponse,
    AiReviewConventionsRequest,
    AiReviewConventionsResponse,
    AiReviewItemResult,
    ErrorResponse,
)
from services import llm_service
from services.ai_prompts import (
    build_summarize_messages,
    build_chat_messages,
    build_generate_rules_messages,
    build_review_conventions_messages,
)

logger = logging.getLogger(__name__)

ai_router = APIRouter(prefix="/ai", tags=["AI"])

# AI 接口并发限制信号量：保护 LLM API 调用额度
_ai_semaphore = asyncio.Semaphore(MAX_CONCURRENT_UPLOADS)


def _check_llm_available():
    """检查 LLM 服务是否可用"""
    if not llm_service.is_available():
        raise HTTPException(
            status_code=503,
            detail=ErrorResponse(
                error="LLM_UNAVAILABLE",
                message="AI 服务未配置，请检查 DEEPSEEK_API_KEY 环境变量"
            ).model_dump(),
        )


async def _sse_generator(messages: list[dict]):
    """通用的 SSE 流式生成器（带并发限制）。

    将 LLM 流式输出转换为 SSE 格式：
    data: {"token": "xxx"}
    ...
    data: {"token": "", "done": true}
    """
    async with _ai_semaphore:
        try:
            async for token in llm_service.chat_completion_stream(messages):
                payload = json.dumps({"token": token}, ensure_ascii=False)
                yield f"data: {payload}\n\n"

            # 发送完成信号
            done_payload = json.dumps({"token": "", "done": True}, ensure_ascii=False)
            yield f"data: {done_payload}\n\n"

        except Exception as e:
            logger.error(f"SSE 流式生成失败: {e}")
            error_payload = json.dumps(
                {"error": True, "message": f"AI 服务出错: {str(e)}"},
                ensure_ascii=False,
            )
            yield f"data: {error_payload}\n\n"


# ========================================
# POST /api/ai/summarize — AI 总结检查报告（SSE）
# ========================================
@ai_router.post("/summarize")
async def summarize_report(request: AiSummarizeRequest):
    """将检查报告的技术性结果翻译为通俗的修改建议。

    返回 SSE 流式响应，前端逐字渲染。
    """
    _check_llm_available()

    messages = build_summarize_messages(request.check_report)

    return StreamingResponse(
        _sse_generator(messages),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ========================================
# POST /api/ai/chat — 格式问答（SSE）
# ========================================
@ai_router.post("/chat")
async def chat(request: AiChatRequest):
    """基于检查报告上下文的格式问答。

    支持多轮对话，返回 SSE 流式响应。
    """
    _check_llm_available()

    if not request.messages:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="EMPTY_MESSAGE",
                message="消息列表不能为空"
            ).model_dump(),
        )

    messages = build_chat_messages(
        user_messages=[m.model_dump() for m in request.messages],
        check_report=request.check_report,
    )

    return StreamingResponse(
        _sse_generator(messages),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ========================================
# POST /api/ai/generate-rules — 从文本生成 YAML 规则
# ========================================
@ai_router.post("/generate-rules", response_model=AiGenerateRulesResponse)
async def generate_rules(request: AiGenerateRulesRequest):
    """从用户输入的自然语言格式要求生成 YAML 规则文件。

    非流式调用，返回完整 YAML 和提醒信息。
    """
    _check_llm_available()

    if not request.text or not request.text.strip():
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="EMPTY_TEXT",
                message="格式要求文本不能为空"
            ).model_dump(),
        )

    messages = build_generate_rules_messages(
        text=request.text,
        name=request.name,
    )

    try:
        async with _ai_semaphore:
            yaml_content = await llm_service.chat_completion(
                messages=messages,
                max_tokens=4096,  # 规则文件可能较长
                temperature=0.2,  # 更低温度保证格式准确
            )

        # 清理 LLM 输出中可能的 markdown 代码块标记
        yaml_content = yaml_content.strip()
        if yaml_content.startswith("```yaml"):
            yaml_content = yaml_content[7:]
        elif yaml_content.startswith("```"):
            yaml_content = yaml_content[3:]
        if yaml_content.endswith("```"):
            yaml_content = yaml_content[:-3]
        yaml_content = yaml_content.strip()

        # 提取推断项作为 warnings
        warnings = []
        for line in yaml_content.split("\n"):
            if "[推断]" in line:
                # 去除 YAML 注释符号和多余空格
                clean = line.strip().lstrip("#").strip()
                warnings.append(clean)

        return AiGenerateRulesResponse(
            yaml_content=yaml_content,
            warnings=warnings,
        )

    except Exception as e:
        logger.error(f"规则生成失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="GENERATION_FAILED",
                message=f"AI 规则生成失败: {str(e)}"
            ).model_dump(),
        )


# ========================================
# POST /api/ai/review-conventions — 文本排版争议审查（JSON）
# ========================================
@ai_router.post("/review-conventions", response_model=AiReviewConventionsResponse)
async def review_conventions(request: AiReviewConventionsRequest):
    """对文本排版检查的争议项进行 LLM 二次审查。

    batch 模式：将多个争议项合并为一次 LLM 调用。
    15 秒超时保护：超时则所有争议项降级为 uncertain。
    """
    if not request.disputed_items:
        return AiReviewConventionsResponse(reviews=[])

    # 检查 LLM 是否可用（不可用时降级为 uncertain）
    if not llm_service.is_available():
        return AiReviewConventionsResponse(
            reviews=[
                AiReviewItemResult(
                    id=item.id,
                    verdict="uncertain",
                    reason="AI 审查不可用，请人工判断",
                )
                for item in request.disputed_items
            ]
        )

    messages = build_review_conventions_messages(
        disputed_items=[item.model_dump() for item in request.disputed_items],
        document_stats=request.document_stats,
    )

    try:
        # 15 秒超时保护 + 并发限制
        async with _ai_semaphore:
            raw_response = await asyncio.wait_for(
                llm_service.chat_completion(
                    messages=messages,
                    max_tokens=2048,
                    temperature=0.1,  # 低温度确保判断一致性
                ),
                timeout=15.0,
            )

        # 解析 LLM 响应
        reviews = _parse_review_response(raw_response, request.disputed_items)
        return AiReviewConventionsResponse(reviews=reviews)

    except asyncio.TimeoutError:
        logger.warning("AI 争议审查超时 (>15s)，降级为 uncertain")
        return AiReviewConventionsResponse(
            reviews=[
                AiReviewItemResult(
                    id=item.id,
                    verdict="uncertain",
                    reason="AI 审查超时，请人工判断",
                )
                for item in request.disputed_items
            ]
        )

    except Exception as e:
        logger.error(f"AI 争议审查失败: {e}")
        return AiReviewConventionsResponse(
            reviews=[
                AiReviewItemResult(
                    id=item.id,
                    verdict="uncertain",
                    reason=f"AI 审查出错: {str(e)[:50]}",
                )
                for item in request.disputed_items
            ]
        )


def _parse_review_response(
    raw_response: str,
    disputed_items: list,
) -> list[AiReviewItemResult]:
    """解析 LLM 审查响应，提取结构化结果。

    容错处理：如果 LLM 输出格式异常，为未覆盖的项返回 uncertain。
    """
    # 清理 markdown 代码块标记
    text = raw_response.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    valid_verdicts = {"confirmed", "ignored", "uncertain"}
    result_map: dict[str, AiReviewItemResult] = {}

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            for entry in parsed:
                if isinstance(entry, dict) and "id" in entry:
                    verdict = entry.get("verdict", "uncertain")
                    if verdict not in valid_verdicts:
                        verdict = "uncertain"
                    result_map[entry["id"]] = AiReviewItemResult(
                        id=entry["id"],
                        verdict=verdict,
                        reason=entry.get("reason", ""),
                    )
    except (json.JSONDecodeError, TypeError):
        logger.warning(f"LLM 审查响应格式异常: {text[:200]}")

    # 确保所有争议项都有结果
    reviews = []
    for item in disputed_items:
        item_id = item.id if hasattr(item, 'id') else item.get('id', '')
        if item_id in result_map:
            reviews.append(result_map[item_id])
        else:
            reviews.append(AiReviewItemResult(
                id=item_id,
                verdict="uncertain",
                reason="AI 未返回该项的审查结果",
            ))

    return reviews
