/**
 * 单条检查项组件
 *
 * 渲染检查项的状态标签、名称、AI审查标签、消息、位置等信息。
 * 对消息中的专业术语添加下划虚线和悬浮解释。
 */

import { useMemo } from "react";
import type { CheckItemResult, AiReviewResult } from "../types";
import { SvgIcon } from "./icons/SvgIcon";

// 专业术语 → 通俗解释映射
const TERM_GLOSSARY: Record<string, string> = {
  "Run直接格式覆盖": "Word 中直接应用在文字上的格式（非通过样式），会覆盖样式定义",
  "直接格式覆盖": "直接应用在文字上的格式设置，优先级高于样式定义",
  "lineRule": "行距规则，控制行间距的计算方式（如固定值、最小值、多倍行距等）",
  "firstLineChars": "首行缩进的字符数，用于控制段落首行缩进量",
  "firstLine": "首行缩进值，段落第一行相对于左边距的偏移量",
  "hangingChars": "悬挂缩进的字符数",
  "hanging": "悬挂缩进值，段落除首行外的文本相对于左边距的偏移量",
  "beforeLines": "段前间距的行数",
  "afterLines": "段后间距的行数",
  "before": "段前间距，段落上方的额外空白",
  "after": "段后间距，段落下方的额外空白",
  "outline_level": "大纲级别，用于标题的层级结构（1级=章，2级=节...）",
  "charSpace": "字符间距，文档网格中每行的字符数设置",
  "linePitch": "行距磅值，文档网格中的行高设置",
  "numFmt": "编号格式，如 decimal（阿拉伯数字）、upperLetter（大写字母）等",
  "abstractNumId": "抽象编号定义 ID，Word 内部用于关联编号样式的标识符",
  "pPr": "段落属性（Paragraph Properties），Word XML 中定义段落格式的节点",
  "rPr": "文字属性（Run Properties），Word XML 中定义字符格式的节点",
  "w:sz": "字号属性，Word XML 中表示字体大小的标签（单位为半磅）",
  "w:szCs": "复杂文字字号属性，用于中文等复杂文字的字体大小",
  "eastAsia": "东亚字体设置，用于指定中文、日文、韩文等文字使用的字体",
  "ascii": "西文字体设置，用于指定英文、数字等 ASCII 字符使用的字体",
  "hAnsi": "高位 ANSI 字体设置，用于 ASCII 以外的拉丁字符",
};

// 按术语长度降序排列的正则（优先匹配更长的术语）
const TERM_PATTERN = new RegExp(
  `(${Object.keys(TERM_GLOSSARY)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})`,
  "g",
);

/** 将消息文本中的专业术语包裹为带 tooltip 的 span */
function annotateTerms(text: string): React.ReactNode {
  const parts = text.split(TERM_PATTERN);
  if (parts.length === 1) return text; // 没有匹配到任何术语
  return parts.map((part, i) => {
    const explanation = TERM_GLOSSARY[part];
    if (explanation) {
      return (
        <span
          key={i}
          title={explanation}
          className="border-b border-dashed border-slate-400 cursor-help"
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

// 状态颜色和图标映射
const STATUS_CONFIG = {
  PASS: { color: "success" as const, icon: "check", label: "通过" },
  WARN: { color: "warning" as const, icon: "alert-triangle", label: "警告" },
  FAIL: { color: "danger" as const, icon: "x-circle", label: "失败" },
};

// AI 审查标签样式
const AI_VERDICT_CONFIG: Record<string, { label: string; className: string }> = {
  confirmed: { label: "AI 确认 ✓", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  ignored: { label: "AI 可忽略 ○", className: "bg-slate-100 text-slate-500 border-slate-200" },
  uncertain: { label: "待确认 ?", className: "bg-amber-100 text-amber-700 border-amber-200" },
};

interface CheckReportItemProps {
  item: CheckItemResult;
  index: number;
  /** AI 审查结果（合并后端返回与异步审查） */
  aiReview: AiReviewResult | null;
  /** 是否正在 AI 审查 */
  aiReviewLoading: boolean;
  /** 当前展开理由的 item id */
  expandedAiReason: string | null;
  /** 切换展开/收起 AI 审查理由 */
  onToggleAiReason: (itemId: string | null) => void;
}

export default function CheckReportItem({
  item,
  index,
  aiReview,
  aiReviewLoading,
  expandedAiReason,
  onToggleAiReason,
}: CheckReportItemProps) {
  const config = STATUS_CONFIG[item.status];
  const isExpanded = expandedAiReason === item.id;
  const annotatedMessage = useMemo(() => annotateTerms(item.message), [item.message]);

  return (
    <div
      key={`${item.item}-${index}`}
      className="px-6 py-4 flex flex-col sm:flex-row items-start gap-4 hover:bg-blue-50/30 transition-colors"
    >
      <span className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
        item.status === 'PASS' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
        item.status === 'WARN' ? 'bg-amber-50 text-amber-700 border-amber-200' :
        'bg-rose-50 text-rose-700 border-rose-200'
      }`}>
        <SvgIcon name={config.icon} size={14} /> {config.label}
      </span>

      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-bold text-slate-800 text-sm">
            {item.item}
          </span>
          {item.fixable && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10px] font-bold uppercase tracking-wider">
              支持自动修复
            </span>
          )}
          {/* AI 审查加载中 */}
          {item.id && aiReviewLoading && !aiReview && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[10px] font-bold flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
              AI 审查中...
            </span>
          )}
          {/* AI 审查结果标签 */}
          {aiReview && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleAiReason(isExpanded ? null : (item.id ?? null));
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition-all hover:opacity-80 ${
                AI_VERDICT_CONFIG[aiReview.verdict]?.className ?? AI_VERDICT_CONFIG.uncertain.className
              }`}
            >
              {AI_VERDICT_CONFIG[aiReview.verdict]?.label ?? "待确认 ?"}
            </button>
          )}
        </div>
        <p className={`text-sm break-all ${
          item.status === 'FAIL' ? 'text-rose-600 font-medium' :
          item.status === 'WARN' ? 'text-amber-700' :
          'text-slate-500'
        }`}>
          {annotatedMessage}
        </p>
        {/* AI 审查理由展开 */}
        {aiReview && isExpanded && aiReview.reason && (
          <div className="mt-2 p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-blue-800">
            <span className="font-semibold">AI 分析：</span> {aiReview.reason}
          </div>
        )}
        {item.location && (
          <div className="flex items-center gap-1 mt-2">
            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-medium font-mono flex items-center gap-1">
              <SvgIcon name="map-pin" size={12} /> {item.location}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
