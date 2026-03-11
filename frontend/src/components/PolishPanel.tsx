/**
 * PolishPanel — 内容润色主面板
 *
 * 功能：
 * - 拖拽/点击上传 .docx 文件
 * - SSE 接收润色进度和建议
 * - 渐进式渲染已完成的建议
 * - 润色完成后进入预览模式
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, MessagePlugin } from "tdesign-react";
import type { UploadFile } from "tdesign-react";
import { CheckCircleIcon } from "tdesign-icons-react";
import type { PolishSuggestion, PolishSummary } from "../types";
import PolishPreview from "./PolishPreview";
import { applyPolish, downloadPolishedFile, triggerDownload } from "../services/api";
import { savePolishResult, getLatestPolishResult, markPolishApplied } from "../services/cache";

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

  const abortControllerRef = useRef<AbortController | null>(null);

  // 组件挂载时尝试恢复 IndexedDB 中的润色缓存
  useEffect(() => {
    // 只在 IDLE 状态且没有建议时尝试恢复
    if (state !== "IDLE" || suggestions.length > 0) return;

    getLatestPolishResult().then((cached) => {
      if (cached && cached.suggestions.length > 0) {
        setSuggestions(cached.suggestions);
        setSummary(cached.summary);
        setSessionId(cached.id);
        setState("POLISH_PREVIEW");
        MessagePlugin.info("已恢复上次的润色结果");
      }
    }).catch(() => {
      // IndexedDB 不可用，忽略
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 润色进行中，禁止用户意外关闭/刷新页面
  useEffect(() => {
    if (state !== "POLISHING") return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [state]);

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

  // 开始润色
  const handleStartPolish = useCallback(async () => {
    if (!selectedFile) {
      MessagePlugin.warning("请先选择文件");
      return;
    }

    setState("UPLOADING");
    setSuggestions([]);
    setSummary(null);
    setProgress({ current: 0, total: 0 });

    // 构建 FormData
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("enable_reviewer", "true");

    // 取消上一次未完成的请求
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 使用 fetch 发起 SSE 请求（带 AbortSignal）
      const response = await fetch("/api/polish", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail?.message || `请求失败 (${response.status})`);
      }

      setState("POLISHING");

      // 读取 SSE 流
      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 事件（以 \n\n 分隔）
        const events = buffer.split("\n\n");
        buffer = events.pop() || ""; // 最后一个可能不完整

        for (const eventStr of events) {
          if (!eventStr.trim()) continue;

          const lines = eventStr.split("\n");
          let eventName = "";
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventName = line.slice(7);
            } else if (line.startsWith("data: ")) {
              dataLines.push(line.slice(6));
            }
          }

          const eventData = dataLines.join("\n");

          if (!eventName || !eventData) continue;

          try {
            const data = JSON.parse(eventData);

            switch (eventName) {
              case "rule_scan_complete":
                // 规则扫描完成（毫秒级，先于 LLM 润色结果）
                if (data.suggestions && data.suggestions.length > 0) {
                  setSuggestions(prev => [...prev, ...data.suggestions]);
                }
                break;

              case "progress":
                setProgress({ current: 0, total: data.total_batches || 0 });
                setTotalParagraphs(data.total_paragraphs || 0);
                setPolishableParagraphs(data.polishable_paragraphs || 0);
                break;

              case "batch_complete":
                setProgress(prev => ({ ...prev, current: (data.batch_index || 0) + 1 }));
                if (data.suggestions && data.suggestions.length > 0) {
                  setSuggestions(prev => [...prev, ...data.suggestions]);
                }
                break;

              case "complete":
                setSessionId(data.session_id || "");
                if (data.summary) {
                  setSummary(data.summary);
                }
                // 用完整报告中的 suggestions 替换（确保完整性）
                if (data.suggestions) {
                  setSuggestions(data.suggestions);
                }
                setState("POLISH_PREVIEW");

                // 润色完成后缓存结果到 IndexedDB
                if (data.session_id && data.suggestions) {
                  savePolishResult(
                    data.session_id,
                    selectedFile?.name || "unknown.docx",
                    data.suggestions,
                    data.summary || null,
                  ).catch((err: unknown) => {
                    console.warn("缓存润色结果失败:", err);
                  });
                }
                break;

              case "error":
                MessagePlugin.error(data.message || "润色过程中出错");
                break;
            }
          } catch {
            // JSON 解析失败，跳过
          }
        }
      }
    } catch (err: unknown) {
      // 请求被取消时静默处理（用户主动取消）
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      const message = err instanceof Error ? err.message : "润色失败，请重试";
      onError?.(message);
      MessagePlugin.error(message);
      setState("IDLE");
    }
  }, [selectedFile, onError]);

  // 应用选中的修改并下载
  const handleApplyAndDownload = useCallback(async (acceptedIndices: number[]) => {
    if (!sessionId) return;

    setState("APPLYING");

    try {
      const result = await applyPolish(sessionId, acceptedIndices);
      // 下载文件
      const blob = await downloadPolishedFile(sessionId);
      triggerDownload(blob, result.filename.replace(/\.docx$/, "_polished.docx"));
      setState("DONE");
      MessagePlugin.success(`已应用 ${result.applied_count} 条修改并下载`);

      // 标记缓存为已应用
      markPolishApplied(sessionId).catch(() => {});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "应用修改失败";
      MessagePlugin.error(message);
      setState("POLISH_PREVIEW");
    }
  }, [sessionId]);

  // 重新开始
  const handleReset = useCallback(() => {
    // 取消进行中的 SSE 请求
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState("IDLE");
    setSelectedFile(null);
    setSuggestions([]);
    setSummary(null);
    setSessionId("");
    setProgress({ current: 0, total: 0 });
  }, []);

  // 组件卸载时取消 SSE 请求，避免后端继续调用 LLM
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // 渲染不同状态
  if (state === "POLISH_PREVIEW" || state === "APPLYING") {
    return (
      <PolishPreview
        suggestions={suggestions}
        summary={summary}
        onApply={handleApplyAndDownload}
        onBack={handleReset}
        applying={state === "APPLYING"}
        sessionId={sessionId}
      />
    );
  }

  if (state === "DONE") {
    return (
      <div className="glass-card rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto animate-in fade-in zoom-in-95 duration-500">
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-tr from-green-400 to-emerald-500 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-6 sm:mb-8 animate-bounce">
          <span className="text-3xl sm:text-4xl text-white">✓</span>
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2 sm:mb-3 font-display">润色完成！</h3>
        <p className="text-base sm:text-lg text-slate-600">
          润色后的文档已下载到本地
        </p>
        <button
          onClick={handleReset}
          className="mt-8 px-8 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          润色新文档
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl overflow-hidden shadow-xl shadow-violet-500/5 border border-white/60">
        {/* 提示信息 */}
        <div className="bg-gradient-to-br from-white/60 to-violet-50/40 p-4 sm:p-6 border-b border-slate-200/50">
          <div className="flex items-start gap-3 text-sm text-slate-600">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex-shrink-0">
              ✨
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
                      {selectedFile.size >= 1024 * 1024
                        ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB`
                        : `${(selectedFile.size / 1024).toFixed(1)} KB`} · 点击或拖拽替换文件
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
          <div className="px-4 sm:px-6 pb-4">
            <div className="bg-violet-50/60 rounded-xl p-4 border border-violet-100/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-violet-700">
                  正在润色文档...
                </span>
                <span className="text-xs text-violet-500">
                  {progress.current} / {progress.total} 批次
                </span>
              </div>
              <div className="w-full bg-violet-200/50 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-violet-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                <span>共 {totalParagraphs} 段落，{polishableParagraphs} 段可润色</span>
                <span>{suggestions.length} 条建议</span>
              </div>
            </div>

            {/* 实时显示已完成的建议 */}
            {suggestions.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-slate-500">已发现的润色建议：</p>
                {suggestions.slice(-3).map((s, i) => (
                  <div key={i} className="text-xs bg-white/60 rounded-lg p-2 border border-slate-200/50">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-600 mr-1">
                      {s.source === 'rule' ? '🔧 ' : '🤖 '}
                      {s.change_type === 'grammar' ? '语病' : s.change_type === 'wording' ? '用词' : s.change_type === 'punctuation' ? '标点' : s.change_type === 'structure' ? '句式' : s.change_type === 'typo' ? '错别字' : s.change_type === 'rule_punctuation' ? '标点' : s.change_type === 'rule_space' ? '空格' : s.change_type === 'rule_fullwidth' ? '全半角' : '学术'}
                    </span>
                    <span className="text-slate-600 line-through">{s.original_text.slice(0, 30)}...</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
    </div>
  );
}
