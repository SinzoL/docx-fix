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
import { Select, Drawer, MessagePlugin } from "tdesign-react";
import type {
  CheckReport as CheckReportType,
  CheckItemResult,
  RuleInfo,
  CustomRule,
  AiReviewResult,
} from "../types";
import { fetchRules, recheckFile, reviewConventions } from "../services/api";
import { getAll as getAllCustomRules } from "../services/ruleStorage";
import RuleDetail from "./RuleDetail";
import AiSummary from "./AiSummary";
import AiChatPanel from "./AiChatPanel";
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

// 状态颜色和图标映射
const STATUS_CONFIG = {
  PASS: { color: "success" as const, icon: "check", label: "通过" },
  WARN: { color: "warning" as const, icon: "alert-triangle", label: "警告" },
  FAIL: { color: "danger" as const, icon: "x-circle", label: "失败" },
};

// AI 审查标签样式
const AI_VERDICT_CONFIG = {
  confirmed: { label: "AI 确认 ✓", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  ignored: { label: "AI 可忽略 ○", className: "bg-slate-100 text-slate-500 border-slate-200" },
  uncertain: { label: "待确认 ?", className: "bg-amber-100 text-amber-700 border-amber-200" },
};

export default function CheckReportView({
  report,
  onFix,
  fixLoading,
  sessionId,
  onRecheck,
  readOnly = false,
  onCustomRulesYamlChange,
}: CheckReportProps) {
  const [rules, setRules] = useState<RuleInfo[]>([]);
  const [customRules, setCustomRules] = useState<CustomRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState(report.rule_id);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [includeTextFix, setIncludeTextFix] = useState(false);

  // AI 审查状态
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiReviews, setAiReviews] = useState<Record<string, AiReviewResult>>({});
  const [expandedAiReason, setExpandedAiReason] = useState<string | null>(null);

  // #2 #16: 加载规则列表（服务端 + 本地自定义），卸载时取消飞行中的请求
  const mountedRef = useRef(true);
  const rulesAbortRef = useRef<AbortController | null>(null);
  const reviewAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      rulesAbortRef.current?.abort();
      reviewAbortRef.current?.abort();
    };
  }, []);

  const loadRules = useCallback(() => {
    rulesAbortRef.current?.abort();
    const controller = new AbortController();
    rulesAbortRef.current = controller;

    fetchRules(controller.signal)
      .then((res) => { if (mountedRef.current) setRules(res.rules); })
      .catch((err) => {
        // 被取消的请求或卸载后不处理
        if (err instanceof DOMException && err.name === "AbortError") return;
        // 规则列表加载失败不阻塞报告展示，切换标准下拉框将为空
      });
    setCustomRules(getAllCustomRules());
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // 自动发起 AI 审查（卸载时取消）
  useEffect(() => {
    const meta = report.text_convention_meta;
    if (!meta || meta.disputed_items.length === 0 || !sessionId) return;

    reviewAbortRef.current?.abort();
    const controller = new AbortController();
    reviewAbortRef.current = controller;

    setAiReviewLoading(true);
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
        // AI 审查失败，不影响其他功能
      })
      .finally(() => {
        if (mountedRef.current) setAiReviewLoading(false);
      });
  }, [report.text_convention_meta, sessionId]);

  // #2: 切换规则重新检查（支持自定义规则）
  const handleRuleSwitch = async (ruleId: string) => {
    setSelectedRuleId(ruleId as string);
    if (ruleId === report.rule_id || !sessionId || !onRecheck) return;

    setRecheckLoading(true);
    try {
      const customRule = customRules.find((r) => `custom:${r.id}` === ruleId);
      let newReport: CheckReportType;
      let newCustomYaml: string | undefined;

      if (customRule) {
        newReport = await recheckFile(sessionId, "default", customRule.yaml_content);
        newCustomYaml = customRule.yaml_content;
      } else {
        newReport = await recheckFile(sessionId, ruleId);
        newCustomYaml = undefined;
      }

      onRecheck(newReport);
      onCustomRulesYamlChange?.(newCustomYaml);
      setAiReviews({});  // 清空旧审查结果

      const displayName = customRule
        ? customRule.name
        : rules.find(r => r.id === ruleId)?.name || ruleId;
      MessagePlugin.success(`已切换为「${displayName}」并重新检查`);
    } catch (err: unknown) {
      // 区分 session 过期和其他错误
      const isSessionExpired =
        (err instanceof Error && (err.message.includes("不存在") || err.message.includes("已过期"))) ||
        (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404);
      if (isSessionExpired) {
        MessagePlugin.warning("会话已过期，请重新上传文件后再检查");
      } else {
        MessagePlugin.error("重新检查失败，请重试");
      }
      setSelectedRuleId(report.rule_id);
    } finally {
      setRecheckLoading(false);
    }
  };

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

  // 规则列表合计
  const totalRules = rules.length + customRules.length;

  // 渲染单个检查项
  const renderCheckItem = (item: CheckItemResult, index: number) => {
    const config = STATUS_CONFIG[item.status];
    const review = getAiReview(item);
    const isExpanded = expandedAiReason === item.id;

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
            {/* AI 审查标签 */}
            {item.id && aiReviewLoading && !review && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[10px] font-bold flex items-center gap-1">
                <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                AI 审查中...
              </span>
            )}
            {review && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedAiReason(isExpanded ? null : (item.id ?? null));
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition-all hover:opacity-80 ${
                  AI_VERDICT_CONFIG[review.verdict]?.className ?? AI_VERDICT_CONFIG.uncertain.className
                }`}
              >
                {AI_VERDICT_CONFIG[review.verdict]?.label ?? "待确认 ?"}
              </button>
            )}
          </div>
          <p className={`text-sm break-all ${
            item.status === 'FAIL' ? 'text-rose-600 font-medium' :
            item.status === 'WARN' ? 'text-amber-700' :
            'text-slate-500'
          }`}>
            {item.message}
          </p>
          {/* AI 审查理由展开 */}
          {review && isExpanded && review.reason && (
            <div className="mt-2 p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-blue-800">
              <span className="font-semibold">AI 分析：</span> {review.reason}
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
  };

  // 渲染分组
  const renderCategoryGroup = (category: string, items: CheckItemResult[]) => {
    const categoryFails = items.filter((i) => i.status === "FAIL").length;
    const categoryWarns = items.filter((i) => i.status === "WARN").length;
    const categoryPasses = items.filter((i) => i.status === "PASS").length;
    const isCollapsed = collapsed[category] ?? false;

    return (
      <div
        key={category}
        className="glass-card rounded-xl overflow-hidden border border-white/60 transition-all hover:border-blue-200"
      >
        <div
          data-testid="category-header"
          onClick={() => toggleCategory(category)}
          className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 cursor-pointer select-none hover:bg-slate-100/80 transition-colors"
        >
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <span className="text-slate-400 transition-transform" style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
              <SvgIcon name="chevron-right" size={16} />
            </span>
            {category}
          </h3>
          <div className="flex gap-2 text-sm font-bold">
            {categoryPasses > 0 && (
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg">
                {categoryPasses} 项通过
              </span>
            )}
            {categoryWarns > 0 && (
              <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg">
                {categoryWarns} 项警告
              </span>
            )}
            {categoryFails > 0 && (
              <span className="px-2.5 py-1 bg-rose-100 text-rose-700 rounded-lg">
                {categoryFails} 项失败
              </span>
            )}
            {categoryFails === 0 && categoryWarns === 0 && (
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg">
                完美通过
              </span>
            )}
          </div>
        </div>

        {!isCollapsed && <div className="divide-y divide-slate-100/50">
          {items.map((item, index) => renderCheckItem(item, index))}
        </div>}
      </div>
    );
  };

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

      {/* 汇总卡片 */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border-t-4 border-t-blue-500 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-blue-400/10 blur-3xl rounded-full pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 mb-6 relative z-10">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 font-display flex items-center gap-2">
              <span className="text-blue-500"><SvgIcon name="chart-bar" size={22} /></span> 检查诊断报告
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-2 flex items-center gap-2">
              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">{report.filename}</span> 
              <span>·</span> 
              <span>检查标准：<span className="text-blue-600">{report.rule_name}</span></span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* 问一问 AI */}
            <button
              onClick={() => setChatVisible(true)}
              className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <span className="text-base"><SvgIcon name="message-circle" size={16} /></span> AI 问答
            </button>

            {/* 查看规则详情按钮 */}
            <button
              onClick={() => setDrawerVisible(true)}
              className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <span className="text-base"><SvgIcon name="clipboard-list" size={16} /></span> 规则详情
            </button>

            {/* 修复按钮 */}
            {allPass ? (
              <span className="px-6 py-2.5 text-sm font-bold rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-2">
                <SvgIcon name="check" size={16} /> 完美文档
              </span>
            ) : hasFixable && !readOnly ? (
              <button
                disabled={fixLoading}
                onClick={() => onFix(includeTextFix)}
                className={`px-6 py-2.5 text-sm font-bold rounded-xl flex items-center gap-2 transition-all shadow-md ${
                  fixLoading
                    ? "bg-blue-400 text-white cursor-wait shadow-none"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 hover:shadow-blue-500/30 hover:-translate-y-0.5 cursor-pointer"
                }`}
              >
                {fixLoading
                  ? <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      自动修复中...
                    </>
                  : <>
                      <span className="text-base"><SvgIcon name="sparkles" size={16} /></span> 一键智能修复 ({report.summary.fixable})
                    </>}
              </button>
            ) : null}
          </div>
        </div>

        {/* 文本修复开关（仅在有文本排版问题时显示） */}
        {textConventionItems.length > 0 && hasFixable && !readOnly && (
          <div className="mb-4 flex items-center gap-3 p-3 bg-violet-50/50 rounded-xl border border-violet-100">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeTextFix}
                onChange={(e) => setIncludeTextFix(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span className="text-sm font-medium text-slate-700">同时修复文本排版问题</span>
            </label>
            <span className="text-xs text-slate-500">（连续标点、多余空格等，默认仅修复格式）</span>
          </div>
        )}

        {/* 规则切换 */}
        {totalRules > 1 && !readOnly && (
          <div className="mb-6 flex items-center gap-3 p-3 px-4 bg-gradient-to-r from-slate-50/80 to-white/60 rounded-xl border border-slate-200/60 rule-select-wrapper">
            <span className="text-sm font-medium text-slate-500 shrink-0 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
              切换标准
            </span>
            <Select
              value={selectedRuleId}
              onChange={(val) => handleRuleSwitch(val as string)}
              loading={recheckLoading}
              style={{ width: "280px" }}
              size="small"
              popupProps={{
                overlayClassName: "rule-select-popup",
                overlayInnerStyle: {
                  padding: "6px",
                  borderRadius: "12px",
                  boxShadow: "0 16px 32px -6px rgba(0, 0, 0, 0.1), 0 6px 12px -4px rgba(0, 0, 0, 0.06)",
                  border: "1px solid rgba(226, 232, 240, 0.8)",
                  background: "rgba(255, 255, 255, 0.96)",
                }
              }}
            >
              {rules.length > 0 && (
                <Select.OptionGroup label="预置标准" divider={customRules.length > 0}>
                  {rules.map((rule) => (
                    <Select.Option key={rule.id} value={rule.id} label={rule.name} className="rule-select-option">
                      <div className="flex items-center gap-2 py-0.5">
                        <span className="flex-shrink-0 w-5 h-5 rounded-md bg-blue-50 border border-blue-200/50 flex items-center justify-center">
                          <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </span>
                        <span className="font-medium text-slate-700 text-sm">{rule.name}</span>
                      </div>
                    </Select.Option>
                  ))}
                </Select.OptionGroup>
              )}
              {customRules.length > 0 && (
                <Select.OptionGroup label="我的规则">
                  {customRules.map((rule) => (
                    <Select.Option key={`custom:${rule.id}`} value={`custom:${rule.id}`} label={rule.name} className="rule-select-option">
                      <div className="flex items-center gap-2 py-0.5">
                        <span className={`flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center ${
                          rule.source === 'template-extract'
                            ? 'bg-violet-50 border-violet-200/50'
                            : 'bg-amber-50 border-amber-200/50'
                        }`}>
                          {rule.source === 'template-extract' ? (
                            <svg className="w-3 h-3 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                          ) : (
                            <svg className="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                          )}
                        </span>
                        <span className="font-medium text-slate-700 text-sm">{rule.name}</span>
                        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-md border ${
                          rule.source === 'template-extract'
                            ? 'bg-violet-50 text-violet-600 border-violet-200/60'
                            : 'bg-amber-50 text-amber-600 border-amber-200/60'
                        }`}>
                          {rule.source === 'template-extract' ? '模板提取' : 'AI 生成'}
                        </span>
                      </div>
                    </Select.Option>
                  ))}
                </Select.OptionGroup>
              )}
            </Select>
            {recheckLoading && (
              <span className="text-xs font-semibold text-blue-500 flex items-center gap-1.5 animate-pulse">
                <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                重新检查中...
              </span>
            )}
          </div>
        )}

        {/* 统计数据（分层） */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
          <div className="bg-emerald-50/80 border border-emerald-100 rounded-xl p-5 text-center group hover:bg-emerald-100 transition-colors">
            <div className="text-3xl font-black text-emerald-600 font-display group-hover:scale-110 transition-transform">
              {report.summary.pass_count}
            </div>
            <div className="text-sm font-bold text-emerald-800 mt-1 uppercase tracking-wider">通过项</div>
          </div>
          <div className="bg-amber-50/80 border border-amber-100 rounded-xl p-5 text-center group hover:bg-amber-100 transition-colors">
            <div className="text-3xl font-black text-amber-600 font-display group-hover:scale-110 transition-transform">
              {report.summary.warn}
            </div>
            <div className="text-sm font-bold text-amber-800 mt-1 uppercase tracking-wider">警告项</div>
          </div>
          <div className="bg-rose-50/80 border border-rose-100 rounded-xl p-5 text-center group hover:bg-rose-100 transition-colors">
            <div className="text-3xl font-black text-rose-600 font-display group-hover:scale-110 transition-transform">
              {report.summary.fail}
            </div>
            <div className="text-sm font-bold text-rose-800 mt-1 uppercase tracking-wider">失败项</div>
          </div>
          <div className="bg-blue-50/80 border border-blue-100 rounded-xl p-5 text-center group hover:bg-blue-100 transition-colors relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full duration-1000 transition-transform"></div>
            <div className="text-3xl font-black text-blue-600 font-display group-hover:scale-110 transition-transform relative z-10">
              {report.summary.fixable}
            </div>
            <div className="text-sm font-bold text-blue-800 mt-1 uppercase tracking-wider relative z-10">可一键修复</div>
          </div>
        </div>

        {/* 分层统计摘要 */}
        {textConventionItems.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold relative z-10">
            <span className="px-3 py-1.5 bg-white/80 border border-slate-200 rounded-lg text-slate-600">
              格式: ✓{formatStats.pass} ⚠{formatStats.warn} ✗{formatStats.fail}
            </span>
            <span className="px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg text-violet-700">
              排版习惯: ✓{tcStats.pass} ⚠{tcStats.warn} ✗{tcStats.fail}
            </span>
          </div>
        )}
      </div>

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
          
          {!formatSectionCollapsed && formatCategories.map((category) =>
            renderCategoryGroup(category, formatGroups[category])
          )}
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
          
          {!tcSectionCollapsed && tcCategories.map((category) =>
            renderCategoryGroup(category, tcGroups[category])
          )}
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
