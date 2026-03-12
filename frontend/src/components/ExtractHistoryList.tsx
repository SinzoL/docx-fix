/**
 * ExtractHistoryList — 提取历史记录列表（thin wrapper）
 *
 * 基于 GenericHistoryList 实现，配置提取模块特有的渲染逻辑。
 */

import { useCallback } from "react";
import {
  getExtractHistoryList,
  deleteExtractHistory,
} from "../services/cache";
import type { ExtractHistoryRecord } from "../types";
import GenericHistoryList from "./GenericHistoryList";
import { SvgIcon } from "./icons/SvgIcon";
import { formatTime } from "../utils/format";

interface ExtractHistoryListProps {
  onViewResult?: (record: ExtractHistoryRecord) => void;
  /** 外部触发刷新（如提取完成后） */
  refreshKey?: number;
}

/** 模式标签 */
const modeLabel = (mode: "upload" | "text") =>
  mode === "upload" ? "模板提取" : "AI 生成";
const modeIcon = (mode: "upload" | "text") =>
  mode === "upload" ? "file-text" : "bot";

export default function ExtractHistoryList({
  onViewResult,
  refreshKey,
}: ExtractHistoryListProps) {
  const handleClick = useCallback(
    (record: ExtractHistoryRecord) => {
      onViewResult?.(record);
    },
    [onViewResult]
  );

  const renderCard = useCallback((record: ExtractHistoryRecord) => {
    const styleCount = record.result.summary.style_count;

    return (
      <>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className="font-bold text-slate-800 truncate max-w-full font-display text-lg"
              title={record.filename}
            >
              {record.filename}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold border inline-flex items-center gap-0.5 ${
                record.mode === "upload"
                  ? "bg-purple-100 text-purple-700 border-purple-200"
                  : "bg-amber-100 text-amber-700 border-amber-200"
              }`}
            >
              <SvgIcon name={modeIcon(record.mode)} size={10} />{" "}
              {modeLabel(record.mode)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1">
              <SvgIcon name="clock" size={12} />{" "}
              {formatTime(record.created_at)}
            </span>
          </div>
        </div>

        {/* 统计摘要 */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            {styleCount > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-600 text-xs font-bold border border-purple-100">
                <SvgIcon name="file-text" size={12} /> {styleCount}{" "}
                个样式
              </span>
            )}
            {record.result.summary.has_page_setup && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold border border-blue-100">
                页面设置
              </span>
            )}
            {record.result.summary.has_structure && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-bold border border-emerald-100">
                文档结构
              </span>
            )}
          </div>
        </div>
      </>
    );
  }, []);

  return (
    <GenericHistoryList<ExtractHistoryRecord>
      fetchRecords={getExtractHistoryList}
      deleteRecord={deleteExtractHistory}
      renderCard={renderCard}
      onClickRecord={handleClick}
      refreshKey={refreshKey}
      headerIcon="scan-extract"
      headerTitle="提取历史"
      themeClasses={{
        spinner: "border-purple-500",
        hoverShadow: "hover:shadow-purple-500/10",
        gradientFrom: "from-purple-500/5",
        icon: "text-purple-500",
      }}
      emptyIcon="scan-extract"
      emptyTitle="暂无提取记录"
      emptyDescription="提取规则后，结果将自动保存在浏览器本地"
      loadingText="加载提取历史..."
      deleteConfirmText="确定要删除这条提取记录吗？"
    />
  );
}
