/**
 * 审核建议面板组件
 *
 * 展示 LLM 对提取规则的智能审核建议，支持逐条接受/忽略。
 * 独立组件，通过 props 与父组件通信。
 */

import type { ExtractReviewItem } from "../types";

// ========================================
// 常量配置
// ========================================

/** 严重程度配置 */
const SEVERITY_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  error: { icon: "🔴", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  warning: { icon: "🟡", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  info: { icon: "🔵", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
};

/** 类别标签配置 */
const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  heading_error: { label: "标题级别异常", color: "bg-red-100 text-red-700" },
  hidden_rule: { label: "隐含格式规则", color: "bg-purple-100 text-purple-700" },
  contradiction: { label: "规则矛盾", color: "bg-orange-100 text-orange-700" },
  quality: { label: "质量建议", color: "bg-sky-100 text-sky-700" },
};

// ========================================
// Props 类型
// ========================================

interface ExtractReviewPanelProps {
  /** 审核建议列表 */
  reviewItems: ExtractReviewItem[];
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 已接受的建议 ID 集合 */
  acceptedIds: Set<string>;
  /** 无法应用的建议 ID 集合（YAML 合并失败） */
  failedIds?: Set<string>;
  /** 接受建议的回调 */
  onAccept: (id: string) => void;
  /** 忽略建议的回调 */
  onIgnore: (id: string) => void;
  /** 全部忽略的回调 */
  onIgnoreAll: () => void;
}

// ========================================
// 主组件
// ========================================

export default function ExtractReviewPanel({
  reviewItems,
  loading,
  error,
  acceptedIds,
  failedIds = new Set(),
  onAccept,
  onIgnore,
  onIgnoreAll,
}: ExtractReviewPanelProps) {
  // 加载中状态
  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-white/60 mt-6">
        <div className="flex items-center gap-3 text-slate-600">
          <div className="relative w-6 h-6">
            <div className="absolute inset-0 rounded-full border-2 border-violet-200 animate-spin" style={{ borderTopColor: 'rgb(139, 92, 246)' }}></div>
          </div>
          <span className="text-sm font-medium">🤖 AI 正在审核提取结果...</span>
        </div>
      </div>
    );
  }

  // 错误状态（静默降级，不显示面板）
  if (error) {
    return null;
  }

  // 空结果
  if (reviewItems.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-white/60 mt-6">
        <div className="flex items-center gap-2 text-emerald-600">
          <span className="text-lg">✅</span>
          <span className="text-sm font-medium">审核通过，未发现问题</span>
        </div>
      </div>
    );
  }

  // 统计
  const acceptedCount = acceptedIds.size;
  const totalCount = reviewItems.length;

  return (
    <div className="glass-card rounded-2xl border border-white/60 mt-6 overflow-hidden">
      {/* 标题栏 */}
      <div className="bg-white/40 px-5 py-4 border-b border-slate-200/50 flex items-center justify-between">
        <div>
          <h4 className="text-base font-bold text-slate-700">
            🤖 AI 审核建议
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            共 {totalCount} 条建议 · 已接受 {acceptedCount} 条
          </p>
        </div>
        {acceptedCount > 0 && (
          <button
            onClick={onIgnoreAll}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all cursor-pointer"
          >
            全部忽略
          </button>
        )}
      </div>

      {/* 建议列表 */}
      <div className="divide-y divide-slate-100">
        {reviewItems.map((item) => (
          <ReviewItemCard
            key={item.id}
            item={item}
            isAccepted={acceptedIds.has(item.id)}
            isFailed={failedIds.has(item.id)}
            onAccept={() => onAccept(item.id)}
            onIgnore={() => onIgnore(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ========================================
// 子组件：单条建议卡片
// ========================================

interface ReviewItemCardProps {
  item: ExtractReviewItem;
  isAccepted: boolean;
  isFailed: boolean;
  onAccept: () => void;
  onIgnore: () => void;
}

function ReviewItemCard({
  item,
  isAccepted,
  isFailed,
  onAccept,
  onIgnore,
}: ReviewItemCardProps) {
  const severity = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.info;
  const category = CATEGORY_LABELS[item.category] || {
    label: item.category,
    color: "bg-slate-100 text-slate-700",
  };

  return (
    <div
      className={`px-5 py-4 transition-colors ${
        isAccepted ? "bg-emerald-50/50" : ""
      }`}
    >
      {/* 顶部行：严重程度 + 类别 + ID */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">{severity.icon}</span>
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded-full ${category.color}`}
        >
          {category.label}
        </span>
        <span className="text-xs text-slate-400 font-mono">{item.id}</span>
      </div>

      {/* 问题描述 */}
      <p className="text-sm text-slate-700 leading-relaxed mb-2">
        {item.description}
      </p>

      {/* 影响路径 */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs text-slate-400">影响路径：</span>
        <code className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
          {item.section_path}
        </code>
      </div>

      {/* 源文本（仅 hidden_rule 类别） */}
      {item.source_text && (
        <div className="mb-2 p-2.5 bg-purple-50 rounded-lg border border-purple-100">
          <div className="text-xs text-purple-500 font-medium mb-1">
            源文本
          </div>
          <div className="text-xs text-purple-700">{item.source_text}</div>
        </div>
      )}

      {/* YAML 补丁预览 */}
      {item.yaml_snippet && (
        <div className="mb-3">
          <pre className="text-xs bg-slate-900 text-green-400 rounded-lg p-3 overflow-x-auto font-mono">
            {item.yaml_snippet}
          </pre>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-2">
        {isFailed ? (
          <span className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 rounded-lg border border-red-200">
            ⚠ 此建议无法应用
          </span>
        ) : isAccepted ? (
          <button
            onClick={onIgnore}
            className="px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-100 rounded-lg hover:bg-emerald-200 transition-all cursor-pointer"
          >
            ✓ 已接受 · 点击撤销
          </button>
        ) : (
          <button
            onClick={onAccept}
            className="px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100 transition-all border border-violet-200 cursor-pointer"
          >
            接受修改
          </button>
        )}
      </div>
    </div>
  );
}
