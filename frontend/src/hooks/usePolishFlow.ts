/**
 * usePolishFlow — 润色流程状态管理 Hook
 *
 * 设计模式：自定义 Hook 封装（State Colocation）
 * 将润色域的「流程状态 + 结果数据 + SSE 通信 + beforeunload 保护 + IndexedDB 恢复」
 * 从 PolishPanel 中提取到独立 Hook，实现关注点分离。
 *
 * 管理状态：suggestions、summary、sessionId、progress、totalParagraphs、
 *          polishableParagraphs、historyRefreshKey、isReadOnly、initialDecisions、
 *          sessionExpired
 *
 * 暴露回调：handleStartPolish、handleApplyAndDownload、handleViewHistory、
 *          triggerRestore、reset、abort
 *
 * 关键设计：
 * 1. beforeunload — 通过 useRef 追踪 appState，仅 POLISHING/POLISH_APPLYING 时注册
 * 2. triggerRestore — 按需触发 IndexedDB 恢复，仅执行一次
 * 3. abort — 调用 SSE abort + 清空中间状态
 * 4. isPolishing — 供 App.tsx 判断返回时是否需要弹确认框
 *
 * 注意：文件上传等 UI 交互状态保留在 PolishUploadPanel 组件内部。
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { MessagePlugin } from "tdesign-react";
import type { AppState, PolishSuggestion, PolishSummary, PolishHistoryRecord } from "../types";
import { usePolishSSE } from "./usePolishSSE";
import { applyPolish, downloadPolishedFile, triggerDownload, checkPolishSessionStatus } from "../services/api";
import { getLatestPolishResult, markPolishApplied } from "../services/cache";

// ========================================
// 类型定义
// ========================================

interface UsePolishFlowReturn {
  // ---- 数据（供全屏视图组件消费） ----
  /** 润色建议列表 */
  suggestions: PolishSuggestion[];
  /** 润色统计信息 */
  summary: PolishSummary | null;
  /** 当前会话 ID */
  sessionId: string;
  /** SSE 进度 */
  progress: { current: number; total: number };
  /** 总段落数 */
  totalParagraphs: number;
  /** 可润色段落数 */
  polishableParagraphs: number;
  /** 历史列表刷新 key */
  historyRefreshKey: number;
  /** 只读模式（查看历史记录时） */
  isReadOnly: boolean;
  /** 从缓存恢复的初始决策 */
  initialDecisions: Record<number, boolean> | undefined;
  /** session 是否已过期 */
  sessionExpired: boolean;
  /** 当前是否正在润色（供 App.tsx 判断返回时是否弹确认） */
  isPolishing: boolean;

  // ---- 事件处理 ----
  /** 开始润色（传入文件，设置 POLISHING + 启动 SSE） */
  handleStartPolish: (file: File) => Promise<void>;
  /** 应用选中的修改并下载 */
  handleApplyAndDownload: (acceptedIndices: number[]) => Promise<void>;
  /** 查看历史润色结果 */
  handleViewHistory: (record: PolishHistoryRecord) => void;
  /** 按需触发 IndexedDB 恢复（仅在润色 Tab 可见时调用） */
  triggerRestore: () => Promise<void>;

  // ---- 控制 ----
  /** 中止 SSE 请求 */
  abort: () => void;
  /** 重置所有状态（返回首页时调用） */
  reset: () => void;
}

// ========================================
// Hook 实现
// ========================================

export function usePolishFlow(
  setAppState: (state: AppState) => void,
): UsePolishFlowReturn {
  // ---------- 内部状态 ----------
  const [suggestions, setSuggestions] = useState<PolishSuggestion[]>([]);
  const [summary, setSummary] = useState<PolishSummary | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [totalParagraphs, setTotalParagraphs] = useState(0);
  const [polishableParagraphs, setPolishableParagraphs] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [initialDecisions, setInitialDecisions] = useState<
    Record<number, boolean> | undefined
  >(undefined);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);

  // 恢复标记：避免重复恢复
  const hasRestoredRef = useRef(false);

  // SSE Hook
  const { startPolish: sseStart, abort: sseAbort } = usePolishSSE();

  // ---------- beforeunload 保护 ----------
  // 使用 ref 追踪 isPolishing 以避免 useEffect 闭包问题
  const isPolishingRef = useRef(false);

  useEffect(() => {
    isPolishingRef.current = isPolishing;
  }, [isPolishing]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isPolishingRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // 组件卸载时取消 SSE 请求
  useEffect(() => () => { sseAbort(); }, [sseAbort]);

  // ---------- 事件处理 ----------

  /** 开始润色（传入文件） */
  const handleStartPolish = useCallback(
    async (file: File) => {
      // 重置中间状态
      setSuggestions([]);
      setSummary(null);
      setProgress({ current: 0, total: 0 });
      setIsPolishing(true);
      setAppState("POLISHING");

      try {
        await sseStart(file, {
          onProgress: (total_batches, total_paragraphs, polishable_paragraphs) => {
            setProgress({ current: 0, total: total_batches });
            setTotalParagraphs(total_paragraphs);
            setPolishableParagraphs(polishable_paragraphs);
          },
          onBatchComplete: (batch_index, batchSuggestions) => {
            setProgress((prev) => ({ ...prev, current: batch_index + 1 }));
            if (batchSuggestions.length > 0) {
              setSuggestions((prev) => [...prev, ...batchSuggestions]);
            }
          },
          onRuleScanComplete: (ruleSuggestions) => {
            setSuggestions((prev) => [...prev, ...ruleSuggestions]);
          },
          onComplete: (session_id, finalSuggestions, completeSummary) => {
            setSessionId(session_id);
            setSummary(completeSummary);
            setSuggestions(finalSuggestions);
            setIsPolishing(false);
            setIsReadOnly(false);
            setInitialDecisions(undefined);
            setSessionExpired(false);
            setHistoryRefreshKey((k) => k + 1);
            setAppState("POLISH_PREVIEW");
          },
          onError: (message) => {
            MessagePlugin.error(message);
          },
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setIsPolishing(false);
          return;
        }
        const message =
          err instanceof Error ? err.message : "润色失败，请重试";
        MessagePlugin.error(message);
        setIsPolishing(false);
        setAppState("IDLE");
      }
    },
    [setAppState, sseStart],
  );

  /** 应用选中的修改并下载 */
  const handleApplyAndDownload = useCallback(
    async (acceptedIndices: number[]) => {
      if (!sessionId) return;
      setAppState("POLISH_APPLYING");
      try {
        const result = await applyPolish(sessionId, acceptedIndices);
        const blob = await downloadPolishedFile(sessionId);
        triggerDownload(
          blob,
          result.filename.replace(/\.docx$/, "_polished.docx"),
        );
        setAppState("POLISH_DONE");
        MessagePlugin.success(`已应用 ${result.applied_count} 条修改并下载`);
        markPolishApplied(sessionId)
          .then(() => {
            setHistoryRefreshKey((k) => k + 1);
          })
          .catch(() => {});
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "应用修改失败";
        MessagePlugin.error(message);
        setAppState("POLISH_PREVIEW");
      }
    },
    [sessionId, setAppState],
  );

  /** 查看历史润色结果 */
  const handleViewHistory = useCallback(
    async (record: PolishHistoryRecord) => {
      setSuggestions(record.suggestions);
      setSummary(record.summary);
      setSessionId(record.id);
      setInitialDecisions(record.decisions);
      setAppState("POLISH_PREVIEW");

      // 已应用的记录只读查看，未应用的需要验证后端 session
      if (record.applied) {
        setIsReadOnly(true);
        setSessionExpired(false);
      } else {
        try {
          const status = await checkPolishSessionStatus(record.id);
          if (!status.exists) {
            setIsReadOnly(true);
            setSessionExpired(true);
          } else {
            setIsReadOnly(false);
            setSessionExpired(false);
          }
        } catch {
          setIsReadOnly(true);
          setSessionExpired(true);
        }
      }
    },
    [setAppState],
  );

  /** 按需触发 IndexedDB 恢复（仅执行一次） */
  const triggerRestore = useCallback(async () => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    try {
      const cached = await getLatestPolishResult();
      if (cached && cached.suggestions.length > 0) {
        setSuggestions(cached.suggestions);
        setSummary(cached.summary);
        setSessionId(cached.id);
        setInitialDecisions(cached.decisions);
        setAppState("POLISH_PREVIEW");

        // 验证后端 session 是否仍然有效
        try {
          const status = await checkPolishSessionStatus(cached.id);
          if (!status.exists) {
            setIsReadOnly(true);
            setSessionExpired(true);
            MessagePlugin.warning(
              "已恢复润色结果，但后端会话已过期，如需应用修改请重新润色",
            );
          } else {
            setIsReadOnly(false);
            setSessionExpired(false);
            MessagePlugin.info("已恢复上次的润色结果");
          }
        } catch {
          setIsReadOnly(true);
          setSessionExpired(true);
          MessagePlugin.warning("已恢复润色结果，但无法验证会话状态");
        }
      }
    } catch {
      // 恢复失败，静默处理
    }
  }, [setAppState]);

  // ---------- 控制 ----------

  /** 中止 SSE 请求 */
  const abort = useCallback(() => {
    sseAbort();
    setIsPolishing(false);
  }, [sseAbort]);

  /** 重置所有状态（返回首页时调用） */
  const reset = useCallback(() => {
    sseAbort();
    setSuggestions([]);
    setSummary(null);
    setSessionId("");
    setProgress({ current: 0, total: 0 });
    setTotalParagraphs(0);
    setPolishableParagraphs(0);
    setIsReadOnly(false);
    setInitialDecisions(undefined);
    setSessionExpired(false);
    setIsPolishing(false);
    // 注意：不重置 hasRestoredRef（避免切 Tab 回来重复恢复）
    // 注意：不重置 historyRefreshKey（它是递增的刷新 key）
  }, [sseAbort]);

  // ---------- 返回值 ----------

  return {
    // 数据
    suggestions,
    summary,
    sessionId,
    progress,
    totalParagraphs,
    polishableParagraphs,
    historyRefreshKey,
    isReadOnly,
    initialDecisions,
    sessionExpired,
    isPolishing,

    // 事件处理
    handleStartPolish,
    handleApplyAndDownload,
    handleViewHistory,
    triggerRestore,

    // 控制
    abort,
    reset,
  };
}
