/**
 * 上传面板组件
 *
 * 功能：
 * - 拖拽/点击上传 .docx 文件
 * - 选择检查模板（规则文件）
 * - 触发上传检查
 */

import { useState, useEffect, useCallback } from "react";
import { Select, MessagePlugin, Upload } from "tdesign-react";
import type { UploadFile } from "tdesign-react";
import { CheckCircleIcon } from "tdesign-icons-react";
import { fetchRules, checkFile } from "../services/api";
import { getAll as getAllCustomRules, init as initRuleStorage } from "../services/ruleStorage";
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
}

export default function UploadPanel({
  onCheckStart,
  onCheckComplete,
  onError,
  selectedRuleId,
  onRuleChange,
  onCustomRulesYamlChange,
}: UploadPanelProps) {
  const [rules, setRules] = useState<RuleInfo[]>([]);
  const [customRules, setCustomRules] = useState<CustomRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // 加载规则列表（服务端 + 本地）— 仅在组件挂载时执行一次
  useEffect(() => {
    setRulesLoading(true);

    // 初始化本地存储并加载自定义规则
    initRuleStorage();
    setCustomRules(getAllCustomRules());

    fetchRules()
      .then((res) => {
        setRules(res.rules);
        // 默认选中第一个（应该是 default）
        if (res.rules.length > 0 && !selectedRuleId) {
          const defaultRule = res.rules.find((r) => r.is_default);
          onRuleChange(defaultRule?.id || res.rules[0].id);
        }
      })
      .catch((err) => {
        console.error("加载规则列表失败:", err);
        MessagePlugin.error("加载规则列表失败");
      })
      .finally(() => setRulesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载时执行，selectedRuleId 变化不应重新请求规则列表
  }, []);

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
      MessagePlugin.warning("请选择检查模板");
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
        <div className="bg-white/40 p-4 sm:p-6 border-b border-slate-200/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 w-full">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                第一步：选择检查模板规则
              </label>
              <div className="relative max-w-full sm:max-w-lg">
                <Select
                  value={selectedRuleId}
                  onChange={(val) => handleRuleChange(val as string)}
                  loading={rulesLoading}
                  placeholder="选择检查模板"
                  size="large"
                  className="!border-white/80 shadow-sm bg-white/80"
                  style={{ width: "100%", borderRadius: "0.75rem" }}
                  popupProps={{
                    overlayInnerStyle: { 
                      padding: "8px", 
                      borderRadius: "12px", 
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)" 
                    }
                  }}
                >
                  {/* 预置规则组 */}
                  {rules.length > 0 && (
                    <Select.OptionGroup label={<><SvgIcon name="clipboard-list" size={14} /> 预置规则</>} divider={customRules.length > 0}>
                      {rules.map((rule) => (
                        <Select.Option
                          key={rule.id}
                          value={rule.id}
                          label={rule.name}
                          className="rounded-lg mb-1 hover:bg-blue-50/50"
                        >
                          <div className="py-1">
                            <div className="font-semibold text-slate-800">{rule.name}</div>
                            {rule.description && (
                              <div className="text-xs text-slate-500 mt-1 whitespace-normal leading-relaxed">
                                {rule.description}
                              </div>
                            )}
                          </div>
                        </Select.Option>
                      ))}
                    </Select.OptionGroup>
                  )}
                  {/* 自定义规则组 */}
                  {customRules.length > 0 && (
                    <Select.OptionGroup label={<><SvgIcon name="folder" size={14} /> 我的规则</>}>
                      {customRules.map((rule) => (
                        <Select.Option
                          key={`custom:${rule.id}`}
                          value={`custom:${rule.id}`}
                          label={rule.name}
                          className="rounded-lg mb-1 hover:bg-purple-50/50"
                        >
                          <div className="py-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800">{rule.name}</span>
                              <span className={`px-1.5 py-0.5 text-xs rounded-full border ${
                                rule.source === 'template-extract'
                                  ? 'bg-violet-100 text-violet-700 border-violet-200'
                                  : 'bg-amber-100 text-amber-700 border-amber-200'
                              }`}>
                                {rule.source === 'template-extract' ? '模板提取' : 'AI 生成'}
                              </span>
                            </div>
                            {rule.source_filename && (
                              <div className="text-xs text-slate-500 mt-1">
                                来源: {rule.source_filename}
                              </div>
                            )}
                          </div>
                        </Select.Option>
                      ))}
                    </Select.OptionGroup>
                  )}
                </Select>
              </div>
            </div>
            {/* 可选的规则解释小提示 */}
            <div className="text-xs text-slate-500 bg-slate-100/80 px-4 py-2 rounded-lg max-w-xs hidden md:block border border-slate-200/50">
              <SvgIcon name="lightbulb" size={14} /> 检查报告将基于此模板包含的段落、字体、页边距等规则生成。
            </div>
          </div>
        </div>

        {/* 文件上传区域 */}
        <div className="p-4 sm:p-6">
          <label className="block text-sm font-semibold text-slate-700 mb-3">
            第二步：上传目标文档
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
                      {(selectedFile.size / 1024).toFixed(1)} KB · 点击或拖拽替换文件
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
