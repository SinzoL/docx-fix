/**
 * PolishProgress — 润色进度展示组件
 *
 * 显示：
 * - 批次进度条
 * - 段落统计
 * - 实时滚动的建议预览（最近3条）
 */

import type { PolishSuggestion } from "../types";
import { SvgIcon } from "./icons/SvgIcon";

/** 修改类型 → 中文标签 */
const CHANGE_TYPE_LABEL: Record<string, string> = {
  grammar: "语病",
  wording: "用词",
  punctuation: "标点",
  structure: "句式",
  academic: "学术",
  typo: "错别字",
  rule_punctuation: "标点",
  rule_space: "空格",
  rule_fullwidth: "全半角",
};

interface PolishProgressProps {
  progress: { current: number; total: number };
  totalParagraphs: number;
  polishableParagraphs: number;
  suggestions: PolishSuggestion[];
}

export default function PolishProgress({
  progress,
  totalParagraphs,
  polishableParagraphs,
  suggestions,
}: PolishProgressProps) {
  return (
    <div className="px-4 sm:px-6 pb-4">
      <div className="bg-violet-50/60 rounded-xl p-4 border border-violet-100/60">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-violet-700">
            正在润色文档...
          </span>
          <span className="text-xs text-violet-500">
            {progress.current} / {progress.total} 批次
          </span>
        </div>
        <div className="w-full bg-violet-200/50 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-violet-500 to-purple-500 h-2 rounded-full transition-all duration-500"
            style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
          <span>共 {totalParagraphs} 段落，{polishableParagraphs} 段可润色</span>
          <span>{suggestions.length} 条建议</span>
        </div>
      </div>

      {/* 实时显示已完成的建议 */}
      {suggestions.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-slate-500">已发现的润色建议：</p>
          {suggestions.slice(-3).map((s, i) => (
            <div key={i} className="text-xs bg-white/60 rounded-lg p-2 border border-slate-200/50">
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-600 mr-1">
                {s.source === 'rule' ? <SvgIcon name="wrench" size={10} className="inline-block mr-0.5" /> : <SvgIcon name="bot" size={10} className="inline-block mr-0.5" />}
                {CHANGE_TYPE_LABEL[s.change_type] ?? "学术"}
              </span>
              <span className="text-slate-600 line-through">{s.original_text.slice(0, 30)}...</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
