/**
 * 检查报告分类分组组件
 *
 * 渲染一个可折叠的分类卡片，包含分类标题、统计徽章和检查项列表。
 * 当同一状态的项目超过 3 个时，自动折叠多余项并提供"展开更多"按钮。
 */

import { useMemo, useState } from "react";
import type { CheckItemResult, AiReviewResult } from "../types";
import { SvgIcon } from "./icons/SvgIcon";
import CheckReportItem from "./CheckReportItem";

const COLLAPSE_THRESHOLD = 3;

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

  // 是否需要折叠：同状态项超过阈值
  const needsCollapse = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.status] = (counts[item.status] || 0) + 1;
    }
    return Object.values(counts).some((c) => c > COLLAPSE_THRESHOLD);
  }, [items]);

  const [expanded, setExpanded] = useState(false);

  // 计算可见项：前 3 项 + 每种状态的前 3 项
  const { visibleItems, hiddenCount } = useMemo(() => {
    if (!needsCollapse || expanded) {
      return { visibleItems: items, hiddenCount: 0 };
    }
    // 按状态分组并只保留前 COLLAPSE_THRESHOLD 项
    const statusSeen: Record<string, number> = {};
    const visible: CheckItemResult[] = [];
    let hidden = 0;
    for (const item of items) {
      const count = statusSeen[item.status] || 0;
      if (count < COLLAPSE_THRESHOLD) {
        visible.push(item);
        statusSeen[item.status] = count + 1;
      } else {
        hidden++;
      }
    }
    return { visibleItems: visible, hiddenCount: hidden };
  }, [items, needsCollapse, expanded]);

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
          {visibleItems.map((item, index) => (
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
          {hiddenCount > 0 && !expanded && (
            <div className="px-6 py-3 text-center">
              <button
                onClick={() => setExpanded(true)}
                className="text-sm font-semibold text-blue-500 hover:text-blue-600 cursor-pointer hover:underline transition-colors"
              >
                展开更多（{hiddenCount} 项）
              </button>
            </div>
          )}
          {expanded && needsCollapse && (
            <div className="px-6 py-3 text-center">
              <button
                onClick={() => setExpanded(false)}
                className="text-sm font-semibold text-blue-500 hover:text-blue-600 cursor-pointer hover:underline transition-colors"
              >
                收起
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
