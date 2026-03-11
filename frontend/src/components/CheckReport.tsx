/**
 * 检查报告组件
 *
 * 功能：
 * - 按类别分组展示检查项（分为"格式检查"和"通用排版习惯"两大区域）
 * - 显示 PASS/WARN/FAIL 状态标签
 * - 显示汇总统计（通过/警告/失败/可修复，分层统计）
 * - 一键修复按钮（有可修复项时启用）+ 文本修复开关
 * - 切换规则重新检查（包括自定义规则）
 * - 查看规则详情
 * - AI 审查标签（confirmed/ignored/uncertain）
 * - 异步 AI 审查加载态
 * - #13: 历史报告只读模式
 */

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Drawer } from "tdesign-react";
import type {
  CheckReport as CheckReportType,
  CheckItemResult,
  AiReviewResult,
} from "../types";
import { reviewConventions } from "../services/api";
import RuleDetail from "./RuleDetail";
import AiSummary from "./AiSummary";
import AiChatPanel from "./AiChatPanel";
import CheckReportSummary from "./CheckReportSummary";
import CheckReportCategory from "./CheckReportCategory";
import { SvgIcon } from "./icons/SvgIcon";

interface CheckReportProps {
  report: CheckReportType;
  onFix: (includeTextFix?: boolean) => void;
  fixLoading: boolean;
  sessionId?: string;
  onRecheck?: (report: CheckReportType) => void;
  /** #13: 只读模式（历史报告查看时启用，禁用修复和切换规则） */
  readOnly?: boolean;
  /** #2: 当前自定义规则 YAML */
  customRulesYaml?: string;
  /** #2: 自定义规则 YAML 变更回调 */
  onCustomRulesYamlChange?: (yaml: string | undefined) => void;
}

export default function CheckReportView({
  report,
  onFix,
  fixLoading,
  sessionId,
  onRecheck,
  readOnly = false,
  onCustomRulesYamlChange,
}: CheckReportProps) {
  const [selectedRuleId, setSelectedRuleId] = useState(report.rule_id);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);

  // AI 审查状态
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiReviews, setAiReviews] = useState<Record<string, AiReviewResult>>({});
  const [expandedAiReason, setExpandedAiReason] = useState<string | null>(null);

  // #16: 卸载时取消飞行中的请求
  const mountedRef = useRef(true);
  const reviewAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      reviewAbortRef.current?.abort();
    };
  }, []);

  // 自动发起 AI 审查
  useEffect(() => {
    const meta = report.text_convention_meta;
    if (!meta || meta.disputed_items.length === 0 || !sessionId) return;

    reviewAbortRef.current?.abort();
    const controller = new AbortController();
    reviewAbortRef.current = controller;

    // 使用微任务延迟 setState，避免 effect 内同步 setState 触发级联渲染
    queueMicrotask(() => setAiReviewLoading(true));
    reviewConventions(
      sessionId,
      meta.disputed_items,
      meta.document_stats,
      controller.signal,
    )
      .then((res) => {
        if (!mountedRef.current) return;
        const reviewMap: Record<string, AiReviewResult> = {};
        for (const r of res.reviews) {
          reviewMap[r.id] = { verdict: r.verdict, reason: r.reason };
        }
        setAiReviews(reviewMap);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => {
        if (mountedRef.current) setAiReviewLoading(false);
      });
  }, [report.text_convention_meta, sessionId]);

  // 分层分组：格式检查 vs 文本排版习惯
  const { formatItems, textConventionItems, formatGroups, tcGroups } = useMemo(() => {
    const fItems: CheckItemResult[] = [];
    const tcItems: CheckItemResult[] = [];

    for (const item of report.items) {
      if (item.check_layer === "text_convention") {
        tcItems.push(item);
      } else {
        fItems.push(item);
      }
    }

    const fGroups: Record<string, CheckItemResult[]> = {};
    for (const item of fItems) {
      if (!fGroups[item.category]) fGroups[item.category] = [];
      fGroups[item.category].push(item);
    }

    const tGroups: Record<string, CheckItemResult[]> = {};
    for (const item of tcItems) {
      if (!tGroups[item.category]) tGroups[item.category] = [];
      tGroups[item.category].push(item);
    }

    return { formatItems: fItems, textConventionItems: tcItems, formatGroups: fGroups, tcGroups: tGroups };
  }, [report.items]);

  const formatCategories = Object.keys(formatGroups);
  const tcCategories = Object.keys(tcGroups);
  const hasFixable = report.summary.fixable > 0;
  const allPass = report.summary.fail === 0 && report.summary.warn === 0;

  // 分层统计
  const formatStats = useMemo(() => ({
    pass: formatItems.filter(i => i.status === "PASS").length,
    warn: formatItems.filter(i => i.status === "WARN").length,
    fail: formatItems.filter(i => i.status === "FAIL").length,
  }), [formatItems]);

  const tcStats = useMemo(() => ({
    pass: textConventionItems.filter(i => i.status === "PASS").length,
    warn: textConventionItems.filter(i => i.status === "WARN").length,
    fail: textConventionItems.filter(i => i.status === "FAIL").length,
  }), [textConventionItems]);

  // 折叠状态
  const allCategories = [...formatCategories, ...tcCategories];
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    const allGroups = { ...formatGroups, ...tcGroups };
    for (const cat of allCategories) {
      const hasIssues = allGroups[cat]?.some(i => i.status !== 'PASS');
      init[cat] = !hasIssues;
    }
    return init;
  });
  const [formatSectionCollapsed, setFormatSectionCollapsed] = useState(false);
  const [tcSectionCollapsed, setTcSectionCollapsed] = useState(false);

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  // 获取合并后的 AI 审查结果
  const getAiReview = useCallback((item: CheckItemResult): AiReviewResult | null => {
    if (item.ai_review) return item.ai_review;
    if (item.id && aiReviews[item.id]) return aiReviews[item.id];
    return null;
  }, [aiReviews]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* #13: 只读模式提示 */}
      {readOnly && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm font-medium">
          <SvgIcon name="alert-triangle" size={18} />
          <span>正在查看历史报告（只读模式）。如需修复或切换检查标准，请重新上传文件。</span>
        </div>
      )}

      {/* AI 总结卡片 */}
      <AiSummary report={report} />

      {/* 汇总卡片（含规则切换、统计、操作按钮） */}
      <CheckReportSummary
        report={report}
        onFix={onFix}
        fixLoading={fixLoading}
        sessionId={sessionId}
        onRecheck={(newReport) => {
          onRecheck?.(newReport);
          setAiReviews({});
        }}
        readOnly={readOnly}
        onCustomRulesYamlChange={onCustomRulesYamlChange}
        hasTextConvention={textConventionItems.length > 0}
        allPass={allPass}
        hasFixable={hasFixable}
        formatStats={formatStats}
        tcStats={tcStats}
        onOpenDrawer={() => setDrawerVisible(true)}
        onOpenChat={() => setChatVisible(true)}
        selectedRuleId={selectedRuleId}
        onSelectedRuleIdChange={setSelectedRuleId}
      />

      {/* 格式检查区域 */}
      {formatCategories.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2 pt-2">
            <button
              onClick={() => setFormatSectionCollapsed(!formatSectionCollapsed)}
              className="text-lg font-bold text-slate-800 font-display flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors"
            >
              <span className="text-slate-400 transition-transform" style={{ transform: formatSectionCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
                <SvgIcon name="chevron-right" size={16} />
              </span>
              格式检查
              <span className="text-sm font-semibold text-slate-500">({formatItems.length})</span>
            </button>
          </div>
          
          {!formatSectionCollapsed && formatCategories.map((category) => (
            <CheckReportCategory
              key={category}
              category={category}
              items={formatGroups[category]}
              collapsed={collapsed[category] ?? false}
              onToggle={() => toggleCategory(category)}
              getAiReview={getAiReview}
              aiReviewLoading={aiReviewLoading}
              expandedAiReason={expandedAiReason}
              onToggleAiReason={setExpandedAiReason}
            />
          ))}
        </div>
      )}

      {/* 通用排版习惯区域 */}
      {tcCategories.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2 pt-2">
            <button
              onClick={() => setTcSectionCollapsed(!tcSectionCollapsed)}
              className="text-lg font-bold text-violet-800 font-display flex items-center gap-2 cursor-pointer hover:text-violet-600 transition-colors"
            >
              <span className="text-violet-400 transition-transform" style={{ transform: tcSectionCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
                <SvgIcon name="chevron-right" size={16} />
              </span>
              通用排版习惯
              <span className="text-sm font-semibold text-violet-500">({textConventionItems.length})</span>
              {aiReviewLoading && (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-bold flex items-center gap-1">
                  <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
                  AI 审查中...
                </span>
              )}
            </button>
          </div>
          
          {!tcSectionCollapsed && tcCategories.map((category) => (
            <CheckReportCategory
              key={category}
              category={category}
              items={tcGroups[category]}
              collapsed={collapsed[category] ?? false}
              onToggle={() => toggleCategory(category)}
              getAiReview={getAiReview}
              aiReviewLoading={aiReviewLoading}
              expandedAiReason={expandedAiReason}
              onToggleAiReason={setExpandedAiReason}
            />
          ))}
        </div>
      )}
      
      {/* 规则详情抽屉 */}
      <Drawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        header={<span className="font-display font-bold text-lg">规则详情 - {report.rule_name}</span>}
        size="medium"
      >
        <RuleDetail ruleId={selectedRuleId} />
      </Drawer>

      {/* AI 对话面板 */}
      <AiChatPanel
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        report={report}
      />
    </div>
  );
}
