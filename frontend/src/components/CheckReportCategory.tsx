/**
 * 检查报告分类分组组件
 *
 * 渲染一个可折叠的分类卡片，包含分类标题、统计徽章和检查项列表。
 */

import type { CheckItemResult, AiReviewResult } from "../types";
import { SvgIcon } from "./icons/SvgIcon";
import CheckReportItem from "./CheckReportItem";

interface CheckReportCategoryProps {
  category: string;
  items: CheckItemResult[];
  collapsed: boolean;
  onToggle: () => void;
  /** AI 审查结果映射 */
  getAiReview: (item: CheckItemResult) => AiReviewResult | null;
  aiReviewLoading: boolean;
  expandedAiReason: string | null;
  onToggleAiReason: (itemId: string | null) => void;
}

export default function CheckReportCategory({
  category,
  items,
  collapsed,
  onToggle,
  getAiReview,
  aiReviewLoading,
  expandedAiReason,
  onToggleAiReason,
}: CheckReportCategoryProps) {
  const categoryFails = items.filter((i) => i.status === "FAIL").length;
  const categoryWarns = items.filter((i) => i.status === "WARN").length;
  const categoryPasses = items.filter((i) => i.status === "PASS").length;

  return (
    <div className="glass-card rounded-xl overflow-hidden border border-white/60 transition-all hover:border-blue-200">
      <div
        data-testid="category-header"
        onClick={onToggle}
        className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 cursor-pointer select-none hover:bg-slate-100/80 transition-colors"
      >
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <span className="text-slate-400 transition-transform" style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
            <SvgIcon name="chevron-right" size={16} />
          </span>
          {category}
        </h3>
        <div className="flex gap-2 text-sm font-bold">
          {categoryPasses > 0 && (
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg">
              {categoryPasses} 项通过
            </span>
          )}
          {categoryWarns > 0 && (
            <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg">
              {categoryWarns} 项警告
            </span>
          )}
          {categoryFails > 0 && (
            <span className="px-2.5 py-1 bg-rose-100 text-rose-700 rounded-lg">
              {categoryFails} 项失败
            </span>
          )}
          {categoryFails === 0 && categoryWarns === 0 && (
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg">
              完美通过
            </span>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="divide-y divide-slate-100/50">
          {items.map((item, index) => (
            <CheckReportItem
              key={`${item.item}-${index}`}
              item={item}
              index={index}
              aiReview={getAiReview(item)}
              aiReviewLoading={aiReviewLoading}
              expandedAiReason={expandedAiReason}
              onToggleAiReason={onToggleAiReason}
            />
          ))}
        </div>
      )}
    </div>
  );
}
