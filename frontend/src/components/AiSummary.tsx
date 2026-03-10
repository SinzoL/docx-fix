/**
 * AI 总结卡片组件
 *
 * 在检查报告页面顶部展示 AI 生成的自然语言总结。
 * 通过 SSE 流式接收 LLM 输出，逐字渲染，支持 Markdown。
 *
 * 状态机：idle → loading → streaming → done | error
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Markdown from "react-markdown";
import { fetchSSE } from "../services/sse";
import type { CheckReport } from "../types";
import { SvgIcon } from "./icons/SvgIcon";
import { getCachedSummary, setCachedSummary, clearCachedSummary } from "../services/aiCache";

interface AiSummaryProps {
  /** 检查报告数据 */
  report: CheckReport;
}

type SummaryState = "idle" | "loading" | "streaming" | "done" | "error";

export default function AiSummary({ report }: AiSummaryProps) {
  const [state, setState] = useState<SummaryState>("idle");
  const [content, setContent] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  // 防止 StrictMode 下重复请求
  const requestedRef = useRef(false);

  const startSummarize = useCallback(() => {
    // 清理之前的请求
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setState("loading");
    setContent("");
    setErrorMsg("");

    // 用于累积完整内容（回调中无法直接读 content state）
    let fullContent = "";

    fetchSSE("/api/ai/summarize", {
      body: {
        session_id: report.session_id,
        check_report: report,
      },
      onToken: (token) => {
        setState("streaming");
        fullContent += token;
        setContent((prev) => prev + token);
      },
      onDone: () => {
        setState("done");
        // SSE 完成后写入缓存
        if (fullContent) {
          setCachedSummary(report.session_id, fullContent);
        }
      },
      onError: (err) => {
        setState("error");
        setErrorMsg(err);
      },
      signal: controller.signal,
    });
  }, [report]);

  // 检查报告加载完成后自动开始 AI 总结
  useEffect(() => {
    if (!requestedRef.current) {
      requestedRef.current = true;
      // 优先检查缓存
      const cached = getCachedSummary(report.session_id);
      if (cached) {
        // 缓存命中：通过 queueMicrotask 避免在 effect 中直接同步 setState
        queueMicrotask(() => {
          setContent(cached);
          setState("done");
        });
      } else {
        // 缓存未命中：正常发起 SSE
        queueMicrotask(() => {
          startSummarize();
        });
      }
    }

    return () => {
      abortRef.current?.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 空状态：不渲染
  if (state === "idle") return null;

  return (
    <div className="relative overflow-hidden glass-card rounded-2xl p-6 mb-8 border border-blue-200/50 shadow-lg shadow-blue-500/5">
      {/* 动态渐变背景 */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-indigo-50/40 to-purple-50/80 pointer-events-none"></div>
      
      {/* 扫光动画 (加载中显示) */}
      {(state === "loading" || state === "streaming") && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full animate-[gradient-x_2s_ease-in-out_infinite] pointer-events-none"></div>
      )}

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <SvgIcon name="sparkles" size={16} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 font-display bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-700">
            AI 深度诊断分析
          </h3>
          {(state === "loading" || state === "streaming") && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100/50 text-xs font-bold text-blue-600 border border-blue-200">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>
              {state === "loading" ? "AI 正在思考..." : "实时生成中..."}
            </span>
          )}
        </div>

        {/* 错误状态 */}
        {state === "error" && (
          <div className="flex items-center justify-between p-4 bg-rose-50/80 border border-rose-100 rounded-xl">
            <p className="text-sm font-medium text-rose-600 flex items-center gap-2">
              <span className="text-lg"><SvgIcon name="alert-triangle" size={18} /></span>
              AI 分析遇到问题{errorMsg ? `：${errorMsg}` : ""}
            </p>
            <button
              onClick={() => {
                // 清除缓存后重新发起 SSE
                clearCachedSummary(report.session_id);
                requestedRef.current = false;
                startSummarize();
                requestedRef.current = true;
              }}
              className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
            >
              重新分析
            </button>
          </div>
        )}

        {/* 内容区域 */}
        {(state === "streaming" || state === "done") && content && (
          <div className="prose prose-slate prose-sm max-w-none text-slate-700 leading-relaxed font-medium">
            <Markdown>{content}</Markdown>
          </div>
        )}

        {/* 完成状态下的重新分析按钮 */}
        {state === "done" && content && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                clearCachedSummary(report.session_id);
                requestedRef.current = false;
                startSummarize();
                requestedRef.current = true;
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-white/80 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-700 transition-colors cursor-pointer"
            >
              重新分析
            </button>
          </div>
        )}

        {/* 加载骨架 */}
        {state === "loading" && (
          <div className="space-y-3 animate-pulse mt-2">
            <div className="h-2.5 bg-blue-200/40 rounded-full w-3/4"></div>
            <div className="h-2.5 bg-blue-200/40 rounded-full w-full"></div>
            <div className="h-2.5 bg-blue-200/40 rounded-full w-5/6"></div>
          </div>
        )}
      </div>
    </div>
  );
}
