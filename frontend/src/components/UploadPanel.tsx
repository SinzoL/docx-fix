/**
 * 上传面板组件
 *
 * 功能：
 * - 拖拽/点击上传 .docx 文件
 * - 选择检查模板（规则文件）
 * - 触发上传检查
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { MessagePlugin } from "tdesign-react";
import type { UploadFile } from "tdesign-react";
import { fetchRules, checkFile } from "../services/api";
import { getAll as getAllCustomRules } from "../services/ruleStorage";
import type { RuleInfo, CheckReport, CustomRule } from "../types";
import { SvgIcon } from "./icons/SvgIcon";
import RuleSelector from "./RuleSelector";
import FileDropzone from "./FileDropzone";

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

  // ---- 规则加载（可重试，卸载时取消飞行中的请求） ----
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const loadRules = useCallback(() => {
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

  useEffect(() => { loadRules(); }, [loadRules]);

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

  // ---- 规则选择变化 ----
  const handleRuleChange = useCallback((val: string) => {
    onRuleChange(val);
    const customRule = customRules.find((r) => `custom:${r.id}` === val);
    onCustomRulesYamlChange?.(customRule ? customRule.yaml_content : undefined);
  }, [customRules, onRuleChange, onCustomRulesYamlChange]);

  // ---- 文件变化 ----
  const handleFileChange = useCallback((files: Array<UploadFile>) => {
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
  }, []);

  // ---- 上传并检查 ----
  const handleUpload = useCallback(async () => {
    if (!selectedFile) { MessagePlugin.warning("请先选择文件"); return; }
    if (!selectedRuleId) { MessagePlugin.warning("请选择检查标准"); return; }

    setLoading(true);
    onCheckStart();
    const sessionId = crypto.randomUUID();

    try {
      const customRule = customRules.find((r) => `custom:${r.id}` === selectedRuleId);
      const report = customRule
        ? await checkFile(selectedFile, "default", sessionId, customRule.yaml_content)
        : await checkFile(selectedFile, selectedRuleId, sessionId);
      onCheckComplete(report, sessionId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "检查失败，请重试";
      onError(message);
      MessagePlugin.error(message);
    } finally {
      setLoading(false);
    }
  }, [selectedFile, selectedRuleId, customRules, onCheckStart, onCheckComplete, onError]);

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl overflow-hidden shadow-xl shadow-blue-500/5 border border-white/60">

        {/* 步骤1: 选择检查标准 */}
        <RuleSelector
          rules={rules}
          customRules={customRules}
          selectedRuleId={selectedRuleId}
          rulesLoading={rulesLoading}
          rulesError={rulesError}
          onRuleChange={handleRuleChange}
          onRetry={loadRules}
          onGoToExtract={onGoToExtract}
        />

        {/* 步骤2: 上传目标文档 */}
        <FileDropzone selectedFile={selectedFile} onFileChange={handleFileChange} />

        {/* 隐私安全声明 */}
        <div className="mx-4 sm:mx-6 mb-2 flex items-start gap-2 text-xs text-slate-400">
          <SvgIcon name="shield-check" size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
          <span>文档仅在检查期间临时处理，处理完成后立即从服务器删除，不会被存储或用于任何其他用途。</span>
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
