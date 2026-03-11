/**
 * 单条检查项组件
 *
 * 渲染检查项的状态标签、名称、AI审查标签、消息、位置等信息。
 */

import type { CheckItemResult, AiReviewResult } from "../types";
import { SvgIcon } from "./icons/SvgIcon";

// 状态颜色和图标映射
const STATUS_CONFIG = {
  PASS: { color: "success" as const, icon: "check", label: "通过" },
  WARN: { color: "warning" as const, icon: "alert-triangle", label: "警告" },
  FAIL: { color: "danger" as const, icon: "x-circle", label: "失败" },
};

// AI 审查标签样式
const AI_VERDICT_CONFIG: Record<string, { label: string; className: string }> = {
  confirmed: { label: "AI 确认 ✓", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  ignored: { label: "AI 可忽略 ○", className: "bg-slate-100 text-slate-500 border-slate-200" },
  uncertain: { label: "待确认 ?", className: "bg-amber-100 text-amber-700 border-amber-200" },
};

interface CheckReportItemProps {
  item: CheckItemResult;
  index: number;
  /** AI 审查结果（合并后端返回与异步审查） */
  aiReview: AiReviewResult | null;
  /** 是否正在 AI 审查 */
  aiReviewLoading: boolean;
  /** 当前展开理由的 item id */
  expandedAiReason: string | null;
  /** 切换展开/收起 AI 审查理由 */
  onToggleAiReason: (itemId: string | null) => void;
}

export default function CheckReportItem({
  item,
  index,
  aiReview,
  aiReviewLoading,
  expandedAiReason,
  onToggleAiReason,
}: CheckReportItemProps) {
  const config = STATUS_CONFIG[item.status];
  const isExpanded = expandedAiReason === item.id;

  return (
    <div
      key={`${item.item}-${index}`}
      className="px-6 py-4 flex flex-col sm:flex-row items-start gap-4 hover:bg-blue-50/30 transition-colors"
    >
      <span className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
        item.status === 'PASS' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
        item.status === 'WARN' ? 'bg-amber-50 text-amber-700 border-amber-200' :
        'bg-rose-50 text-rose-700 border-rose-200'
      }`}>
        <SvgIcon name={config.icon} size={14} /> {config.label}
      </span>

      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-bold text-slate-800 text-sm">
            {item.item}
          </span>
          {item.fixable && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10px] font-bold uppercase tracking-wider">
              支持自动修复
            </span>
          )}
          {/* AI 审查加载中 */}
          {item.id && aiReviewLoading && !aiReview && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[10px] font-bold flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
              AI 审查中...
            </span>
          )}
          {/* AI 审查结果标签 */}
          {aiReview && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleAiReason(isExpanded ? null : (item.id ?? null));
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition-all hover:opacity-80 ${
                AI_VERDICT_CONFIG[aiReview.verdict]?.className ?? AI_VERDICT_CONFIG.uncertain.className
              }`}
            >
              {AI_VERDICT_CONFIG[aiReview.verdict]?.label ?? "待确认 ?"}
            </button>
          )}
        </div>
        <p className={`text-sm break-all ${
          item.status === 'FAIL' ? 'text-rose-600 font-medium' :
          item.status === 'WARN' ? 'text-amber-700' :
          'text-slate-500'
        }`}>
          {item.message}
        </p>
        {/* AI 审查理由展开 */}
        {aiReview && isExpanded && aiReview.reason && (
          <div className="mt-2 p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-blue-800">
            <span className="font-semibold">AI 分析：</span> {aiReview.reason}
          </div>
        )}
        {item.location && (
          <div className="flex items-center gap-1 mt-2">
            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-medium font-mono flex items-center gap-1">
              <SvgIcon name="map-pin" size={12} /> {item.location}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
