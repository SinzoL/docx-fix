/**
 * PolishHistoryList — 润色历史记录列表（thin wrapper）
 *
 * 基于 GenericHistoryList 实现，配置润色模块特有的渲染逻辑。
 */

import { useCallback } from "react";
import {
  getPolishHistoryList,
  deletePolishHistory,
} from "../services/cache";
import type { PolishHistoryRecord } from "../types";
import GenericHistoryList from "./GenericHistoryList";
import { SvgIcon } from "./icons/SvgIcon";
import { formatTime } from "../utils/format";

interface PolishHistoryListProps {
  onViewResult?: (record: PolishHistoryRecord) => void;
  /** 外部触发刷新（如润色完成后） */
  refreshKey?: number;
}

export default function PolishHistoryList({ onViewResult, refreshKey }: PolishHistoryListProps) {
  const handleClick = useCallback(
    (record: PolishHistoryRecord) => {
      onViewResult?.(record);
    },
    [onViewResult]
  );

  const renderCard = useCallback((record: PolishHistoryRecord) => {
    const totalSuggestions = record.suggestions.length;
    const acceptedCount = Object.values(record.decisions).filter(v => v === true).length;

    return (
      <>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-bold text-slate-800 truncate max-w-full font-display text-lg" title={record.filename}>
              {record.filename}
            </span>
            {record.applied && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200 inline-flex items-center gap-0.5">
                <SvgIcon name="check" size={10} /> 已应用
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1">
              <SvgIcon name="clock" size={12} /> {formatTime(record.created_at)}
            </span>
          </div>
        </div>

        {/* 统计摘要 */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-50 text-violet-600 text-xs font-bold border border-violet-100">
              <SvgIcon name="edit" size={12} /> {totalSuggestions} 条建议
            </span>
            {record.applied ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-bold border border-emerald-100">
                已接受 {acceptedCount}
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-500 text-xs font-bold border border-slate-100">
                待审阅
              </span>
            )}
          </div>
        </div>
      </>
    );
  }, []);

  return (
    <GenericHistoryList<PolishHistoryRecord>
      fetchRecords={getPolishHistoryList}
      deleteRecord={deletePolishHistory}
      renderCard={renderCard}
      onClickRecord={handleClick}
      refreshKey={refreshKey}
      headerIcon="edit"
      headerTitle="润色历史"
      themeClasses={{
        spinner: "border-violet-500",
        hoverShadow: "hover:shadow-violet-500/10",
        gradientFrom: "from-violet-500/5",
        icon: "text-violet-500",
      }}
      emptyIcon="edit"
      emptyTitle="暂无润色记录"
      emptyDescription="润色完成后，结果将自动保存在浏览器本地"
      loadingText="加载润色历史..."
      deleteConfirmText="确定要删除这条润色记录吗？"
    />
  );
}
