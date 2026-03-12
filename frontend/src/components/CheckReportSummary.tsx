/**
 * 检查报告汇总卡片组件
 *
 * 包含：
 * - 标题 + 文件名 + 检查标准
 * - 操作按钮区（AI 问答、规则详情、一键修复）
 * - 文本修复开关
 * - 规则切换下拉
 * - 四宫格统计数据
 * - 分层统计摘要
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Select, MessagePlugin } from "tdesign-react";
import type {
  CheckReport as CheckReportType,
  RuleInfo,
  CustomRule,
} from "../types";
import { fetchRules, recheckFile } from "../services/api";
import { getAll as getAllCustomRules } from "../services/ruleStorage";
import { SvgIcon } from "./icons/SvgIcon";

interface CheckReportSummaryProps {
  report: CheckReportType;
  onFix: (includeTextFix?: boolean) => void;
  fixLoading: boolean;
  sessionId?: string;
  onRecheck?: (report: CheckReportType, nextSelectedRuleId?: string, nextCustomRulesYaml?: string) => void;
  readOnly: boolean;
  onCustomRulesYamlChange?: (yaml: string | undefined) => void;
  restorableCustomRuleId?: string;
  restorableCustomRulesYaml?: string;
  /** 是否有文本排版检查项 */
  hasTextConvention: boolean;
  /** 是否全部通过 */
  allPass: boolean;
  /** 是否有可修复项 */
  hasFixable: boolean;
  /** 格式层统计 */
  formatStats: { pass: number; warn: number; fail: number };
  /** 排版层统计 */
  tcStats: { pass: number; warn: number; fail: number };
  /** 打开规则详情抽屉 */
  onOpenDrawer: () => void;
  /** 打开 AI 对话 */
  onOpenChat: () => void;
  /** 当前选中的规则 ID（受控） */
  selectedRuleId: string;
  onSelectedRuleIdChange: (ruleId: string) => void;
}

export default function CheckReportSummary({
  report,
  onFix,
  fixLoading,
  sessionId,
  onRecheck,
  readOnly,
  onCustomRulesYamlChange,
  restorableCustomRuleId,
  restorableCustomRulesYaml,
  hasTextConvention,
  allPass,
  hasFixable,
  formatStats,
  tcStats,
  onOpenDrawer,
  onOpenChat,
  selectedRuleId,
  onSelectedRuleIdChange,
}: CheckReportSummaryProps) {
  const [rules, setRules] = useState<RuleInfo[]>([]);
  const [customRules, setCustomRules] = useState<CustomRule[]>([]);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [includeTextFix, setIncludeTextFix] = useState(false);

  // #16: 加载规则列表，卸载时取消飞行中的请求
  const mountedRef = useRef(true);
  const rulesAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      rulesAbortRef.current?.abort();
    };
  }, []);

  const loadRules = useCallback(() => {
    rulesAbortRef.current?.abort();
    const controller = new AbortController();
    rulesAbortRef.current = controller;

    fetchRules(controller.signal)
      .then((res) => { if (mountedRef.current) setRules(res.rules); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      });
    setCustomRules(getAllCustomRules());
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // 切换规则重新检查
  const handleRuleSwitch = async (ruleId: string) => {
    const previousRuleId = selectedRuleId;
    if (recheckLoading) return;
    onSelectedRuleIdChange(ruleId);
    if (ruleId === previousRuleId || !sessionId || !onRecheck) return;

    setRecheckLoading(true);
    try {
      const customRule = customRules.find((r) => `custom:${r.id}` === ruleId);
      const recoveredHistoricalCustomRule =
        restorableCustomRuleId === ruleId && restorableCustomRulesYaml
          ? {
              id: ruleId,
              name: "历史自定义规则",
              yaml_content: restorableCustomRulesYaml,
            }
          : undefined;
      let newReport: CheckReportType;
      let newCustomYaml: string | undefined;

      if (customRule) {
        newReport = await recheckFile(sessionId, "default", customRule.yaml_content, ruleId);
        newCustomYaml = customRule.yaml_content;
      } else if (recoveredHistoricalCustomRule) {
        newReport = await recheckFile(sessionId, "default", recoveredHistoricalCustomRule.yaml_content, ruleId);
        newCustomYaml = recoveredHistoricalCustomRule.yaml_content;
      } else {
        newReport = await recheckFile(sessionId, ruleId, undefined, ruleId);
        newCustomYaml = undefined;
      }

      onRecheck(newReport, ruleId, newCustomYaml);
      onCustomRulesYamlChange?.(newCustomYaml);

      const displayName = customRule
        ? customRule.name
        : recoveredHistoricalCustomRule?.name || rules.find(r => r.id === ruleId)?.name || ruleId;
      MessagePlugin.success(`已切换为「${displayName}」并重新检查`);
    } catch (err: unknown) {
      const isSessionExpired =
        (err instanceof Error && (err.message.includes("不存在") || err.message.includes("已过期"))) ||
        (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404);
      if (isSessionExpired) {
        MessagePlugin.warning("会话已过期，请重新上传文件后再检查");
      } else {
        MessagePlugin.error("重新检查失败，请重试");
      }
      onSelectedRuleIdChange(previousRuleId);
    } finally {
      setRecheckLoading(false);
    }
  };

  const historicalCustomRuleId =
    restorableCustomRuleId && restorableCustomRulesYaml ? restorableCustomRuleId : undefined;
  const showHistoricalCustomOption =
    !!historicalCustomRuleId && !customRules.some((r) => `custom:${r.id}` === historicalCustomRuleId);
  const totalRules = rules.length + customRules.length + (showHistoricalCustomOption ? 1 : 0);

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-6 border-t-4 border-t-blue-500 relative overflow-hidden">
      <div className="absolute -top-20 -right-20 w-48 h-48 bg-blue-400/10 blur-3xl rounded-full pointer-events-none"></div>
      
      {/* 标题 + 操作按钮 */}
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
          {/* AI 问答 */}
          <button
            onClick={onOpenChat}
            className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <span className="text-base"><SvgIcon name="message-circle" size={16} /></span> AI 问答
          </button>

          {/* 规则详情 */}
          <button
            onClick={onOpenDrawer}
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
              aria-label="一键智能修复所有可修复项"
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

      {/* 文本修复开关 */}
      {hasTextConvention && hasFixable && !readOnly && (
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
            {showHistoricalCustomOption && historicalCustomRuleId && (
              <Select.OptionGroup label="历史自定义规则">
                <Select.Option value={historicalCustomRuleId} label="历史自定义规则（本地已删除）" className="rule-select-option">
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="flex-shrink-0 w-5 h-5 rounded-md border bg-slate-50 border-slate-200/60 flex items-center justify-center">
                      <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" /></svg>
                    </span>
                    <span className="font-medium text-slate-700 text-sm">历史自定义规则（本地已删除）</span>
                  </div>
                </Select.Option>
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

      {/* 四宫格统计 */}
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
      {hasTextConvention && (
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
  );
}
