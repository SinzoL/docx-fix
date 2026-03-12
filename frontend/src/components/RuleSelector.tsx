/**
 * 规则选择器组件
 *
 * 展示预置规则和自定义规则的分组下拉列表，
 * 支持加载失败重试和引导创建自定义规则。
 */

import { useMemo } from "react";
import { Select } from "tdesign-react";
import type { RuleInfo, CustomRule } from "../types";
import { SvgIcon } from "./icons/SvgIcon";

interface RuleSelectorProps {
  rules: RuleInfo[];
  customRules: CustomRule[];
  selectedRuleId: string;
  rulesLoading: boolean;
  rulesError: boolean;
  onRuleChange: (val: string) => void;
  onRetry: () => void;
  onGoToExtract?: () => void;
}

export default function RuleSelector({
  rules,
  customRules,
  selectedRuleId,
  rulesLoading,
  rulesError,
  onRuleChange,
  onRetry,
  onGoToExtract,
}: RuleSelectorProps) {
  // Find the default rule for the recommendation hint
  const defaultRule = useMemo(
    () => rules.find((r) => r.is_default),
    [rules],
  );

  return (
    <div className="bg-gradient-to-br from-white/60 to-slate-50/40 p-4 sm:p-6 border-b border-slate-200/50">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 w-full">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-600 text-white text-xs font-bold">1</span>
            选择检查标准
          </label>
          <div className="relative max-w-full sm:max-w-lg rule-select-wrapper" aria-label="选择文档格式检查规则">
            <Select
              value={selectedRuleId}
              onChange={(val) => onRuleChange(val as string)}
              loading={rulesLoading}
              placeholder="请选择格式检查标准（如：学术论文、公文...）"
              size="large"
              popupProps={{
                overlayClassName: "rule-select-popup",
                overlayInnerStyle: {
                  padding: "6px",
                  borderRadius: "14px",
                  boxShadow: "0 20px 40px -8px rgba(0, 0, 0, 0.12), 0 8px 16px -6px rgba(0, 0, 0, 0.08)",
                  border: "1px solid rgba(226, 232, 240, 0.8)",
                  backdropFilter: "blur(16px)",
                  background: "rgba(255, 255, 255, 0.96)",
                  minWidth: "360px",
                  maxHeight: "400px",
                }
              }}
            >
              {/* 预置规则组 */}
              {rules.length > 0 && (
                <Select.OptionGroup label="预置规则" divider={customRules.length > 0}>
                  {rules.map((rule) => (
                    <Select.Option key={rule.id} value={rule.id} label={rule.name} className="rule-select-option">
                      <div className="flex items-center gap-2.5 py-0.5">
                        <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/60 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800 text-sm truncate">{rule.name}</span>
                            {rule.is_preset && (
                              <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-blue-50 text-blue-600 border border-blue-200/60">
                                官方
                              </span>
                            )}
                          </div>
                          {rule.description && (
                            <div className="text-xs text-slate-400 mt-0.5 leading-snug truncate">
                              {rule.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </Select.Option>
                  ))}
                </Select.OptionGroup>
              )}
              {/* 自定义规则组 */}
              {customRules.length > 0 && (
                <Select.OptionGroup label="我的规则">
                  {customRules.map((rule) => (
                    <Select.Option
                      key={`custom:${rule.id}`}
                      value={`custom:${rule.id}`}
                      label={rule.name}
                      className="rule-select-option"
                    >
                      <div className="flex items-center gap-2.5 py-0.5">
                        <span className={`flex-shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center ${
                          rule.source === 'template-extract'
                            ? 'bg-gradient-to-br from-violet-50 to-violet-100 border-violet-200/60'
                            : 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200/60'
                        }`}>
                          {rule.source === 'template-extract' ? (
                            <svg className="w-3.5 h-3.5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                          ) : (
                            <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800 text-sm truncate">{rule.name}</span>
                            <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded-md border ${
                              rule.source === 'template-extract'
                                ? 'bg-violet-50 text-violet-600 border-violet-200/60'
                                : 'bg-amber-50 text-amber-600 border-amber-200/60'
                            }`}>
                              {rule.source === 'template-extract' ? '模板提取' : 'AI 生成'}
                            </span>
                          </div>
                          {rule.source_filename && (
                            <div className="text-xs text-slate-400 mt-0.5 truncate">
                              来源: {rule.source_filename}
                            </div>
                          )}
                        </div>
                      </div>
                    </Select.Option>
                  ))}
                </Select.OptionGroup>
              )}
            </Select>
          </div>
          {/* 默认规则推荐提示 */}
          {!rulesError && !rulesLoading && defaultRule && selectedRuleId === defaultRule.id && (
            <p className="text-xs text-blue-500 mt-2 flex items-center gap-1">
              <SvgIcon name="lightbulb" size={12} />
              推荐使用默认的「{defaultRule.name}」标准开始检查
            </p>
          )}
          {/* 规则加载失败提示 + 重试 */}
          {rulesError && (
            <div className="mt-2.5 flex items-center gap-2 text-xs">
              <span className="text-rose-500 flex items-center gap-1">
                <SvgIcon name="x-circle" size={14} />
                规则加载失败，请检查网络后
              </span>
              <button
                onClick={onRetry}
                disabled={rulesLoading}
                className="text-blue-500 hover:text-blue-600 hover:underline font-semibold cursor-pointer transition-colors disabled:opacity-50"
              >
                {rulesLoading ? "加载中..." : "点击重试"}
              </button>
            </div>
          )}
          {/* 引导用户去提取/创建自定义规则 */}
          {!rulesError && customRules.length === 0 && onGoToExtract && (
            <p className="text-xs text-slate-400 mt-2.5 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              没有找到合适的规则？
              <button
                onClick={onGoToExtract}
                className="text-blue-500 hover:text-blue-600 hover:underline font-medium cursor-pointer transition-colors"
              >
                去提取 / 创建自定义规则 →
              </button>
            </p>
          )}
        </div>
        {/* 规则解释小提示 */}
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-gradient-to-br from-blue-50/60 to-slate-50/80 px-4 py-3 rounded-xl max-w-xs hidden md:block border border-blue-100/50">
          <SvgIcon name="lightbulb" size={14} /> 检查报告将基于此检查标准包含的段落、字体、页边距等规则生成。
        </div>
      </div>
    </div>
  );
}
