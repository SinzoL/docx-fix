/**
 * ExtractHistoryList — 提取历史记录列表
 *
 * 功能：
 * - 从 IndexedDB 读取提取历史记录
 * - 展示文件名、提取模式（上传/AI生成）、时间
 * - 点击可查看历史提取结果
 * - 支持删除单条记录（二次确认）
 *
 * 布局与 PolishHistoryList 保持一致
 */

import { useState, useEffect, useCallback } from "react";
import { MessagePlugin, Dialog } from "tdesign-react";
import {
  getExtractHistoryList,
  deleteExtractHistory,
} from "../services/cache";
import type { ExtractHistoryRecord } from "../types";
import { SvgIcon } from "./icons/SvgIcon";

interface ExtractHistoryListProps {
  onViewResult?: (record: ExtractHistoryRecord) => void;
  /** 外部触发刷新（如提取完成后） */
  refreshKey?: number;
}

export default function ExtractHistoryList({
  onViewResult,
  refreshKey,
}: ExtractHistoryListProps) {
  const [records, setRecords] = useState<ExtractHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 加载历史记录
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getExtractHistoryList();
      setRecords(list);
    } catch {
      // IndexedDB 不可用
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshKey]);

  // 删除单条记录
  const handleDelete = useCallback(async (id: string) => {
    await deleteExtractHistory(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setDeleteConfirmId(null);
    MessagePlugin.success("已删除");
  }, []);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 模式标签
  const modeLabel = (mode: "upload" | "text") =>
    mode === "upload" ? "模板提取" : "AI 生成";

  const modeIcon = (mode: "upload" | "text") =>
    mode === "upload" ? "file-text" : "bot";

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-2" />
        <p className="text-sm text-slate-500 font-medium">加载提取历史...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center border-dashed border-2 border-slate-300">
        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <SvgIcon name="scan-extract" size={24} className="opacity-40" />
        </div>
        <p className="text-base font-bold text-slate-700 font-display mb-1">
          暂无提取记录
        </p>
        <p className="text-sm text-slate-500">
          提取规则后，结果将自动保存在浏览器本地
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xl font-bold text-slate-800 font-display flex items-center gap-2">
          <span className="text-purple-500">
            <SvgIcon name="scan-extract" size={20} />
          </span>
          提取历史 ({records.length})
        </h3>
      </div>

      {/* 记录列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {records.map((record) => {
          const styleCount = record.result.summary.style_count;

          return (
            <div
              key={record.id}
              className="glass-card rounded-xl p-5 hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer group border-white/60 relative overflow-hidden"
              onClick={() => onViewResult?.(record)}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-500/5 to-transparent rounded-bl-full pointer-events-none transition-opacity opacity-0 group-hover:opacity-100"></div>

              <div className="flex flex-col h-full justify-between gap-3">
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(record.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                    title="删除记录"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 删除确认对话框 */}
      <Dialog
        visible={!!deleteConfirmId}
        header="确认删除"
        body="确定要删除这条提取记录吗？"
        confirmBtn="删除"
        cancelBtn="取消"
        theme="danger"
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        onClose={() => setDeleteConfirmId(null)}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
}
