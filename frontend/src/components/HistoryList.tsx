/**
 * 历史记录列表组件
 *
 * 功能：
 * - 从 IndexedDB 读取历史检查记录
 * - 展示文件名、规则名、检查时间、状态摘要
 * - 点击可查看历史报告详情
 * - 支持删除单条记录
 * - 支持清除所有记录
 */

import { useState, useEffect, useCallback } from "react";
import { MessagePlugin, Dialog } from "tdesign-react";
import {
  getHistoryList,
  deleteHistory,
  clearAll,
} from "../services/cache";
import type { HistoryRecord, CheckReport } from "../types";
import { SvgIcon } from "./icons/SvgIcon";

interface HistoryListProps {
  onViewReport?: (report: CheckReport) => void;
}

export default function HistoryList({ onViewReport }: HistoryListProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearDialogVisible, setClearDialogVisible] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 加载历史记录
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getHistoryList();
      setRecords(list);
    } catch {
      // IndexedDB 不可用
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 删除单条记录（需确认）
  const handleDeleteConfirm = useCallback(
    async (id: string) => {
      await deleteHistory(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setDeleteConfirmId(null);
      MessagePlugin.success("已删除");
    },
    []
  );

  // 清除所有
  const handleClearAll = useCallback(async () => {
    await clearAll();
    setRecords([]);
    setClearDialogVisible(false);
    MessagePlugin.success("已清除所有历史记录");
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

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center">
        <div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-slate-500 font-medium">唤醒历史记录...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-slate-300">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl opacity-50"><SvgIcon name="folder" size={28} /></span>
        </div>
        <p className="text-lg font-bold text-slate-700 font-display mb-1">暂无历史记录</p>
        <p className="text-sm font-medium text-slate-500">上传并检查文档后，记录将保存在您的浏览器本地</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xl font-bold text-slate-800 font-display flex items-center gap-2">
          <span className="text-blue-500"><SvgIcon name="folder" size={20} /></span> 历史检查 ({records.length})
        </h3>
        <button
          onClick={() => setClearDialogVisible(true)}
          className="text-sm font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          清除所有记录
        </button>
      </div>

      {/* 记录列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {records.map((record) => {
          const { summary } = record.check_report;
          const hasIssues = summary.fail > 0 || summary.warn > 0;

          return (
            <div
              key={record.id}
              className="glass-card rounded-xl p-5 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer group border-white/60 relative overflow-hidden"
              onClick={() => onViewReport?.(record.check_report)}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-500/5 to-transparent rounded-bl-full pointer-events-none transition-opacity opacity-0 group-hover:opacity-100"></div>
              
              <div className="flex flex-col h-full justify-between gap-4">
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(record.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                    title="删除记录"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 清除确认对话框 */}
      <Dialog
        visible={clearDialogVisible}
        header="确认清除"
        body="确定要彻底清除所有历史记录吗？此操作不可撤销。"
        confirmBtn="确认清除"
        cancelBtn="取消"
        theme="danger"
        onConfirm={handleClearAll}
        onClose={() => setClearDialogVisible(false)}
        onCancel={() => setClearDialogVisible(false)}
      />

      {/* 单条删除确认对话框 */}
      <Dialog
        visible={!!deleteConfirmId}
        header="确认删除"
        body="确定要删除这条历史记录吗？"
        confirmBtn="删除"
        cancelBtn="取消"
        theme="danger"
        onConfirm={() => deleteConfirmId && handleDeleteConfirm(deleteConfirmId)}
        onClose={() => setDeleteConfirmId(null)}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
}
