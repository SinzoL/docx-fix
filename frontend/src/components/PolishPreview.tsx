/**
 * PolishPreview — 润色预览组件
 *
 * 功能：
 * - Diff 对比视图展示每条润色建议
 * - 逐条接受/拒绝
 * - 全部接受/全部拒绝
 * - 按修改类型筛选
 * - 语义偏移 ⚠️ 标记
 * - 应用选中的修改并下载
 */

import { useState, useMemo, useCallback, useRef } from "react";
import { SvgIcon } from "./icons/SvgIcon";
import type { PolishSuggestion, PolishSummary } from "../types";
import { updatePolishDecisions } from "../services/cache";

interface PolishPreviewProps {
  suggestions: PolishSuggestion[];
  summary: PolishSummary | null;
  onApply: (acceptedIndices: number[]) => void;
  onBack: () => void;
  applying?: boolean;
  /** 从缓存恢复的 session_id，用于持久化决策 */
  sessionId?: string;
  /** 从缓存恢复的初始决策 */
  initialDecisions?: Record<number, boolean>;
  /** 只读模式：查看历史记录时不允许修改/应用 */
  readOnly?: boolean;
}

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  grammar: { label: "语病修正", color: "text-red-600", bg: "bg-red-50 border-red-200/60" },
  wording: { label: "用词优化", color: "text-blue-600", bg: "bg-blue-50 border-blue-200/60" },
  punctuation: { label: "标点修正", color: "text-amber-600", bg: "bg-amber-50 border-amber-200/60" },
  structure: { label: "句式优化", color: "text-purple-600", bg: "bg-purple-50 border-purple-200/60" },
  academic: { label: "学术规范", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200/60" },
  typo: { label: "错别字", color: "text-orange-600", bg: "bg-orange-50 border-orange-200/60" },
  rule_punctuation: { label: "标点问题", color: "text-amber-700", bg: "bg-amber-50/80 border-amber-300/60" },
  rule_space: { label: "多余空格", color: "text-cyan-600", bg: "bg-cyan-50 border-cyan-200/60" },
  rule_fullwidth: { label: "全半角", color: "text-teal-600", bg: "bg-teal-50 border-teal-200/60" },
};

export default function PolishPreview({
  suggestions,
  summary,
  onApply,
  onBack,
  applying = false,
  sessionId,
  initialDecisions,
  readOnly = false,
}: PolishPreviewProps) {
  // 每条建议的接受/拒绝状态：true = 接受, false = 拒绝
  const [decisions, setDecisions] = useState<Record<number, boolean>>(() => {
    // 优先使用从缓存恢复的决策
    if (initialDecisions && Object.keys(initialDecisions).length > 0) {
      return initialDecisions;
    }
    // 默认全部接受
    const initial: Record<number, boolean> = {};
    suggestions.forEach((_, i) => { initial[i] = true; });
    return initial;
  });

  // 防抖定时器，避免频繁写入 IndexedDB
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 当前筛选类型
  const [filterType, setFilterType] = useState<string>("all");

  // 过滤后的建议列表
  const filteredSuggestions = useMemo(() => {
    if (filterType === "all") return suggestions.map((s, i) => ({ suggestion: s, index: i }));
    return suggestions
      .map((s, i) => ({ suggestion: s, index: i }))
      .filter(({ suggestion }) => suggestion.change_type === filterType);
  }, [suggestions, filterType]);

  // 统计
  const acceptedCount = useMemo(() => {
    return Object.values(decisions).filter(v => v === true).length;
  }, [decisions]);

  // 将决策持久化到 IndexedDB（防抖 1 秒）
  const persistDecisions = useCallback((newDecisions: Record<number, boolean>) => {
    if (!sessionId) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      updatePolishDecisions(sessionId, newDecisions).catch(() => {});
    }, 1000);
  }, [sessionId]);

  // 接受/拒绝
  const handleDecision = useCallback((index: number, accept: boolean) => {
    setDecisions(prev => {
      const next = { ...prev, [index]: accept };
      persistDecisions(next);
      return next;
    });
  }, [persistDecisions]);

  // 全部接受
  const handleAcceptAll = useCallback(() => {
    const newDecisions: Record<number, boolean> = {};
    suggestions.forEach((_, i) => { newDecisions[i] = true; });
    setDecisions(newDecisions);
    persistDecisions(newDecisions);
  }, [suggestions, persistDecisions]);

  // 全部拒绝
  const handleRejectAll = useCallback(() => {
    const newDecisions: Record<number, boolean> = {};
    suggestions.forEach((_, i) => { newDecisions[i] = false; });
    setDecisions(newDecisions);
    persistDecisions(newDecisions);
  }, [suggestions, persistDecisions]);

  // 应用修改
  const handleApply = useCallback(() => {
    const acceptedIndices = Object.entries(decisions)
      .filter(([, accepted]) => accepted)
      .map(([idx]) => parseInt(idx));
    onApply(acceptedIndices);
  }, [decisions, onApply]);

  return (
    <div className="space-y-4">
      {/* 顶部统计卡片 */}
      <div className="glass-card rounded-2xl overflow-hidden shadow-xl shadow-violet-500/5 border border-white/60">
        <div className="bg-gradient-to-br from-white/60 to-violet-50/40 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-100 text-violet-600">
                <SvgIcon name="edit" size={20} />
              </span>
              <div>
                <h3 className="text-lg font-bold text-slate-800 font-display">
                  {readOnly ? "润色结果查看" : "内容润色预览"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {readOnly ? "查看历史润色结果（只读）" : "审阅每条建议，选择接受或拒绝"}
                </p>
              </div>
            </div>
            <button
              onClick={onBack}
              className="text-sm text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
            >
              ← 返回
            </button>
          </div>

          {/* 统计标签 */}
          {summary && (
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                共 {summary.total_suggestions} 条建议
              </span>
              {summary.by_source && (
                <>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-cyan-50 border border-cyan-200/60 text-cyan-600 inline-flex items-center gap-1">
                    <SvgIcon name="wrench" size={12} /> 规则检出 {summary.by_source.rule}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 border border-violet-200/60 text-violet-600 inline-flex items-center gap-1">
                    <SvgIcon name="bot" size={12} /> AI 检出 {summary.by_source.llm}
                  </span>
                </>
              )}
              {Object.entries(summary.by_type).map(([type, count]) => {
                const info = TYPE_LABELS[type] || { label: type, color: "text-slate-600", bg: "bg-slate-50 border-slate-200" };
                return (
                  <span key={type} className={`px-3 py-1 rounded-full text-xs font-semibold border ${info.bg} ${info.color}`}>
                    {info.label} {count}
                  </span>
                );
              })}
              {summary.semantic_warnings > 0 && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-50 border border-orange-200/60 text-orange-600 inline-flex items-center gap-1">
                  <SvgIcon name="alert-triangle" size={12} /> 语义警告 {summary.semantic_warnings}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 操作栏：筛选 + 批量操作 */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50/50 border-t border-b border-slate-200/50 flex flex-wrap items-center justify-between gap-3">
          {/* 类型筛选 */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterType("all")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterType === "all"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              全部
            </button>
            {Object.entries(TYPE_LABELS).map(([type, info]) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  filterType === type
                    ? "bg-violet-600 text-white shadow-sm"
                    : `bg-white ${info.color} hover:bg-slate-100 border border-slate-200`
                }`}
              >
                {info.label}
              </button>
            ))}
          </div>

          {/* 批量操作（只读模式隐藏） */}
          {!readOnly && (
            <div className="flex gap-2">
              <button
                onClick={handleAcceptAll}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200/60 hover:bg-emerald-100 transition-all cursor-pointer inline-flex items-center gap-1"
              >
                <SvgIcon name="check-circle" size={12} /> 全部接受
              </button>
              <button
                onClick={handleRejectAll}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-500 border border-red-200/60 hover:bg-red-100 transition-all cursor-pointer inline-flex items-center gap-1"
              >
                <SvgIcon name="x-circle" size={12} /> 全部拒绝
              </button>
            </div>
          )}
        </div>

        {/* 建议列表 */}
        <div className="p-4 sm:p-6 space-y-3 max-h-[600px] overflow-y-auto">
          {filteredSuggestions.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <p className="text-lg">没有找到匹配的润色建议</p>
            </div>
          )}

          {filteredSuggestions.map(({ suggestion, index }) => {
            const typeInfo = TYPE_LABELS[suggestion.change_type] || TYPE_LABELS.grammar;
            const isAccepted = decisions[index] === true;

            return (
              <div
                key={index}
                className={`rounded-xl border p-4 transition-all ${
                  isAccepted
                    ? "bg-white border-slate-200/80"
                    : "bg-slate-50/50 border-slate-200/40 opacity-60"
                }`}
              >
                {/* 标题行 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-0.5 ${typeInfo.bg} ${typeInfo.color}`}>
                      {suggestion.source === "rule" ? <SvgIcon name="wrench" size={10} /> : <SvgIcon name="bot" size={10} />}{typeInfo.label}
                    </span>
                    <span className="text-xs text-slate-400">
                      第 {suggestion.paragraph_index + 1} 段
                    </span>
                    {suggestion.semantic_warning && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 border border-orange-200/60 text-orange-600 inline-flex items-center gap-0.5" title={suggestion.semantic_warning_text || ""}>
                        <SvgIcon name="alert-triangle" size={10} /> 语义可能有变化
                      </span>
                    )}
                  </div>
                  {!readOnly ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleDecision(index, true)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-0.5 ${
                          isAccepted
                            ? "bg-emerald-500 text-white shadow-sm"
                            : "bg-white text-emerald-500 border border-emerald-200 hover:bg-emerald-50"
                        }`}
                      >
                        <SvgIcon name="check" size={12} /> 接受
                      </button>
                      <button
                        onClick={() => handleDecision(index, false)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-0.5 ${
                          !isAccepted
                            ? "bg-red-500 text-white shadow-sm"
                            : "bg-white text-red-400 border border-red-200 hover:bg-red-50"
                        }`}
                      >
                        <SvgIcon name="x" size={12} /> 拒绝
                      </button>
                    </div>
                  ) : (
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-0.5 ${
                      isAccepted
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                        : "bg-red-50 text-red-500 border border-red-200"
                    }`}>
                      {isAccepted ? <><SvgIcon name="check" size={12} /> 已接受</> : <><SvgIcon name="x" size={12} /> 已拒绝</>}
                    </span>
                  )}
                </div>

                {/* Diff 对比 */}
                <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1.5 font-mono">
                  <div className="flex items-start gap-2">
                    <span className="text-red-400 font-bold flex-shrink-0">-</span>
                    <span className="text-red-600 line-through break-all">{suggestion.original_text}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold flex-shrink-0">+</span>
                    <span className="text-emerald-700 break-all">{suggestion.polished_text}</span>
                  </div>
                </div>

                {/* 修改说明 */}
                {suggestion.explanation && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                    <SvgIcon name="lightbulb" size={13} className="flex-shrink-0 mt-0.5" />
                    <span>{suggestion.explanation}</span>
                  </div>
                )}

                {/* 语义警告详情 */}
                {suggestion.semantic_warning && suggestion.semantic_warning_text && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-orange-600 bg-orange-50 rounded-lg p-2">
                    <SvgIcon name="alert-triangle" size={13} className="flex-shrink-0 mt-0.5" />
                    <span>{suggestion.semantic_warning_text}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 底部操作栏 */}
        <div className="p-4 sm:p-5 bg-slate-50/50 border-t border-slate-200/50 flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {readOnly ? (
              <>已接受 <span className="font-bold text-emerald-600">{acceptedCount}</span> / {suggestions.length} 条修改</>
            ) : (
              <>已选择 <span className="font-bold text-emerald-600">{acceptedCount}</span> / {suggestions.length} 条修改</>
            )}
          </span>
          {readOnly ? (
            <button
              onClick={onBack}
              className="px-8 py-2.5 rounded-xl font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:shadow-sm transition-all cursor-pointer"
            >
              返回列表
            </button>
          ) : (
            <button
              onClick={handleApply}
              disabled={acceptedCount === 0 || applying}
              className={`px-8 py-2.5 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 ${
                acceptedCount === 0 || applying
                  ? "bg-slate-300 shadow-none cursor-not-allowed opacity-70"
                  : "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 hover:shadow-violet-500/30 hover:-translate-y-0.5 cursor-pointer"
              }`}
            >
              {applying ? "正在应用..." : `应用选中的修改并下载 (${acceptedCount})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
