"""
AI 相关 API 路由

提供 LLM 增强功能的 REST/SSE 端点：
- POST /api/ai/summarize  — 检查报告 AI 总结（SSE 流式）
- POST /api/ai/chat       — 格式问答（SSE 流式）
- POST /api/ai/generate-rules — 从文本生成 YAML 规则（JSON）
"""

import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from api.schemas import (
    AiSummarizeRequest,
    AiChatRequest,
    AiGenerateRulesRequest,
    AiGenerateRulesResponse,
    ErrorResponse,
)
from services import llm_service
from services.ai_prompts import (
    build_summarize_messages,
    build_chat_messages,
    build_generate_rules_messages,
)

logger = logging.getLogger(__name__)

ai_router = APIRouter(prefix="/ai", tags=["AI"])


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
    """通用的 SSE 流式生成器。

    将 LLM 流式输出转换为 SSE 格式：
    data: {"token": "xxx"}
    ...
    data: {"token": "", "done": true}
    """
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
