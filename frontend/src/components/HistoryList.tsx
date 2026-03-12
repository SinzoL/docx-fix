/**
 * 检查历史记录列表组件（thin wrapper）
 *
 * 基于 GenericHistoryList 实现，配置检查模块特有的渲染逻辑。
 */

import { useCallback } from "react";
import {
  getHistoryList,
  deleteHistory,
  clearAll,
} from "../services/cache";
import type { HistoryRecord, CheckReport } from "../types";
import GenericHistoryList from "./GenericHistoryList";
import { SvgIcon } from "./icons/SvgIcon";
import { formatTime } from "../utils/format";

interface HistoryListProps {
  onViewReport?: (report: CheckReport, record: HistoryRecord) => void;
}

export default function HistoryList({ onViewReport }: HistoryListProps) {
  const handleClick = useCallback(
    (record: HistoryRecord) => {
      onViewReport?.(record.check_report, record);
    },
    [onViewReport]
  );

  const renderCard = useCallback((record: HistoryRecord) => {
    const { summary } = record.check_report;
    const hasIssues = summary.fail > 0 || summary.warn > 0;

    return (
      <>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-bold text-slate-800 truncate max-w-full font-display text-lg" title={record.filename}>
              {record.filename}
            </span>
            {record.fix_report && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200">
                <SvgIcon name="sparkles" size={12} /> 已修复
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="bg-slate-100 px-2 py-1 rounded-md">{record.rule_name}</span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1"><SvgIcon name="clock" size={12} /> {formatTime(record.created_at)}</span>
          </div>
        </div>

        {/* 状态摘要 */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            {summary.fail > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 text-xs font-bold border border-rose-100">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                {summary.fail} 错误
              </span>
            )}
            {summary.warn > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-600 text-xs font-bold border border-amber-100">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                {summary.warn} 警告
              </span>
            )}
            {!hasIssues && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-bold border border-emerald-100">
                <span className="text-[10px]"><SvgIcon name="check" size={10} /></span> 全部通过
              </span>
            )}
          </div>
        </div>
      </>
    );
  }, []);

  return (
    <GenericHistoryList<HistoryRecord>
      fetchRecords={getHistoryList}
      deleteRecord={deleteHistory}
      clearAllRecords={clearAll}
      renderCard={renderCard}
      onClickRecord={handleClick}
      headerIcon="folder"
      headerTitle="历史检查"
      themeClasses={{
        spinner: "border-blue-500",
        hoverShadow: "hover:shadow-blue-500/10",
        gradientFrom: "from-blue-500/5",
        icon: "text-blue-500",
      }}
      emptyIcon="folder"
      emptyTitle="暂无历史记录"
      emptyDescription="上传并检查文档后，记录将保存在您的浏览器本地"
      loadingText="唤醒历史记录..."
      deleteConfirmText="确定要删除这条历史记录吗？"
    />
  );
}
