/**
 * 模板提取面板组件（编排器）
 *
 * 功能：
 * - 管理提取流程的状态（idle → uploading → done / error）
 * - 协调上传模式 / 文字描述模式的切换
 * - 将 UI 渲染委托给子组件：
 *   - ExtractUploadMode: 上传模板模式
 *   - ExtractTextMode: 文字描述模式
 *   - ExtractResult: 提取结果展示
 */

import { useState, useCallback } from "react";
import { MessagePlugin } from "tdesign-react";
import type { UploadFile } from "tdesign-react";
import { extractRules, generateRules } from "../services/api";
import { save as saveRule, isAvailable, isNearLimit } from "../services/ruleStorage";
import RuleManager from "./RuleManager";
import ExtractUploadMode from "./ExtractUploadMode";
import ExtractTextMode from "./ExtractTextMode";
import ExtractResultView from "./ExtractResult";
import { SvgIcon } from "./icons/SvgIcon";
import { YAML_HIGHLIGHT_STYLES } from "../utils/yamlHighlight";
import type { ExtractResult } from "../types";

/** 提取模式 */
type ExtractMode = "upload" | "text";

/** 提取状态 */
type ExtractState = "idle" | "uploading" | "done" | "error";

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

  // ========== 事件处理 ==========

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
      setResult(null);
      setState("idle");
      setErrorMsg("");
    } else {
      setSelectedFile(null);
    }
  }, []);

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

  const handleReset = useCallback(() => {
    setState("idle");
    setSelectedFile(null);
    setResult(null);
    setRuleName("");
    setErrorMsg("");
    setLlmError("");
  }, []);

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
      setRuleManagerKey((k) => k + 1);
    } catch {
      MessagePlugin.error("保存失败，可能存储空间不足");
    }
  }, [result, ruleName]);

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

  // ========== 渲染 ==========

  const isIdleOrError = state === "idle" || state === "error";

  return (
    <div className="space-y-6">
      {/* 注入 YAML 高亮样式 */}
      <style>{YAML_HIGHLIGHT_STYLES}</style>

      {/* 模式切换 Tabs */}
      {isIdleOrError && (
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

      {/* 上传模板模式 */}
      {mode === "upload" && isIdleOrError && (
        <ExtractUploadMode
          selectedFile={selectedFile}
          onFileChange={handleFileChange}
          onExtract={handleExtract}
          errorMsg={errorMsg}
          isError={state === "error"}
        />
      )}

      {/* 文字描述模式 */}
      {mode === "text" && isIdleOrError && (
        <ExtractTextMode
          textInput={textInput}
          onTextChange={setTextInput}
          onGenerate={handleGenerate}
          llmLoading={llmLoading}
          llmError={llmError}
          errorMsg={errorMsg}
          isError={state === "error"}
        />
      )}

      {/* 空闲/错误状态下的规则管理 */}
      {isIdleOrError && (
        <RuleManager key={`idle-${ruleManagerKey}`} />
      )}

      {/* 加载状态 */}
      {state === "uploading" && (
        <div className="glass-card rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto animate-in fade-in zoom-in-95 duration-500">
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-purple-100 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center text-xl sm:text-2xl">
              <SvgIcon name="scan-extract" size={24} />
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

      {/* 提取结果 */}
      {state === "done" && result && (
        <ExtractResultView
          result={result}
          ruleName={ruleName}
          onRuleNameChange={setRuleName}
          onReset={handleReset}
          onDownload={handleDownload}
          onSave={handleSave}
          saveDialogVisible={saveDialogVisible}
          onSaveDialogVisibleChange={setSaveDialogVisible}
        >
          <RuleManager key={`done-${ruleManagerKey}`} />
        </ExtractResultView>
      )}
    </div>
  );
}
