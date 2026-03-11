/**
 * 上传面板组件
 *
 * 功能：
 * - 拖拽/点击上传 .docx 文件
 * - 选择检查模板（规则文件）
 * - 触发上传检查
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Select, MessagePlugin, Upload } from "tdesign-react";
import type { UploadFile } from "tdesign-react";
import { CheckCircleIcon } from "tdesign-icons-react";
import { fetchRules, checkFile } from "../services/api";
import { getAll as getAllCustomRules } from "../services/ruleStorage";
import type { RuleInfo, CheckReport, CustomRule } from "../types";
import { SvgIcon } from "./icons/SvgIcon";

interface UploadPanelProps {
  onCheckStart: () => void;
  onCheckComplete: (report: CheckReport, sessionId: string) => void;
  onError: (message: string) => void;
  selectedRuleId: string;
  onRuleChange: (ruleId: string) => void;
  /** 当选择自定义规则时，传递 YAML 内容（用于 check/fix API 的 custom_rules_yaml 参数） */
  customRulesYaml?: string;
  onCustomRulesYamlChange?: (yaml: string | undefined) => void;
  /** #12: 引导用户前往提取规则面板 */
  onGoToExtract?: () => void;
}

export default function UploadPanel({
  onCheckStart,
  onCheckComplete,
  onError,
  selectedRuleId,
  onRuleChange,
  onCustomRulesYamlChange,
  onGoToExtract,
}: UploadPanelProps) {
  const [rules, setRules] = useState<RuleInfo[]>([]);
  const [customRules, setCustomRules] = useState<CustomRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // 规则加载逻辑（可重试，卸载时取消飞行中的请求）
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const loadRules = useCallback(() => {
    // 取消上一次未完成的请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRulesLoading(true);
    setRulesError(false);

    setCustomRules(getAllCustomRules());

    fetchRules(controller.signal)
      .then((res) => {
        if (!mountedRef.current) return;
        setRules(res.rules);
        if (res.rules.length > 0 && !selectedRuleId) {
          const defaultRule = res.rules.find((r) => r.is_default);
          onRuleChange(defaultRule?.id || res.rules[0].id);
        }
      })
      .catch((err) => {
        // 被取消的请求不处理
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!mountedRef.current) return;
        console.error("加载规则列表失败:", err);
        setRulesError(true);
      })
      .finally(() => {
        if (mountedRef.current) setRulesLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedRuleId/onRuleChange 不应触发重新请求
  }, []);

  // 挂载时加载
  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // 监听 storage 事件同步自定义规则
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "docx-fix:custom-rules") {
        setCustomRules(getAllCustomRules());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // 处理规则选择变化
  const handleRuleChange = useCallback((val: string) => {
    onRuleChange(val);
    // 判断是否选择了自定义规则（自定义规则 ID 是 UUID 格式，以 "custom:" 前缀区分）
    const customRule = customRules.find((r) => `custom:${r.id}` === val);
    if (customRule) {
      onCustomRulesYamlChange?.(customRule.yaml_content);
    } else {
      onCustomRulesYamlChange?.(undefined);
    }
  }, [customRules, onRuleChange, onCustomRulesYamlChange]);

  // 文件变化处理
  const handleFileChange = useCallback(
    (files: Array<UploadFile>) => {
      if (files.length > 0 && files[0].raw) {
        const file = files[0].raw;
        if (!file.name.toLowerCase().endsWith(".docx")) {
          MessagePlugin.error("仅支持 .docx 格式文件");
          return;
        }
        if (file.size > 50 * 1024 * 1024) {
          MessagePlugin.error("文件大小超过 50MB 限制");
          return;
        }
        setSelectedFile(file);
      } else {
        setSelectedFile(null);
      }
    },
    []
  );

  // 上传并检查
  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      MessagePlugin.warning("请先选择文件");
      return;
    }
    if (!selectedRuleId) {
      MessagePlugin.warning("请选择检查标准");
      return;
    }

    setLoading(true);
    onCheckStart();

    const sessionId = crypto.randomUUID();

    try {
      // 判断是否使用自定义规则
      const customRule = customRules.find((r) => `custom:${r.id}` === selectedRuleId);
      let report;
      if (customRule) {
        // 使用自定义规则：传 "default" 作为 rule_id，并附带 custom_rules_yaml
        report = await checkFile(selectedFile, "default", sessionId, customRule.yaml_content);
      } else {
        report = await checkFile(selectedFile, selectedRuleId, sessionId);
      }
      onCheckComplete(report, sessionId);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "检查失败，请重试";
      onError(message);
      MessagePlugin.error(message);
    } finally {
      setLoading(false);
    }
  }, [selectedFile, selectedRuleId, customRules, onCheckStart, onCheckComplete, onError]);

  return (
    <div className="space-y-4">
      {/* 规则选择与文件上传融合在更具设计感的卡片中 */}
      <div className="glass-card rounded-2xl overflow-hidden shadow-xl shadow-blue-500/5 border border-white/60">
        
        {/* 卡片头部：选择模板 */}
        <div className="bg-gradient-to-br from-white/60 to-slate-50/40 p-4 sm:p-6 border-b border-slate-200/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 w-full">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-600 text-white text-xs font-bold">1</span>
                选择检查标准
              </label>
              <div className="relative max-w-full sm:max-w-lg rule-select-wrapper">
                <Select
                  value={selectedRuleId}
                  onChange={(val) => handleRuleChange(val as string)}
                  loading={rulesLoading}
                  placeholder="请选择一个检查规则模板..."
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
                        <Select.Option
                          key={rule.id}
                          value={rule.id}
                          label={rule.name}
                          className="rule-select-option"
                        >
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
              {/* 规则加载失败提示 + 重试 */}
              {rulesError && (
                <div className="mt-2.5 flex items-center gap-2 text-xs">
                  <span className="text-rose-500 flex items-center gap-1">
                    <SvgIcon name="x-circle" size={14} />
                    规则加载失败，请检查网络后
                  </span>
                  <button
                    onClick={loadRules}
                    disabled={rulesLoading}
                    className="text-blue-500 hover:text-blue-600 hover:underline font-semibold cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {rulesLoading ? "加载中..." : "点击重试"}
                  </button>
                </div>
              )}
              {/* #12: 引导用户去提取/创建自定义规则 */}
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
            {/* 可选的规则解释小提示 */}
            <div className="flex items-start gap-2 text-xs text-slate-500 bg-gradient-to-br from-blue-50/60 to-slate-50/80 px-4 py-3 rounded-xl max-w-xs hidden md:block border border-blue-100/50">
              <SvgIcon name="lightbulb" size={14} /> 检查报告将基于此检查标准包含的段落、字体、页边距等规则生成。
            </div>
          </div>
        </div>

        {/* 文件上传区域 */}
        <div className="p-4 sm:p-6">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-600 text-white text-xs font-bold">2</span>
            上传目标文档
          </label>
          <Upload
            theme="custom"
            draggable
            accept=".docx"
            autoUpload={false}
            onChange={handleFileChange}
            multiple={false}
          >
            <div className={`w-full border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-all cursor-pointer group relative overflow-hidden ${
              selectedFile ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-300 hover:border-blue-400 bg-slate-50/30 hover:bg-blue-50/20'
            }`}>
              {/* 背景动效 */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full duration-1000 transition-transform"></div>
              
              {selectedFile ? (
                <div className="flex flex-col items-center gap-4 relative z-10 animate-in zoom-in-95 duration-300">
                  <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-500 shadow-sm">
                    <CheckCircleIcon size="40px" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-800 font-display">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                      {selectedFile.size >= 1024 * 1024
                        ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB`
                        : `${(selectedFile.size / 1024).toFixed(1)} KB`} · 点击或拖拽替换文件
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 relative z-10">
                  <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <svg
                      className="w-8 h-8"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-700 font-display">
                      拖拽文件到此处，或点击浏览
                    </p>
                    <p className="text-sm font-medium text-slate-500 mt-2">
                      仅支持 <span className="text-blue-600">.docx</span> 格式，最大 50MB
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Upload>
        </div>

        {/* 隐私安全声明 */}
        <div className="mx-4 sm:mx-6 mb-2 flex items-start gap-2 text-xs text-slate-400">
          <SvgIcon name="shield-check" size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
          <span>您的论文文档仅在检查期间临时处理，处理完成后立即从服务器删除，不会被存储或用于任何其他用途。</span>
        </div>

        {/* 开始检查按钮 */}
        <div className="p-4 sm:p-5 bg-slate-50/50 border-t border-slate-200/50 flex justify-end">
          <button
            onClick={handleUpload}
            disabled={!selectedFile || !selectedRuleId || loading}
            className={`px-8 sm:px-10 py-2.5 sm:py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform ${
              !selectedFile || !selectedRuleId
                ? 'bg-slate-300 shadow-none cursor-not-allowed opacity-70'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 hover:shadow-blue-500/30 hover:-translate-y-0.5 cursor-pointer'
            }`}
          >
            {loading ? '正在处理...' : '开始深度检查'}
          </button>
        </div>
      </div>
    </div>
  );
}
