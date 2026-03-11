/**
 * 提取模块首页上传面板（从 ExtractPanel 瘦身）
 *
 * 职责：
 * - 渲染模式切换 Tab（上传模板 / 文字描述）
 * - 渲染 ExtractUploadMode / ExtractTextMode
 * - 处理文件选择和上传
 * - 调用 extractRules / generateRules API
 * - 上传前调用 onExtractStart()，成功后调用 onExtractComplete(result, filename, mode)
 * - 渲染 RuleManager
 * - **不渲染** ExtractResult（由 App.tsx 全屏渲染）
 *
 * UI 交互状态（selectedFile、textInput 等）保留在组件内部，不提升到 Hook。
 */

import { useState, useCallback } from "react";
import { MessagePlugin } from "tdesign-react";
import type { UploadFile } from "tdesign-react";
import { extractRules, generateRules } from "../services/api";
import RuleManager from "./RuleManager";
import ExtractUploadMode from "./ExtractUploadMode";
import ExtractTextMode from "./ExtractTextMode";
import { SvgIcon } from "./icons/SvgIcon";
import { YAML_HIGHLIGHT_STYLES } from "../utils/yamlHighlight";
import type { ExtractResult } from "../types";

// ========================================
// Props 接口
// ========================================

interface ExtractUploadPanelProps {
  /** 提取开始（触发 EXTRACTING） */
  onExtractStart: () => void;
  /** 提取完成（传递结果给 Hook） */
  onExtractComplete: (
    result: ExtractResult,
    filename: string,
    mode: "upload" | "text",
  ) => void;
  /** 提取出错（toast + IDLE） */
  onExtractError: (msg: string) => void;
  /** RuleManager 刷新 key */
  ruleManagerKey: number;
  /** RuleManager 变化回调（保存后刷新） */
  onRuleManagerChange: () => void;
}

// ========================================
// 组件实现
// ========================================

/** 提取模式 */
type ExtractMode = "upload" | "text";

export default function ExtractUploadPanel({
  onExtractStart,
  onExtractComplete,
  onExtractError,
  ruleManagerKey,
  onRuleManagerChange,
}: ExtractUploadPanelProps) {
  // ---------- 组件内部 UI 交互状态 ----------
  const [mode, setMode] = useState<ExtractMode>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isError, setIsError] = useState(false);

  // LLM 文字描述模式相关状态
  const [textInput, setTextInput] = useState("");
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState("");

  // ---------- 事件处理 ----------

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
      setIsError(false);
      setErrorMsg("");
    } else {
      setSelectedFile(null);
    }
  }, []);

  /** 上传模板模式：提取规则 */
  const handleExtract = useCallback(async () => {
    if (!selectedFile) {
      MessagePlugin.warning("请先选择模板文件");
      return;
    }
    onExtractStart();
    setErrorMsg("");
    setIsError(false);
    try {
      const extractResult = await extractRules(selectedFile);
      onExtractComplete(extractResult, selectedFile.name, "upload");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "提取失败，请重试";
      setErrorMsg(message);
      setIsError(true);
      onExtractError(message);
    }
  }, [selectedFile, onExtractStart, onExtractComplete, onExtractError]);

  /** 文字描述模式：AI 生成规则 */
  const handleGenerate = useCallback(async () => {
    if (!textInput.trim()) {
      MessagePlugin.warning("请输入格式要求描述");
      return;
    }
    onExtractStart();
    setLlmLoading(true);
    setLlmError("");
    setErrorMsg("");
    setIsError(false);
    try {
      const res = await generateRules(textInput.trim());
      const result: ExtractResult = {
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
      };
      onExtractComplete(result, "AI 生成", "text");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "AI 服务暂不可用，请稍后重试";
      if (
        message.includes("不可用") ||
        message.includes("unavailable") ||
        message.includes("503") ||
        message.includes("502") ||
        message.includes("timeout")
      ) {
        setLlmError(
          "AI 服务暂不可用，请稍后重试或使用「上传模板」模式提取规则",
        );
      } else {
        setLlmError(message);
      }
      onExtractError(message);
    } finally {
      setLlmLoading(false);
    }
  }, [textInput, onExtractStart, onExtractComplete, onExtractError]);

  // ---------- 渲染 ----------

  return (
    <div className="space-y-6">
      {/* 注入 YAML 高亮样式 */}
      <style>{YAML_HIGHLIGHT_STYLES}</style>

      {/* 模式切换 Tabs */}
      <div className="flex justify-center">
        <div className="inline-flex bg-white/60 backdrop-blur-sm rounded-xl p-1 border border-slate-200/60 shadow-sm">
          <button
            onClick={() => {
              setMode("upload");
              setLlmError("");
              setErrorMsg("");
              setIsError(false);
            }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
              mode === "upload"
                ? "bg-white text-purple-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <SvgIcon name="file-text" size={16} /> 上传模板
          </button>
          <button
            onClick={() => {
              setMode("text");
              setLlmError("");
              setErrorMsg("");
              setIsError(false);
            }}
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

      {/* 上传模板模式 */}
      {mode === "upload" && (
        <ExtractUploadMode
          selectedFile={selectedFile}
          onFileChange={handleFileChange}
          onExtract={handleExtract}
          errorMsg={errorMsg}
          isError={isError}
        />
      )}

      {/* 文字描述模式 */}
      {mode === "text" && (
        <ExtractTextMode
          textInput={textInput}
          onTextChange={setTextInput}
          onGenerate={handleGenerate}
          llmLoading={llmLoading}
          llmError={llmError}
          errorMsg={errorMsg}
          isError={isError}
        />
      )}

      {/* 规则管理（首页始终可见） */}
      <RuleManager key={`upload-${ruleManagerKey}`} onRulesChange={onRuleManagerChange} />
    </div>
  );
}
