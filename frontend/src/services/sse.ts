/**
 * SSE (Server-Sent Events) 流式请求工具
 *
 * 支持通过 POST 请求发送数据并接收 SSE 流式响应。
 * 注意：原生 EventSource 只支持 GET，这里用 fetch + ReadableStream 实现 POST SSE。
 */

export interface SSEToken {
  token: string;
  done?: boolean;
  error?: boolean;
  message?: string;
}

export interface SSEOptions {
  /** 请求体 */
  body: Record<string, unknown>;
  /** 每收到一个 token 时的回调 */
  onToken: (token: string) => void;
  /** 流式结束时的回调 */
  onDone?: () => void;
  /** 出错时的回调 */
  onError?: (error: string) => void;
  /** AbortController 信号，用于取消请求 */
  signal?: AbortSignal;
}

/**
 * 发起 POST SSE 请求
 *
 * @param url API 端点 URL
 * @param options SSE 选项
 */
export async function fetchSSE(url: string, options: SSEOptions): Promise<void> {
  const { body, onToken, onDone, onError, signal } = options;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      let errorMessage = `请求失败 (${response.status})`;
      try {
        const errorBody = await response.json();
        errorMessage = errorBody?.detail?.message || errorBody?.message || errorMessage;
      } catch {
        // 忽略 JSON 解析错误
      }
      onError?.(errorMessage);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError?.("无法读取响应流");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        onDone?.();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // 按行解析 SSE 数据
      const lines = buffer.split("\n");
      // 保留最后一行（可能不完整）
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) {
          continue;
        }

        const jsonStr = trimmed.slice(6); // 去掉 "data: " 前缀
        try {
          const data: SSEToken = JSON.parse(jsonStr);

          if (data.error) {
            onError?.(data.message || "AI 服务出错");
            return;
          }

          if (data.done) {
            onDone?.();
            return;
          }

          if (data.token) {
            onToken(data.token);
          }
        } catch {
          // 忽略无法解析的行
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // 用户主动取消，不视为错误
      return;
    }
    const message = err instanceof Error ? err.message : "网络错误";
    onError?.(message);
  }
}
