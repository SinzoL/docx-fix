/**
 * PolishPanel — 内容润色主面板（状态编排器）
 *
 * 功能：
 * - 拖拽/点击上传 .docx 文件
 * - 委托 usePolishSSE 处理 SSE 润色流
 * - 渐进式渲染已完成的建议
 * - 润色完成后进入预览模式
 *
 * 子组件：PolishProgress（进度）、PolishDone（完成页）、PolishPreview（预览）
 */

import { useState, useCallback, useEffect } from "react";
import { Upload, MessagePlugin } from "tdesign-react";
import type { UploadFile } from "tdesign-react";
import { CheckCircleIcon } from "tdesign-icons-react";
import { SvgIcon } from "./icons/SvgIcon";
import type { PolishSuggestion, PolishSummary, PolishHistoryRecord } from "../types";
import PolishPreview from "./PolishPreview";
import PolishHistoryList from "./PolishHistoryList";
import PolishProgress from "./PolishProgress";
import PolishDone from "./PolishDone";
import { applyPolish, downloadPolishedFile, triggerDownload, checkPolishSessionStatus } from "../services/api";
import { getLatestPolishResult, markPolishApplied } from "../services/cache";
import { usePolishSSE } from "../hooks/usePolishSSE";
import { formatFileSize } from "../utils/format";

interface PolishPanelProps {
  onError?: (message: string) => void;
}

type PolishState = "IDLE" | "UPLOADING" | "POLISHING" | "POLISH_PREVIEW" | "APPLYING" | "DONE";

export default function PolishPanel({ onError }: PolishPanelProps) {
  const [state, setState] = useState<PolishState>("IDLE");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [suggestions, setSuggestions] = useState<PolishSuggestion[]>([]);
  const [summary, setSummary] = useState<PolishSummary | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [totalParagraphs, setTotalParagraphs] = useState(0);
  const [polishableParagraphs, setPolishableParagraphs] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [initialDecisions, setInitialDecisions] = useState<Record<number, boolean> | undefined>(undefined);
  /** session 是否已过期（后端不存在） */
  const [sessionExpired, setSessionExpired] = useState(false);

  const { startPolish, abort } = usePolishSSE();

  // 组件挂载时尝试恢复 IndexedDB 中的润色缓存
  useEffect(() => {
    if (state !== "IDLE" || suggestions.length > 0) return;

    getLatestPolishResult().then(async (cached) => {
      if (cached && cached.suggestions.length > 0) {
        setSuggestions(cached.suggestions);
        setSummary(cached.summary);
        setSessionId(cached.id);
        setInitialDecisions(cached.decisions);
        setState("POLISH_PREVIEW");

        // 验证后端 session 是否仍然有效
        try {
          const status = await checkPolishSessionStatus(cached.id);
          if (!status.exists) {
            // 后端 session 已失效，标记为只读 + 过期
            setIsReadOnly(true);
            setSessionExpired(true);
            MessagePlugin.warning("已恢复润色结果，但后端会话已过期，如需应用修改请重新润色");
          } else {
            setIsReadOnly(false);
            setSessionExpired(false);
            MessagePlugin.info("已恢复上次的润色结果");
          }
        } catch {
          // 网络不可用时也标记为过期（防御性处理）
          setIsReadOnly(true);
          setSessionExpired(true);
          MessagePlugin.warning("已恢复润色结果，但无法验证会话状态");
        }
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 润色进行中，禁止用户意外关闭/刷新页面
  useEffect(() => {
    if (state !== "POLISHING") return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => { window.removeEventListener("beforeunload", handleBeforeUnload); };
  }, [state]);

  // 组件卸载时取消 SSE 请求
  useEffect(() => () => { abort(); }, [abort]);

  // 文件变化处理
  const handleFileChange = useCallback((files: Array<UploadFile>) => {
    if (files.length > 0 && files[0].raw) {
      const file = files[0].raw;
      if (!file.name.toLowerCase().endsWith(".docx")) {
        MessagePlugin.error("仅支持 .docx 格式文件");
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        MessagePlugin.error("文件大小超过 50MB 限制");
        return;
      }
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
    }
  }, []);

  // 开始润色（委托给 usePolishSSE）
  const handleStartPolish = useCallback(async () => {
    if (!selectedFile) {
      MessagePlugin.warning("请先选择文件");
      return;
    }

    setState("UPLOADING");
    setSuggestions([]);
    setSummary(null);
    setProgress({ current: 0, total: 0 });

    try {
      setState("POLISHING");

      await startPolish(selectedFile, {
        onProgress: (total_batches, total_paragraphs, polishable_paragraphs) => {
          setProgress({ current: 0, total: total_batches });
          setTotalParagraphs(total_paragraphs);
          setPolishableParagraphs(polishable_paragraphs);
        },
        onBatchComplete: (batch_index, batchSuggestions) => {
          setProgress(prev => ({ ...prev, current: batch_index + 1 }));
          if (batchSuggestions.length > 0) {
            setSuggestions(prev => [...prev, ...batchSuggestions]);
          }
        },
        onRuleScanComplete: (ruleSuggestions) => {
          setSuggestions(prev => [...prev, ...ruleSuggestions]);
        },
        onComplete: (session_id, finalSuggestions, completeSummary) => {
          setSessionId(session_id);
          setSummary(completeSummary);
          setSuggestions(finalSuggestions);
          setState("POLISH_PREVIEW");
          setIsReadOnly(false);
          setInitialDecisions(undefined);
          setHistoryRefreshKey(k => k + 1);
        },
        onError: (message) => {
          MessagePlugin.error(message);
        },
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "润色失败，请重试";
      onError?.(message);
      MessagePlugin.error(message);
      setState("IDLE");
    }
  }, [selectedFile, onError, startPolish]);

  // 应用选中的修改并下载
  const handleApplyAndDownload = useCallback(async (acceptedIndices: number[]) => {
    if (!sessionId) return;
    setState("APPLYING");
    try {
      const result = await applyPolish(sessionId, acceptedIndices);
      const blob = await downloadPolishedFile(sessionId);
      triggerDownload(blob, result.filename.replace(/\.docx$/, "_polished.docx"));
      setState("DONE");
      MessagePlugin.success(`已应用 ${result.applied_count} 条修改并下载`);
      markPolishApplied(sessionId).then(() => {
        setHistoryRefreshKey(k => k + 1);
      }).catch(() => {});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "应用修改失败";
      MessagePlugin.error(message);
      setState("POLISH_PREVIEW");
    }
  }, [sessionId]);

  // 查看历史润色结果
  const handleViewHistoryResult = useCallback(async (record: PolishHistoryRecord) => {
    setSuggestions(record.suggestions);
    setSummary(record.summary);
    setSessionId(record.id);
    setInitialDecisions(record.decisions);
    setState("POLISH_PREVIEW");

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
  }, []);

  // 重新开始
  const handleReset = useCallback(() => {
    abort();
    setState("IDLE");
    setSelectedFile(null);
    setSuggestions([]);
    setSummary(null);
    setSessionId("");
    setProgress({ current: 0, total: 0 });
    setIsReadOnly(false);
    setInitialDecisions(undefined);
    setSessionExpired(false);
  }, [abort]);

  // ========== 渲染 ==========

  if (state === "POLISH_PREVIEW" || state === "APPLYING") {
    return (
      <PolishPreview
        suggestions={suggestions}
        summary={summary}
        onApply={handleApplyAndDownload}
        onBack={handleReset}
        applying={state === "APPLYING"}
        sessionId={sessionId}
        initialDecisions={initialDecisions}
        readOnly={isReadOnly}
        sessionExpired={sessionExpired}
      />
    );
  }

  if (state === "DONE") {
    return (
      <PolishDone
        onReset={handleReset}
        onViewHistoryResult={handleViewHistoryResult}
        historyRefreshKey={historyRefreshKey}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl overflow-hidden shadow-xl shadow-violet-500/5 border border-white/60">
        {/* 提示信息 */}
        <div className="bg-gradient-to-br from-white/60 to-violet-50/40 p-4 sm:p-6 border-b border-slate-200/50">
          <div className="flex items-start gap-3 text-sm text-slate-600">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex-shrink-0">
              <SvgIcon name="sparkles" size={18} />
            </span>
            <div>
              <p className="font-semibold text-slate-700 mb-1">内容润色模式</p>
              <p className="text-xs text-slate-500">
                AI 将对文档中的文本进行学术表达优化（语病修正、用词润色、句式优化等），同时确保原始语义不变。
                您可以逐条审阅每一处修改，选择接受或拒绝。
              </p>
            </div>
          </div>
        </div>

        {/* 文件上传区域 */}
        <div className="p-4 sm:p-6">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-violet-600 text-white text-xs font-bold">1</span>
            上传目标文档
          </label>
          <Upload
            theme="custom"
            draggable
            accept=".docx"
            autoUpload={false}
            onChange={handleFileChange}
            multiple={false}
          >
            <div className={`w-full border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-all cursor-pointer group relative overflow-hidden ${
              selectedFile ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-300 hover:border-violet-400 bg-slate-50/30 hover:bg-violet-50/20'
            }`}>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full duration-1000 transition-transform"></div>

              {selectedFile ? (
                <div className="flex flex-col items-center gap-4 relative z-10 animate-in zoom-in-95 duration-300">
                  <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-500 shadow-sm">
                    <CheckCircleIcon size="40px" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-800 font-display">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                      {formatFileSize(selectedFile.size)} · 点击或拖拽替换文件
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 relative z-10">
                  <div className="w-20 h-20 bg-violet-50 text-violet-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-700 font-display">
                      拖拽文件到此处，或点击浏览
                    </p>
                    <p className="text-sm font-medium text-slate-500 mt-2">
                      仅支持 <span className="text-violet-600">.docx</span> 格式，最大 50MB
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Upload>
        </div>

        {/* 润色进度（polishing 状态时显示） */}
        {state === "POLISHING" && (
          <PolishProgress
            progress={progress}
            totalParagraphs={totalParagraphs}
            polishableParagraphs={polishableParagraphs}
            suggestions={suggestions}
          />
        )}

        {/* 开始润色按钮 */}
        {(state === "IDLE" || state === "UPLOADING") && (
          <div className="p-4 sm:p-5 bg-slate-50/50 border-t border-slate-200/50 flex justify-end">
            <button
              onClick={handleStartPolish}
              disabled={!selectedFile || state === "UPLOADING"}
              className={`px-8 sm:px-10 py-2.5 sm:py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform ${
                !selectedFile
                  ? 'bg-slate-300 shadow-none cursor-not-allowed opacity-70'
                  : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 hover:shadow-violet-500/30 hover:-translate-y-0.5 cursor-pointer'
              }`}
            >
              {state === "UPLOADING" ? '正在上传...' : '开始内容润色'}
            </button>
          </div>
        )}
      </div>

      {/* 润色历史记录（IDLE 状态显示） */}
      {state === "IDLE" && (
        <div className="mt-8">
          <PolishHistoryList
            onViewResult={handleViewHistoryResult}
            refreshKey={historyRefreshKey}
          />
        </div>
      )}
    </div>
  );
}
