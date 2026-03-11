/**
 * usePolishSSE — 润色 SSE 流处理 Hook
 *
 * 将 SSE 请求发起、流解析、事件分发等逻辑从 PolishPanel 中提取，
 * 使主面板只关注状态编排和 UI 渲染。
 */

import { useRef, useCallback } from "react";
import type { PolishSuggestion, PolishSummary } from "../types";
import { savePolishResult } from "../services/cache";

/** SSE 事件解析结果 */
interface SSEEvent {
  name: string;
  data: string;
}

/** SSE 回调集合 */
interface PolishSSECallbacks {
  onProgress: (total_batches: number, total_paragraphs: number, polishable_paragraphs: number) => void;
  onBatchComplete: (batch_index: number, suggestions: PolishSuggestion[]) => void;
  onRuleScanComplete: (suggestions: PolishSuggestion[]) => void;
  onComplete: (session_id: string, suggestions: PolishSuggestion[], summary: PolishSummary | null) => void;
  onError: (message: string) => void;
}

/**
 * 解析 SSE 缓冲区，返回完整事件和剩余缓冲
 */
function parseSSEBuffer(buffer: string): { events: SSEEvent[]; remaining: string } {
  const parts = buffer.split("\n\n");
  const remaining = parts.pop() || "";
  const events: SSEEvent[] = [];

  for (const part of parts) {
    if (!part.trim()) continue;
    const lines = part.split("\n");
    let name = "";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        name = line.slice(7);
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice(6));
      }
    }

    if (name && dataLines.length > 0) {
      events.push({ name, data: dataLines.join("\n") });
    }
  }

  return { events, remaining };
}

/**
 * 润色 SSE 自定义 Hook
 */
export function usePolishSSE() {
  const abortControllerRef = useRef<AbortController | null>(null);

  /** 取消进行中的请求 */
  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  /** 发起润色 SSE 请求 */
  const startPolish = useCallback(async (
    file: File,
    callbacks: PolishSSECallbacks,
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("enable_reviewer", "true");

    // 取消上一次未完成的请求
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const response = await fetch("/api/polish", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.detail?.message || `请求失败 (${response.status})`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("无法读取响应流");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = parseSSEBuffer(buffer);
      buffer = remaining;

      for (const event of events) {
        try {
          const data = JSON.parse(event.data);
          switch (event.name) {
            case "rule_scan_complete":
              if (data.suggestions?.length > 0) {
                callbacks.onRuleScanComplete(data.suggestions);
              }
              break;

            case "progress":
              callbacks.onProgress(
                data.total_batches || 0,
                data.total_paragraphs || 0,
                data.polishable_paragraphs || 0,
              );
              break;

            case "batch_complete":
              callbacks.onBatchComplete(
                data.batch_index || 0,
                data.suggestions || [],
              );
              break;

            case "complete":
              callbacks.onComplete(
                data.session_id || "",
                data.suggestions || [],
                data.summary || null,
              );
              // 润色完成后缓存结果到 IndexedDB
              if (data.session_id && data.suggestions) {
                savePolishResult(
                  data.session_id,
                  file.name,
                  data.suggestions,
                  data.summary || null,
                ).catch((err: unknown) => {
                  console.warn("缓存润色结果失败:", err);
                });
              }
              break;

            case "error":
              callbacks.onError(data.message || "润色过程中出错");
              break;
          }
        } catch {
          // JSON 解析失败，跳过
        }
      }
    }
  }, []);

  return { startPolish, abort };
}
