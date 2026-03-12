/**
 * GenericHistoryList<T> — 泛型历史记录列表组件
 *
 * 统一了 HistoryList / ExtractHistoryList / PolishHistoryList 的公共逻辑：
 * - 从缓存加载、删除、清除所有
 * - loading / empty 占位
 * - 网格卡片布局 + 删除确认对话框
 *
 * 差异部分通过 props 配置：
 * - fetchRecords / deleteRecord / clearAllRecords（缓存函数）
 * - renderCard（列表项渲染模板）
 * - headerIcon / headerTitle / themeClasses（视觉差异）
 * - emptyIcon / emptyTitle / emptyDescription（空态文案）
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { MessagePlugin, Dialog } from "tdesign-react";
import { SvgIcon } from "./icons/SvgIcon";

/** 主题色静态 class 集合 — 由 wrapper 传入完整的 Tailwind 类名，避免 JIT 编译失败 */
export interface ThemeClasses {
  /** spinner 边框色，如 "border-blue-500" */
  spinner: string;
  /** 卡片 hover 阴影色，如 "hover:shadow-blue-500/10" */
  hoverShadow: string;
  /** 卡片背景渐变起始色，如 "from-blue-500/5" */
  gradientFrom: string;
  /** 图标色，如 "text-blue-500" */
  icon: string;
}

export interface GenericHistoryListProps<T extends { id: string }> {
  /** 获取记录列表 */
  fetchRecords: () => Promise<T[]>;
  /** 删除单条记录 */
  deleteRecord: (id: string) => Promise<void>;
  /** 清除所有记录（可选，不提供则不显示按钮） */
  clearAllRecords?: () => Promise<void>;
  /** 渲染单条记录卡片内容（不含外层容器和删除按钮） */
  renderCard: (record: T) => ReactNode;
  /** 点击记录 */
  onClickRecord?: (record: T) => void;
  /** 外部触发刷新 */
  refreshKey?: number;
  /** 头部图标名称 */
  headerIcon: string;
  /** 头部标题文案 */
  headerTitle: string;
  /** 主题色静态 class 集合 */
  themeClasses: ThemeClasses;
  /** 空态图标 */
  emptyIcon: string;
  /** 空态标题 */
  emptyTitle: string;
  /** 空态描述 */
  emptyDescription: string;
  /** loading 文案 */
  loadingText?: string;
  /** 删除确认文案 */
  deleteConfirmText?: string;
  /** 清除所有确认文案 */
  clearConfirmText?: string;
}

export default function GenericHistoryList<T extends { id: string }>({
  fetchRecords,
  deleteRecord,
  clearAllRecords,
  renderCard,
  onClickRecord,
  refreshKey,
  headerIcon,
  headerTitle,
  themeClasses,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  loadingText = "加载历史记录...",
  deleteConfirmText = "确定要删除这条记录吗？",
  clearConfirmText = "确定要彻底清除所有历史记录吗？此操作不可撤销。",
}: GenericHistoryListProps<T>) {
  const [records, setRecords] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearDialogVisible, setClearDialogVisible] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 加载历史记录
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchRecords();
      setRecords(list);
    } catch {
      // 缓存不可用
    } finally {
      setLoading(false);
    }
  }, [fetchRecords]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshKey]);

  // 删除单条记录
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteRecord(id);
        setRecords((prev) => prev.filter((r) => r.id !== id));
        setDeleteConfirmId(null);
        MessagePlugin.success("已删除");
      } catch {
        MessagePlugin.error("删除失败，请重试");
      }
    },
    [deleteRecord]
  );

  // 清除所有
  const handleClearAll = useCallback(async () => {
    if (clearAllRecords) {
      try {
        await clearAllRecords();
        setRecords([]);
        setClearDialogVisible(false);
        MessagePlugin.success("已清除所有历史记录");
      } catch {
        MessagePlugin.error("清除失败，请重试");
      }
    }
  }, [clearAllRecords]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <div className={`animate-spin w-6 h-6 border-2 ${themeClasses.spinner} border-t-transparent rounded-full mx-auto mb-2`} />
        <p className="text-sm text-slate-500 font-medium">{loadingText}</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center border-dashed border-2 border-slate-300">
        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <SvgIcon name={emptyIcon} size={24} className="opacity-40" />
        </div>
        <p className="text-base font-bold text-slate-700 font-display mb-1">{emptyTitle}</p>
        <p className="text-sm text-slate-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xl font-bold text-slate-800 font-display flex items-center gap-2">
          <span className={themeClasses.icon}><SvgIcon name={headerIcon} size={20} /></span>
          {headerTitle} ({records.length})
        </h3>
        {clearAllRecords && (
          <button
            onClick={() => setClearDialogVisible(true)}
            className="text-sm font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            清除所有记录
          </button>
        )}
      </div>

      {/* 记录列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {records.map((record) => (
          <div
            key={record.id}
            className={`glass-card rounded-xl p-5 hover:shadow-lg ${themeClasses.hoverShadow} hover:-translate-y-1 transition-all duration-300 cursor-pointer group border-white/60 relative overflow-hidden`}
            onClick={() => onClickRecord?.(record)}
          >
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${themeClasses.gradientFrom} to-transparent rounded-bl-full pointer-events-none transition-opacity opacity-0 group-hover:opacity-100`}></div>

            <div className="flex flex-col h-full justify-between gap-3">
              {renderCard(record)}

              {/* 删除按钮（悬浮显示）—— 固定在卡片底部右侧 */}
              <div className="flex justify-end">
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
        ))}
      </div>

      {/* 清除全部确认对话框 */}
      {clearAllRecords && (
        <Dialog
          visible={clearDialogVisible}
          header="确认清除"
          body={clearConfirmText}
          confirmBtn="确认清除"
          cancelBtn="取消"
          theme="danger"
          onConfirm={handleClearAll}
          onClose={() => setClearDialogVisible(false)}
          onCancel={() => setClearDialogVisible(false)}
        />
      )}

      {/* 单条删除确认对话框 */}
      <Dialog
        visible={!!deleteConfirmId}
        header="确认删除"
        body={deleteConfirmText}
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
