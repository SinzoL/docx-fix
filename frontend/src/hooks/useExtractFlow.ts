/**
 * useExtractFlow — 提取流程状态管理 Hook
 *
 * 设计模式：自定义 Hook 封装（State Colocation）
 * 将提取域的「流程状态 + 结果数据」从 ExtractPanel 中提取到独立 Hook，
 * 实现关注点分离。App.tsx 通过此 Hook 消费聚合接口。
 *
 * 管理状态：extractResult、extractFilename、extractMode、ruleName、
 *          saveDialogVisible、ruleManagerKey、historyRefreshKey
 *
 * 暴露回调：handleExtractStart、handleExtractComplete、handleExtractError、
 *          handleSave、handleDownload、handleViewHistory、reset
 *
 * 注意：文件上传、模式选择等 UI 交互状态（selectedFile、textInput 等）
 * 保留在 ExtractUploadPanel 组件内部，不提升到 Hook。
 * Hook 只管理「流程状态 + 结果数据」。
 */

import { useState, useCallback } from "react";
import { MessagePlugin } from "tdesign-react";
import type { AppState, ExtractResult, ExtractHistoryRecord } from "../types";
import {
  save as saveRule,
  isAvailable,
  isNearLimit,
} from "../services/ruleStorage";
import { saveExtractHistory, EXTRACT_EXPIRY_MS } from "../services/cache";

// ========================================
// 类型定义
// ========================================

interface UseExtractFlowReturn {
  // ---- 数据 ----
  /** 提取结果 */
  extractResult: ExtractResult | null;
  /** 提取来源文件名 */
  extractFilename: string;
  /** 提取模式（upload / text） */
  extractMode: "upload" | "text";
  /** 规则名称（保存时使用） */
  ruleName: string;
  /** 保存对话框可见性 */
  saveDialogVisible: boolean;
  /** RuleManager 刷新 key */
  ruleManagerKey: number;
  /** 历史列表刷新 key */
  historyRefreshKey: number;

  // ---- 事件处理 ----
  /** 提取开始（设置 EXTRACTING） */
  handleExtractStart: () => void;
  /** 提取完成（设置结果 + EXTRACT_RESULT + 保存历史） */
  handleExtractComplete: (
    result: ExtractResult,
    filename: string,
    mode: "upload" | "text",
  ) => void;
  /** 提取出错（toast + IDLE） */
  handleExtractError: (msg: string) => void;
  /** 查看历史记录 */
  handleViewHistory: (record: ExtractHistoryRecord) => void;

  // ---- 控制 ----
  /** 更新规则名称 */
  setRuleName: (name: string) => void;
  /** 更新保存对话框可见性 */
  setSaveDialogVisible: (visible: boolean) => void;
  /** 保存规则到 localStorage */
  handleSave: () => void;
  /** 下载 YAML */
  handleDownload: () => void;
  /** 刷新 RuleManager（保存后触发） */
  refreshRuleManager: () => void;
  /** 重置所有状态 */
  reset: () => void;
}

// ========================================
// Hook 实现
// ========================================

export function useExtractFlow(
  setAppState: (state: AppState) => void,
): UseExtractFlowReturn {
  // ---------- 内部状态 ----------
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(
    null,
  );
  const [extractFilename, setExtractFilename] = useState("");
  const [extractMode, setExtractMode] = useState<"upload" | "text">("upload");
  const [ruleName, setRuleName] = useState("");
  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [ruleManagerKey, setRuleManagerKey] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // ---------- 事件处理 ----------

  /** 提取开始 → 设置 EXTRACTING */
  const handleExtractStart = useCallback(() => {
    setAppState("EXTRACTING");
  }, [setAppState]);

  /** 提取完成 → 保存结果 + 设置 EXTRACT_RESULT + 缓存到 IndexedDB */
  const handleExtractComplete = useCallback(
    (result: ExtractResult, filename: string, mode: "upload" | "text") => {
      setExtractResult(result);
      setExtractFilename(filename);
      setExtractMode(mode);

      // 自动生成默认规则名
      if (mode === "upload") {
        const baseName = filename.replace(/\.docx$/i, "");
        setRuleName(baseName + " 格式规则");
      } else {
        setRuleName("AI 生成规则");
      }

      setAppState("EXTRACT_RESULT");

      // 异步缓存到 IndexedDB extract-history
      const record: ExtractHistoryRecord = {
        id: crypto.randomUUID(),
        filename,
        mode,
        result,
        created_at: Date.now(),
        expires_at: Date.now() + EXTRACT_EXPIRY_MS,
      };
      saveExtractHistory(record)
        .then(() => {
          // 刷新历史列表
          setHistoryRefreshKey((k) => k + 1);
        })
        .catch((err) => {
          console.warn("缓存提取记录失败:", err);
        });
    },
    [setAppState],
  );

  /** 提取出错 → toast 提示 + 回到 IDLE */
  const handleExtractError = useCallback(
    (msg: string) => {
      MessagePlugin.error(msg);
      setAppState("IDLE");
    },
    [setAppState],
  );

  /** 查看历史记录 → 设置结果 + 进入 EXTRACT_RESULT */
  const handleViewHistory = useCallback(
    (record: ExtractHistoryRecord) => {
      setExtractResult(record.result);
      setExtractFilename(record.filename);
      setExtractMode(record.mode);

      // 设置规则名
      if (record.mode === "upload") {
        const baseName = record.filename.replace(/\.docx$/i, "");
        setRuleName(baseName + " 格式规则");
      } else {
        setRuleName("AI 生成规则");
      }

      setAppState("EXTRACT_RESULT");
    },
    [setAppState],
  );

  // ---------- 规则操作 ----------

  /** 保存规则到 localStorage（通过 ruleStorage） */
  const handleSave = useCallback(() => {
    if (!extractResult) return;

    if (!isAvailable()) {
      MessagePlugin.error(
        "浏览器存储不可用（可能处于隐私模式），无法保存规则",
      );
      return;
    }
    if (isNearLimit()) {
      MessagePlugin.warning(
        "存储空间即将用尽，建议删除部分旧规则后再保存",
      );
    }
    if (!ruleName.trim()) {
      MessagePlugin.warning("请输入规则名称");
      return;
    }

    try {
      saveRule({
        name: ruleName.trim(),
        source: extractMode === "upload" ? "template-extract" : "llm-generate",
        yaml_content: extractResult.yaml_content,
        source_filename: extractResult.filename,
      });
      MessagePlugin.success("规则已保存到浏览器本地");
      setSaveDialogVisible(false);
      // 刷新 RuleManager
      setRuleManagerKey((k) => k + 1);
    } catch {
      MessagePlugin.error("保存失败，可能存储空间不足");
    }
  }, [extractResult, ruleName, extractMode]);

  /** 下载 YAML 文件 */
  const handleDownload = useCallback(() => {
    if (!extractResult) return;

    const blob = new Blob([extractResult.yaml_content], {
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
  }, [extractResult, ruleName]);

  /** 刷新 RuleManager */
  const refreshRuleManager = useCallback(() => {
    setRuleManagerKey((k) => k + 1);
  }, []);

  // ---------- 重置 ----------

  /** 重置所有状态（返回首页时调用） */
  const reset = useCallback(() => {
    setExtractResult(null);
    setExtractFilename("");
    setExtractMode("upload");
    setRuleName("");
    setSaveDialogVisible(false);
    // 注意：不重置 ruleManagerKey 和 historyRefreshKey（它们是递增的刷新 key）
  }, []);

  // ---------- 返回值 ----------

  return {
    // 数据
    extractResult,
    extractFilename,
    extractMode,
    ruleName,
    saveDialogVisible,
    ruleManagerKey,
    historyRefreshKey,

    // 事件处理
    handleExtractStart,
    handleExtractComplete,
    handleExtractError,
    handleViewHistory,

    // 控制
    setRuleName,
    setSaveDialogVisible,
    handleSave,
    handleDownload,
    refreshRuleManager,
    reset,
  };
}
