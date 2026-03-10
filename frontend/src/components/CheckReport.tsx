/**
 * 检查报告组件
 *
 * 功能：
 * - 按类别分组展示检查项
 * - 显示 PASS/WARN/FAIL 状态标签
 * - 显示汇总统计（通过/警告/失败/可修复）
 * - 一键修复按钮（有可修复项时启用）
 * - 切换规则重新检查
 * - 查看规则详情
 */

import { useMemo, useState, useEffect } from "react";
import { Select, Drawer, MessagePlugin } from "tdesign-react";
import type {
  CheckReport as CheckReportType,
  CheckItemResult,
  RuleInfo,
} from "../types";
import { fetchRules, recheckFile } from "../services/api";
import RuleDetail from "./RuleDetail";
import AiSummary from "./AiSummary";
import AiChatPanel from "./AiChatPanel";
import { SvgIcon } from "./icons/SvgIcon";

interface CheckReportProps {
  report: CheckReportType;
  onFix: () => void;
  fixLoading: boolean;
  sessionId?: string;
  onRecheck?: (report: CheckReportType) => void;
}

// 状态颜色和图标映射
const STATUS_CONFIG = {
  PASS: { color: "success" as const, icon: "check", label: "通过" },
  WARN: { color: "warning" as const, icon: "alert-triangle", label: "警告" },
  FAIL: { color: "danger" as const, icon: "x-circle", label: "失败" },
};

export default function CheckReportView({
  report,
  onFix,
  fixLoading,
  sessionId,
  onRecheck,
}: CheckReportProps) {
  const [rules, setRules] = useState<RuleInfo[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState(report.rule_id);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);

  // 加载规则列表（用于切换）
  useEffect(() => {
    fetchRules()
      .then((res) => setRules(res.rules))
      .catch(() => {});
  }, []);

  // 切换规则重新检查
  const handleRuleSwitch = async (ruleId: string) => {
    setSelectedRuleId(ruleId as string);
    if (ruleId === report.rule_id || !sessionId || !onRecheck) return;

    setRecheckLoading(true);
    try {
      const newReport = await recheckFile(sessionId, ruleId);
      onRecheck(newReport);
      MessagePlugin.success(`已切换为「${rules.find(r => r.id === ruleId)?.name || ruleId}」规则并重新检查`);
    } catch {
      MessagePlugin.error("重新检查失败，请重试");
      setSelectedRuleId(report.rule_id);
    } finally {
      setRecheckLoading(false);
    }
  };

  // 按类别分组
  const groupedItems = useMemo(() => {
    const groups: Record<string, CheckItemResult[]> = {};
    for (const item of report.items) {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    }
    return groups;
  }, [report.items]);

  const categories = Object.keys(groupedItems);
  const hasFixable = report.summary.fixable > 0;
  const allPass = report.summary.fail === 0 && report.summary.warn === 0;

  // 折叠状态：全 PASS 的类别默认折叠，含 FAIL/WARN 的默认展开
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const cat of categories) {
      const hasIssues = groupedItems[cat].some(i => i.status !== 'PASS');
      init[cat] = !hasIssues; // 全 PASS → 折叠
    }
    return init;
  });

  const someCollapsed = categories.some(cat => collapsed[cat]);

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const cat of categories) next[cat] = false;
    setCollapsed(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const cat of categories) next[cat] = true;
    setCollapsed(next);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* AI 总结卡片 */}
      <AiSummary report={report} />

      {/* 汇总卡片 */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border-t-4 border-t-blue-500 relative overflow-hidden">
        {/* 背景光晕装饰 */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-blue-400/10 blur-3xl rounded-full pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 mb-6 relative z-10">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 font-display flex items-center gap-2">
              <span className="text-blue-500"><SvgIcon name="chart-bar" size={22} /></span> 检查诊断报告
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-2 flex items-center gap-2">
              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">{report.filename}</span> 
              <span>·</span> 
              <span>模板：<span className="text-blue-600">{report.rule_name}</span></span>
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
            <button
              disabled={!hasFixable || allPass || fixLoading}
              onClick={onFix}
              className={`px-6 py-2.5 text-sm font-bold rounded-xl flex items-center gap-2 transition-all shadow-md ${
                allPass
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-none cursor-default"
                  : !hasFixable
                    ? "bg-slate-100 text-slate-400 border border-slate-200 shadow-none cursor-not-allowed"
                    : fixLoading
                      ? "bg-blue-400 text-white cursor-wait shadow-none"
                      : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 hover:shadow-blue-500/30 hover:-translate-y-0.5 cursor-pointer"
              }`}
            >
              {allPass
                ? <><SvgIcon name="check" size={16} /> 完美文档</>
                : !hasFixable
                  ? "无可修复项"
                  : fixLoading
                    ? <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        自动修复中...
                      </>
                    : <>
                        <span className="text-base"><SvgIcon name="sparkles" size={16} /></span> 一键智能修复 ({report.summary.fixable})
                      </>}
            </button>
          </div>
        </div>

        {/* 规则切换 */}
        {rules.length > 1 && (
          <div className="mb-6 flex items-center gap-3 p-3 bg-slate-50/50 rounded-xl border border-slate-100">
            <span className="text-sm font-medium text-slate-600 shrink-0">切换其他规则模板：</span>
            <Select
              value={selectedRuleId}
              onChange={(val) => handleRuleSwitch(val as string)}
              loading={recheckLoading}
              style={{ width: "300px" }}
              size="small"
              className="!border-white shadow-sm"
            >
              {rules.map((rule) => (
                <Select.Option key={rule.id} value={rule.id} label={rule.name}>
                  {rule.name}
                </Select.Option>
              ))}
            </Select>
            {recheckLoading && (
              <span className="text-xs font-semibold text-blue-500 flex items-center gap-1">
                <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                重新检查中...
              </span>
            )}
          </div>
        )}

        {/* 统计数据 */}
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
      </div>

      {/* 按类别分组的详细报告 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2 pt-2">
          <h3 className="text-lg font-bold text-slate-800 font-display">具体检查项详情</h3>
          <button
            onClick={someCollapsed ? expandAll : collapseAll}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-blue-300 hover:text-blue-600 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <SvgIcon name={someCollapsed ? 'expand' : 'collapse'} size={14} />
            {someCollapsed ? '展开全部' : '收起全部'}
          </button>
        </div>
        
        {categories.map((category) => {
          const items = groupedItems[category];
          const categoryFails = items.filter((i) => i.status === "FAIL").length;
          const categoryWarns = items.filter((i) => i.status === "WARN").length;
          const categoryPasses = items.filter((i) => i.status === "PASS").length;
          const isCollapsed = collapsed[category] ?? false;

          return (
            <div
              key={category}
              className="glass-card rounded-xl overflow-hidden border border-white/60 transition-all hover:border-blue-200"
            >
              {/* 类别头部 - 可点击折叠/展开 */}
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

              {/* 检查项列表 - 折叠时隐藏 */}
              {!isCollapsed && <div className="divide-y divide-slate-100/50">
                {items.map((item, index) => {
                  const config = STATUS_CONFIG[item.status];
                  return (
                    <div
                      key={`${item.item}-${index}`}
                      className="px-6 py-4 flex flex-col sm:flex-row items-start gap-4 hover:bg-blue-50/30 transition-colors"
                    >
                      {/* 状态标签 */}
                      <span className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                        item.status === 'PASS' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        item.status === 'WARN' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        <SvgIcon name={config.icon} size={14} /> {config.label}
                      </span>

                      {/* 内容 */}
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
                        </div>
                        <p className={`text-sm break-all ${
                          item.status === 'FAIL' ? 'text-rose-600 font-medium' :
                          item.status === 'WARN' ? 'text-amber-700' :
                          'text-slate-500'
                        }`}>
                          {item.message}
                        </p>
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
                })}
              </div>}
            </div>
          );
        })}
      </div>
      
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
