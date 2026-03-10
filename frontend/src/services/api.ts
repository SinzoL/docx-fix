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
  DisputedItem,
  PolishApplyResponse,
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
export async function fetchRules(): Promise<RulesListResponse> {
  const response = await fetch(`${API_BASE}/rules`);
  return handleResponse<RulesListResponse>(response);
}

/**
 * GET /api/rules/{ruleId} — 获取规则详情
 */
export async function fetchRuleDetail(
  ruleId: string
): Promise<RuleDetailResponse> {
  const response = await fetch(`${API_BASE}/rules/${ruleId}`);
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

  const response = await fetch(`${API_BASE}/check`, {
    method: "POST",
    body: formData,
  });

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

  const response = await fetch(`${API_BASE}/recheck`, {
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

  const response = await fetch(`${API_BASE}/fix`, {
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
  const response = await fetch(
    `${API_BASE}/fix/download?session_id=${sessionId}`
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

  const response = await fetch(`${API_BASE}/extract-rules`, {
    method: "POST",
    body: formData,
  });

  return handleResponse<ExtractResult>(response);
}

/**
 * POST /api/ai/generate-rules — 从自然语言生成 YAML 规则
 */
export async function generateRules(
  text: string,
  name?: string
): Promise<AiGenerateRulesResponse> {
  const response = await fetch(`${API_BASE}/ai/generate-rules`, {
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
export interface AiReviewConventionsResponse {
  reviews: Array<{
    id: string;
    verdict: "confirmed" | "ignored" | "uncertain";
    reason: string;
  }>;
}

export async function reviewConventions(
  sessionId: string,
  disputedItems: DisputedItem[],
  documentStats: Record<string, number>
): Promise<AiReviewConventionsResponse> {
  const response = await fetch(`${API_BASE}/ai/review-conventions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
      disputed_items: disputedItems,
      document_stats: documentStats,
    }),
  });

  return handleResponse<AiReviewConventionsResponse>(response);
}

// ========================================
// 润色相关 API
// ========================================

/**
 * POST /api/polish/apply — 应用用户选中的润色建议
 */
export async function applyPolish(
  sessionId: string,
  acceptedIndices: number[]
): Promise<PolishApplyResponse> {
  const response = await fetch(`${API_BASE}/polish/apply`, {
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
  const response = await fetch(
    `${API_BASE}/polish/download/${sessionId}`
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
