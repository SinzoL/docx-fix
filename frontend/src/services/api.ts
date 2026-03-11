/**
 * API 调用封装
 *
 * 所有后端 API 接口的请求封装，统一错误处理。
 */

import type {
  RulesListResponse,
  RuleDetailResponse,
  CheckReport,
  FixReport,
  ErrorResponse,
  ExtractResult,
  AiGenerateRulesResponse,
  AiReviewConventionsResponse,
  DisputedItem,
  PolishApplyResponse,
  PolishSessionStatus,
} from "../types";

const API_BASE = "/api";

/**
 * 统一的 API 错误类
 */
export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "ApiError";
  }
}

/**
 * 带重试的 fetch 封装
 *
 * 仅对网络层错误（TypeError: Failed to fetch）和 5xx 服务端错误进行重试，
 * 4xx 客户端错误不会重试。采用指数退避策略。
 * 支持通过 init.signal（AbortSignal）取消请求，取消后不再重试。
 */
async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxRetries = 2,
  baseDelay = 800,
  timeoutMs = 120_000, // 默认 120 秒超时
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 如果调用方没有传入 signal，自动创建超时 signal
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let fetchInit = init;
    if (!init?.signal && timeoutMs > 0) {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      fetchInit = { ...init, signal: controller.signal };
    }

    try {
      const response = await fetch(input, fetchInit);

      // 5xx 服务端错误才重试，4xx 不重试
      if (response.status >= 500 && attempt < maxRetries) {
        lastError = new Error(`Server error ${response.status}`);
        if (fetchInit?.signal?.aborted) throw fetchInit.signal.reason ?? new DOMException("Aborted", "AbortError");
        await delay(baseDelay * Math.pow(2, attempt));
        continue;
      }

      return response;
    } catch (err) {
      // 被取消的请求直接抛出，不重试
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      // 网络层错误（连接断开、DNS 失败等）
      lastError = err;
      if (attempt < maxRetries) {
        if (fetchInit?.signal?.aborted) throw fetchInit.signal.reason ?? new DOMException("Aborted", "AbortError");
        await delay(baseDelay * Math.pow(2, attempt));
        continue;
      }
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 统一处理 API 响应
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: ErrorResponse | null = null;
    try {
      const body = await response.json();
      // FastAPI HTTPException 的 detail 字段
      errorData = body.detail || body;
    } catch {
      // 无法解析 JSON
    }

    throw new ApiError(
      errorData?.error || "UNKNOWN_ERROR",
      errorData?.message || `请求失败 (${response.status})`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

/**
 * GET /api/rules — 获取可用规则列表
 */
export async function fetchRules(signal?: AbortSignal): Promise<RulesListResponse> {
  const response = await fetchWithRetry(`${API_BASE}/rules`, { signal });
  return handleResponse<RulesListResponse>(response);
}

/**
 * GET /api/rules/{ruleId} — 获取规则详情
 */
export async function fetchRuleDetail(
  ruleId: string
): Promise<RuleDetailResponse> {
  const response = await fetchWithRetry(`${API_BASE}/rules/${ruleId}`);
  return handleResponse<RuleDetailResponse>(response);
}

/**
 * POST /api/check — 上传文件并执行格式检查
 *
 * 当 customRulesYaml 非空时，使用自定义规则 YAML 内容进行检查，忽略 ruleId。
 */
export async function checkFile(
  file: File,
  ruleId: string,
  sessionId: string,
  customRulesYaml?: string
): Promise<CheckReport> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("rule_id", ruleId);
  formData.append("session_id", sessionId);
  if (customRulesYaml) {
    formData.append("custom_rules_yaml", customRulesYaml);
  }

  const response = await fetchWithRetry(`${API_BASE}/check`, {
    method: "POST",
    body: formData,
  }, 1); // 上传类请求只重试 1 次

  return handleResponse<CheckReport>(response);
}

/**
 * POST /api/recheck — 使用已上传文件切换规则重新检查
 *
 * 无需重新上传文件，复用 session 中已保存的文件。
 */
export async function recheckFile(
  sessionId: string,
  ruleId: string,
  customRulesYaml?: string
): Promise<CheckReport> {
  const body: Record<string, string> = {
    session_id: sessionId,
    rule_id: ruleId,
  };
  if (customRulesYaml) {
    body.custom_rules_yaml = customRulesYaml;
  }

  const response = await fetchWithRetry(`${API_BASE}/recheck`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return handleResponse<CheckReport>(response);
}

/**
 * POST /api/fix — 执行修复并返回预览
 *
 * 当 customRulesYaml 非空时，使用自定义规则 YAML 内容进行修复。
 * 当 includeTextFix 为 true 时，同时修复文本排版问题。
 */
export async function fixFile(
  sessionId: string,
  ruleId: string,
  customRulesYaml?: string,
  includeTextFix?: boolean
): Promise<FixReport> {
  const body: Record<string, unknown> = {
    session_id: sessionId,
    rule_id: ruleId,
  };
  if (customRulesYaml) {
    body.custom_rules_yaml = customRulesYaml;
  }
  if (includeTextFix) {
    body.include_text_fix = true;
  }

  const response = await fetchWithRetry(`${API_BASE}/fix`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return handleResponse<FixReport>(response);
}

/**
 * GET /api/fix/download — 下载修复后文件
 */
export async function downloadFixedFile(sessionId: string): Promise<Blob> {
  const response = await fetchWithRetry(
    `${API_BASE}/fix/download?session_id=${encodeURIComponent(sessionId)}`
  );

  if (!response.ok) {
    let errorData: ErrorResponse | null = null;
    try {
      const body = await response.json();
      errorData = body.detail || body;
    } catch {
      // 无法解析 JSON
    }

    throw new ApiError(
      errorData?.error || "DOWNLOAD_ERROR",
      errorData?.message || "下载失败",
      response.status
    );
  }

  return response.blob();
}

/**
 * 触发浏览器下载
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * POST /api/extract-rules — 从模板文档提取格式规则
 */
export async function extractRules(
  file: File,
  name?: string
): Promise<ExtractResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (name) {
    formData.append("name", name);
  }

  const response = await fetchWithRetry(`${API_BASE}/extract-rules`, {
    method: "POST",
    body: formData,
  }, 1);

  return handleResponse<ExtractResult>(response);
}

/**
 * POST /api/ai/generate-rules — 从自然语言生成 YAML 规则
 */
export async function generateRules(
  text: string,
  name?: string
): Promise<AiGenerateRulesResponse> {
  const response = await fetchWithRetry(`${API_BASE}/ai/generate-rules`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, name }),
  });

  return handleResponse<AiGenerateRulesResponse>(response);
}

/**
 * POST /api/ai/review-conventions — 文本排版争议 AI 审查
 */
export async function reviewConventions(
  sessionId: string,
  disputedItems: DisputedItem[],
  documentStats: Record<string, number>,
  signal?: AbortSignal
): Promise<AiReviewConventionsResponse> {
  const response = await fetchWithRetry(`${API_BASE}/ai/review-conventions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
      disputed_items: disputedItems,
      document_stats: documentStats,
    }),
    signal,
  });

  return handleResponse<AiReviewConventionsResponse>(response);
}

// ========================================
// 润色相关 API
// ========================================

/**
 * GET /api/polish/session/{sessionId}/status — 检查润色 session 是否仍然有效
 *
 * 用于前端从 IndexedDB 恢复缓存后验证后端 session 是否还存在。
 * 不使用重试，快速返回结果。
 */
export async function checkPolishSessionStatus(
  sessionId: string
): Promise<PolishSessionStatus> {
  const response = await fetchWithRetry(
    `${API_BASE}/polish/session/${encodeURIComponent(sessionId)}/status`,
    undefined,
    0, // 不重试，快速返回
  );
  return handleResponse<PolishSessionStatus>(response);
}

/**
 * POST /api/polish/apply — 应用用户选中的润色建议
 */
export async function applyPolish(
  sessionId: string,
  acceptedIndices: number[]
): Promise<PolishApplyResponse> {
  const response = await fetchWithRetry(`${API_BASE}/polish/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
      accepted_indices: acceptedIndices,
    }),
  });

  return handleResponse<PolishApplyResponse>(response);
}

/**
 * GET /api/polish/download/{sessionId} — 下载润色后的文档
 */
export async function downloadPolishedFile(sessionId: string): Promise<Blob> {
  const response = await fetchWithRetry(
    `${API_BASE}/polish/download/${encodeURIComponent(sessionId)}`
  );

  if (!response.ok) {
    let errorData: ErrorResponse | null = null;
    try {
      const body = await response.json();
      errorData = body.detail || body;
    } catch {
      // 无法解析 JSON
    }

    throw new ApiError(
      errorData?.error || "DOWNLOAD_ERROR",
      errorData?.message || "下载润色文件失败",
      response.status
    );
  }

  return response.blob();
}
