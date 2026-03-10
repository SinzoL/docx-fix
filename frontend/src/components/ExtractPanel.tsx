/**
 * 模板提取面板组件
 *
 * 功能：
 * - 上传 .docx 模板文件
 * - 调用后端 extract-rules API 提取格式规则
 * - 展示提取摘要卡片（页面设置、样式、编号等检测结果）
 * - YAML 预览（分节高亮展示）
 * - 编辑规则名称并保存到 localStorage
 */

import { useState, useCallback } from "react";
import { Upload, MessagePlugin, Input, Dialog } from "tdesign-react";
import type { UploadFile } from "tdesign-react";
import { CheckCircleIcon } from "tdesign-icons-react";
import { extractRules, generateRules } from "../services/api";
import { save as saveRule, isAvailable, isNearLimit } from "../services/ruleStorage";
import RuleManager from "./RuleManager";
import { SvgIcon } from "./icons/SvgIcon";
import {
  highlightYaml,
  parseYamlSections,
  YAML_HIGHLIGHT_STYLES,
} from "../utils/yamlHighlight";
import type { ExtractResult, ExtractSummary } from "../types";

/** 提取模式 */
type ExtractMode = "upload" | "text";

/** 提取状态 */
type ExtractState = "idle" | "uploading" | "done" | "error";

/** 摘要检测模块配置 */
const SUMMARY_MODULES: {
  key: keyof ExtractSummary;
  label: string;
  icon: string;
}[] = [
  { key: "has_page_setup", label: "页面设置", icon: "ruler" },
  { key: "has_header_footer", label: "页眉页脚", icon: "bookmark" },
  { key: "has_numbering", label: "编号定义", icon: "hash" },
  { key: "has_structure", label: "文档结构", icon: "clipboard-list" },
  { key: "has_special_checks", label: "特殊检查", icon: "search" },
  { key: "has_heading_style_fix", label: "标题修复", icon: "wrench" },
];

export default function ExtractPanel() {
  const [mode, setMode] = useState<ExtractMode>("upload");
  const [state, setState] = useState<ExtractState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [ruleManagerKey, setRuleManagerKey] = useState(0);

  // LLM 文字描述模式相关状态
  const [textInput, setTextInput] = useState("");
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState("");

  // 文件变化处理
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
      // 清除之前的结果
      setResult(null);
      setState("idle");
      setErrorMsg("");
    } else {
      setSelectedFile(null);
    }
  }, []);

  // 开始提取
  const handleExtract = useCallback(async () => {
    if (!selectedFile) {
      MessagePlugin.warning("请先选择模板文件");
      return;
    }

    setState("uploading");
    setErrorMsg("");

    try {
      const extractResult = await extractRules(selectedFile);
      setResult(extractResult);
      // 默认规则名称：从文件名去掉扩展名
      const baseName = selectedFile.name.replace(/\.docx$/i, "");
      setRuleName(baseName + " 格式规则");
      setState("done");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "提取失败，请重试";
      setErrorMsg(message);
      setState("error");
      MessagePlugin.error(message);
    }
  }, [selectedFile]);

  // 重新提取
  const handleReset = useCallback(() => {
    setState("idle");
    setSelectedFile(null);
    setResult(null);
    setRuleName("");
    setErrorMsg("");
    setLlmError("");
  }, []);

  // 保存规则到 localStorage
  const handleSave = useCallback(() => {
    if (!result) return;

    if (!isAvailable()) {
      MessagePlugin.error("浏览器存储不可用（可能处于隐私模式），无法保存规则");
      return;
    }

    if (isNearLimit()) {
      MessagePlugin.warning("存储空间即将用尽，建议删除部分旧规则后再保存");
    }

    if (!ruleName.trim()) {
      MessagePlugin.warning("请输入规则名称");
      return;
    }

    try {
      saveRule({
        name: ruleName.trim(),
        source: "template-extract",
        yaml_content: result.yaml_content,
        source_filename: result.filename,
      });
      MessagePlugin.success("规则已保存到浏览器本地");
      setSaveDialogVisible(false);
      // 刷新 RuleManager 列表
      setRuleManagerKey((k) => k + 1);
    } catch {
      MessagePlugin.error("保存失败，可能存储空间不足");
    }
  }, [result, ruleName]);

  // 下载 YAML 文件
  const handleDownload = useCallback(() => {
    if (!result) return;
    const blob = new Blob([result.yaml_content], {
      type: "text/yaml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ruleName || "rules"}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result, ruleName]);

  // LLM 生成规则
  const handleGenerate = useCallback(async () => {
    if (!textInput.trim()) {
      MessagePlugin.warning("请输入格式要求描述");
      return;
    }

    setLlmLoading(true);
    setLlmError("");
    setErrorMsg("");

    try {
      const res = await generateRules(textInput.trim());
      // 将 LLM 结果映射为 ExtractResult 格式以复用预览和保存逻辑
      setResult({
        filename: "AI 生成",
        yaml_content: res.yaml_content,
        summary: {
          style_count: 0,
          style_names: [],
          has_page_setup: false,
          has_header_footer: false,
          has_numbering: false,
          has_structure: false,
          has_special_checks: false,
          has_heading_style_fix: false,
          page_setup_info: null,
          extracted_at: new Date().toISOString(),
        },
      });
      setRuleName("AI 生成规则");
      setState("done");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "AI 服务暂不可用，请稍后重试";
      // 判断是否是服务不可用类型的错误
      if (
        message.includes("不可用") ||
        message.includes("unavailable") ||
        message.includes("503") ||
        message.includes("502") ||
        message.includes("timeout")
      ) {
        setLlmError("AI 服务暂不可用，请稍后重试或使用「上传模板」模式提取规则");
      } else {
        setLlmError(message);
      }
      MessagePlugin.error(message);
    } finally {
      setLlmLoading(false);
    }
  }, [textInput]);

  return (
    <div className="space-y-6">
      {/* 注入 YAML 高亮样式 */}
      <style>{YAML_HIGHLIGHT_STYLES}</style>

      {/* ==================== 模式切换 Tabs ==================== */}
      {(state === "idle" || state === "error") && (
        <div className="flex justify-center">
          <div className="inline-flex bg-white/60 backdrop-blur-sm rounded-xl p-1 border border-slate-200/60 shadow-sm">
            <button
              onClick={() => { setMode("upload"); setLlmError(""); setErrorMsg(""); }}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                mode === "upload"
                  ? "bg-white text-purple-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
                <SvgIcon name="file-text" size={16} /> 上传模板
            </button>
            <button
              onClick={() => { setMode("text"); setLlmError(""); setErrorMsg(""); }}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                mode === "text"
                  ? "bg-white text-amber-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
                <SvgIcon name="wrench" size={16} /> 文字描述
            </button>
          </div>
        </div>
      )}

      {/* ==================== 上传模板模式 ==================== */}
      {mode === "upload" && (state === "idle" || state === "error") && (
        <div className="glass-card rounded-2xl overflow-hidden shadow-xl shadow-blue-500/5 border border-white/60">
          {/* 说明区域 */}
          <div className="bg-white/40 p-4 sm:p-6 border-b border-slate-200/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-violet-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-lg shadow-lg shadow-purple-500/30">
                <SvgIcon name="dna" size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  从模板文档提取规则
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  上传学校发布的 .docx 格式模板，自动提取格式要求生成检查规则
                </p>
              </div>
            </div>
          </div>

          {/* 文件上传 */}
          <div className="p-4 sm:p-6">
            <Upload
              theme="custom"
              draggable
              accept=".docx"
              autoUpload={false}
              onChange={handleFileChange}
              multiple={false}
            >
              <div
                className={`w-full border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-all cursor-pointer group relative overflow-hidden ${
                  selectedFile
                    ? "border-emerald-300 bg-emerald-50/50"
                    : "border-slate-300 hover:border-purple-400 bg-slate-50/30 hover:bg-purple-50/20"
                }`}
              >
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
                        {(selectedFile.size / 1024).toFixed(1)} KB ·
                        点击或拖拽替换文件
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 relative z-10">
                    <div className="w-20 h-20 bg-purple-50 text-purple-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
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
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-slate-700 font-display">
                        拖拽模板文件到此处，或点击浏览
                      </p>
                      <p className="text-sm font-medium text-slate-500 mt-2">
                        仅支持{" "}
                        <span className="text-purple-600">.docx</span>{" "}
                        格式模板文件
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Upload>

            {/* 错误提示 */}
            {state === "error" && errorMsg && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                <SvgIcon name="x-circle" size={14} /> {errorMsg}
              </div>
            )}
          </div>

          {/* 提取按钮 */}
          <div className="p-4 sm:p-5 bg-slate-50/50 border-t border-slate-200/50 flex justify-end">
            <button
              onClick={handleExtract}
              disabled={!selectedFile}
              className={`px-8 sm:px-10 py-2.5 sm:py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform ${
                !selectedFile
                  ? "bg-slate-300 shadow-none cursor-not-allowed opacity-70"
                  : "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 hover:shadow-purple-500/30 hover:-translate-y-0.5 cursor-pointer"
              }`}
            >
              开始提取规则
            </button>
          </div>
        </div>
      )}

      {/* ==================== 文字描述模式 ==================== */}
      {mode === "text" && (state === "idle" || state === "error") && (
        <div className="glass-card rounded-2xl overflow-hidden shadow-xl shadow-blue-500/5 border border-white/60">
          {/* 说明区域 */}
          <div className="bg-white/40 p-4 sm:p-6 border-b border-slate-200/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-amber-500 to-orange-500 rounded-xl flex items-center justify-center text-white text-lg shadow-lg shadow-amber-500/30">
                <SvgIcon name="wrench" size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  用文字描述格式要求
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  输入您的格式规范要求，AI 将自动生成对应的 YAML 检查规则
                </p>
              </div>
            </div>
          </div>

          {/* 文本输入区域 */}
          <div className="p-4 sm:p-6">
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={"示例：\n- 正文使用宋体小四号，1.5倍行距\n- 一级标题黑体三号加粗，居中\n- 页边距上下2.54cm，左右3.17cm\n- 页码居中，从第二页开始\n- 图表标题使用宋体五号"}
              className="w-full h-48 sm:h-56 p-4 rounded-xl border border-slate-200 bg-white/80 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-300 transition-all placeholder:text-slate-400"
            />

            {/* LLM 不可用降级提示 */}
            {llmError && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm flex items-start gap-2">
                <span className="text-base mt-0.5"><SvgIcon name="alert-triangle" size={16} /></span>
                <div>
                  <p className="font-semibold">AI 服务暂不可用</p>
                  <p className="mt-1 text-amber-600">{llmError}</p>
                </div>
              </div>
            )}

            {/* 普通错误提示 */}
            {state === "error" && errorMsg && !llmError && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                <SvgIcon name="x-circle" size={14} /> {errorMsg}
              </div>
            )}
          </div>

          {/* 生成按钮 */}
          <div className="p-4 sm:p-5 bg-slate-50/50 border-t border-slate-200/50 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {textInput.length > 0 ? `${textInput.length} 字` : "请输入格式要求"}
            </span>
            <button
              onClick={handleGenerate}
              disabled={!textInput.trim() || llmLoading}
              className={`px-8 sm:px-10 py-2.5 sm:py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform ${
                !textInput.trim() || llmLoading
                  ? "bg-slate-300 shadow-none cursor-not-allowed opacity-70"
                  : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 hover:shadow-amber-500/30 hover:-translate-y-0.5 cursor-pointer"
              }`}
            >
              {llmLoading ? "AI 生成中..." : <><SvgIcon name="bot" size={16} /> 生成规则</>}
            </button>
          </div>
        </div>
      )}

      {/* ==================== 我的规则（空闲/错误状态时也展示） ==================== */}
      {(state === "idle" || state === "error") && (
        <RuleManager key={`idle-${ruleManagerKey}`} />
      )}

      {/* ==================== 加载状态 ==================== */}
      {state === "uploading" && (
        <div className="glass-card rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto animate-in fade-in zoom-in-95 duration-500">
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-purple-100 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center text-xl sm:text-2xl">
              <SvgIcon name="dna" size={24} />
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-slate-800 font-display">
            正在分析模板文档...
          </h3>
          <p className="text-sm sm:text-base text-slate-500 mt-2 sm:mt-3 font-medium">
            正在提取页面设置、样式定义、编号规则等格式信息
          </p>
        </div>
      )}

      {/* ==================== 提取结果 ==================== */}
      {state === "done" && result && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* 操作栏 */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-slate-800 font-display">
                提取完成 <SvgIcon name="sparkles" size={18} />
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                从{" "}
                <span className="font-semibold text-slate-700">
                  {result.filename}
                </span>{" "}
                中成功提取格式规则
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white/80 border border-slate-200 rounded-xl hover:bg-white hover:text-slate-800 transition-all cursor-pointer"
              >
                ← 重新提取
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white/80 border border-slate-200 rounded-xl hover:bg-white hover:text-slate-800 transition-all cursor-pointer"
              >
                ⬇ 下载 YAML
              </button>
              <button
                onClick={() => setSaveDialogVisible(true)}
                className="px-6 py-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl hover:from-violet-500 hover:to-purple-500 shadow-lg hover:shadow-purple-500/30 transition-all cursor-pointer"
              >
                <SvgIcon name="folder" size={14} /> 保存规则
              </button>
            </div>
          </div>

          {/* 摘要卡片 */}
          <SummaryCard summary={result.summary} />

          {/* YAML 预览 */}
          <YamlPreview yamlContent={result.yaml_content} />

          {/* 我的规则（提取完成后展示） */}
          <RuleManager key={`done-${ruleManagerKey}`} />

          {/* 保存对话框 */}
          <Dialog
            header="保存规则到浏览器"
            visible={saveDialogVisible}
            onClose={() => setSaveDialogVisible(false)}
            onConfirm={handleSave}
            confirmBtn="保存"
            cancelBtn="取消"
          >
            <div className="space-y-4 py-2">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  规则名称
                </label>
                <Input
                  value={ruleName}
                  onChange={(val) => setRuleName(val as string)}
                  placeholder="请输入规则名称"
                  maxlength={100}
                />
              </div>
              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg">
                <SvgIcon name="lightbulb" size={14} /> 规则将保存在浏览器本地存储中，30 天后自动过期。不同设备/浏览器的规则互不影响。
              </div>
            </div>
          </Dialog>
        </div>
      )}
    </div>
  );
}

// ========================================
// 子组件：摘要卡片
// ========================================

function SummaryCard({ summary }: { summary: ExtractSummary }) {
  const detectedModules = SUMMARY_MODULES.filter(
    (m) => summary[m.key] === true
  );

  return (
    <div className="glass-card rounded-2xl p-5 sm:p-6 border border-white/60">
      <h4 className="text-base font-bold text-slate-700 mb-4"><SvgIcon name="chart-bar" size={16} /> 提取摘要</h4>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* 样式数量统计 */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100/50">
          <div className="text-3xl font-extrabold text-blue-600">
            {summary.style_count}
          </div>
          <div className="text-xs font-medium text-slate-500 mt-1">
            检测到的样式
          </div>
        </div>

        {/* 检测模块列表 */}
        {SUMMARY_MODULES.map((mod) => {
          const detected = summary[mod.key] === true;
          return (
            <div
              key={mod.key}
              className={`rounded-xl p-4 border transition-all ${
                detected
                  ? "bg-emerald-50 border-emerald-100/50"
                  : "bg-slate-50 border-slate-100/50 opacity-50"
              }`}
            >
              <div className="text-2xl"><SvgIcon name={mod.icon} size={24} /></div>
              <div className="text-xs font-medium text-slate-600 mt-1">
                {mod.label}
              </div>
              <div
                className={`text-xs mt-1 font-semibold ${
                  detected ? "text-emerald-600" : "text-slate-400"
                }`}
              >
                {detected ? <><SvgIcon name="check" size={12} /> 已检测</> : "— 未检测到"}
              </div>
            </div>
          );
        })}
      </div>

      {/* 页面设置信息 */}
      {summary.page_setup_info && (
        <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
          <SvgIcon name="file-text" size={14} /> 纸张：{summary.page_setup_info.paper_size}（
          {summary.page_setup_info.width_cm} × {summary.page_setup_info.height_cm} cm）
        </div>
      )}

      {/* 样式名称列表 */}
      {summary.style_names && summary.style_names.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.style_names.map((name) => (
            <span
              key={name}
              className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-100"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* 检测结果 */}
      <div className="mt-4 text-xs text-slate-500">
        检测到 {detectedModules.length} 个模块 · 共 {summary.style_count} 个样式 · 提取于{" "}
        {summary.extracted_at
          ? new Date(summary.extracted_at).toLocaleString("zh-CN")
          : "刚刚"}
      </div>
    </div>
  );
}

// ========================================
// 子组件：YAML 预览（分节高亮）
// ========================================

function YamlPreview({ yamlContent }: { yamlContent: string }) {
  const sections = parseYamlSections(yamlContent);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    () => new Set(sections.map((_, i) => i))
  );

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-white/60">
      <div className="bg-white/40 px-5 py-4 border-b border-slate-200/50 flex items-center justify-between">
        <h4 className="text-base font-bold text-slate-700"><SvgIcon name="document" size={16} /> YAML 规则预览</h4>
        <span className="text-xs text-slate-400 font-mono">
          {sections.length} 节 · {yamlContent.split("\n").length} 行
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {sections.map((section, index) => (
          <div key={index}>
            {/* 节标题 */}
            <button
              onClick={() => toggleSection(index)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50/50 transition-colors cursor-pointer"
            >
              <span className="text-sm font-semibold text-slate-700">
                {section.title || `节 ${index + 1}`}
              </span>
              <span
                className={`text-slate-400 transition-transform duration-200 ${
                  expandedSections.has(index) ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            </button>

            {/* 节内容 */}
            {expandedSections.has(index) && (
              <div className="px-5 pb-4">
                <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto text-sm leading-relaxed font-mono">
                  {/* SECURITY: dangerouslySetInnerHTML 安全 — highlightYaml 内部对所有输入先做 escapeHtml 转义，再拼接 <span> 标签 */}
                  <code
                    dangerouslySetInnerHTML={{
                      __html: highlightYaml(section.content),
                    }}
                  />
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
