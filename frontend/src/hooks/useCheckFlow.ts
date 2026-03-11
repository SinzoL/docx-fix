/**
 * useCheckFlow — 检查/修复流程状态管理 Hook
 *
 * 设计模式：自定义 Hook 封装（State Colocation）
 * 将检查域的所有状态和回调从 App.tsx 中提取，实现关注点分离。
 *
 * 管理状态：sessionId、selectedRuleId、checkReport、fixReport、
 *          fixLoading、customRulesYaml、isReadOnly
 * 暴露回调：handleCheckStart、handleCheckComplete、handleCheckError、
 *          handleFix、handleRecheck、handleRuleChange、handleViewHistoryReport
 */

import { useState, useCallback } from "react";
import { MessagePlugin } from "tdesign-react";
import type { AppState, CheckReport, FixReport } from "../types";
import { fixFile } from "../services/api";
import { saveHistory, updateFixReport } from "../services/cache";

interface UseCheckFlowReturn {
  /** 当前会话 ID */
  sessionId: string;
  /** 选中的规则 ID */
  selectedRuleId: string;
  /** 检查报告 */
  checkReport: CheckReport | null;
  /** 修复报告 */
  fixReport: FixReport | null;
  /** 修复中加载状态 */
  fixLoading: boolean;
  /** 自定义规则 YAML 内容 */
  customRulesYaml: string | undefined;
  /** 只读模式（历史报告） */
  isReadOnly: boolean;

  /** 检查开始 */
  handleCheckStart: () => void;
  /** 检查完成 */
  handleCheckComplete: (report: CheckReport, sid: string) => void;
  /** 检查出错 */
  handleCheckError: () => void;
  /** 一键修复 */
  handleFix: (includeTextFix?: boolean) => Promise<void>;
  /** 下载完成 */
  handleDownloadComplete: () => void;
  /** 规则切换后重新检查 */
  handleRecheck: (report: CheckReport) => void;
  /** 规则选择变化 */
  handleRuleChange: (ruleId: string) => void;
  /** 自定义规则 YAML 变化 */
  handleCustomRulesYamlChange: (yaml: string | undefined) => void;
  /** 查看历史报告 */
  handleViewHistoryReport: (report: CheckReport) => void;
  /** 重置所有状态 */
  reset: () => void;
}

export function useCheckFlow(
  setAppState: (state: AppState) => void,
): UseCheckFlowReturn {
  const [sessionId, setSessionId] = useState<string>("");
  const [selectedRuleId, setSelectedRuleId] = useState<string>("default");
  const [checkReport, setCheckReport] = useState<CheckReport | null>(null);
  const [fixReport, setFixReport] = useState<FixReport | null>(null);
  const [fixLoading, setFixLoading] = useState(false);
  const [customRulesYaml, setCustomRulesYaml] = useState<string | undefined>(undefined);
  const [isReadOnly, setIsReadOnly] = useState(false);

  const handleCheckStart = useCallback(() => {
    setAppState("CHECKING");
  }, [setAppState]);

  const handleCheckComplete = useCallback(
    (report: CheckReport, sid: string) => {
      setCheckReport(report);
      setSessionId(sid);
      setIsReadOnly(false);
      setAppState("REPORT_READY");

      // 缓存检查记录到 IndexedDB
      saveHistory(
        sid,
        report.filename,
        report.rule_id,
        report.rule_name,
        report,
      ).catch((err) => {
        console.warn("缓存检查记录失败:", err);
      });
    },
    [setAppState],
  );

  const handleCheckError = useCallback(() => {
    setAppState("IDLE");
  }, [setAppState]);

  // 一键修复（防抖保护：fixLoading 为 true 时忽略重复调用）
  const handleFix = useCallback(
    async (includeTextFix?: boolean) => {
      if (!sessionId || !selectedRuleId || fixLoading) return;

      setFixLoading(true);
      setAppState("FIXING");

      try {
        const report = await fixFile(sessionId, selectedRuleId, customRulesYaml, includeTextFix);
        setFixReport(report);
        setAppState("FIX_PREVIEW");

        // 缓存修复报告到 IndexedDB
        updateFixReport(sessionId, report).catch((err) => {
          console.warn("缓存修复报告失败:", err);
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "修复失败，请重试";
        MessagePlugin.error(message);
        setAppState("REPORT_READY");
      } finally {
        setFixLoading(false);
      }
    },
    [sessionId, selectedRuleId, customRulesYaml, fixLoading, setAppState],
  );

  const handleDownloadComplete = useCallback(() => {
    setAppState("DOWNLOADED");
  }, [setAppState]);

  const handleRecheck = useCallback((report: CheckReport) => {
    setCheckReport(report);
    setSelectedRuleId(report.rule_id);
    setFixReport(null);
  }, []);

  const handleRuleChange = useCallback((ruleId: string) => {
    setSelectedRuleId(ruleId);
  }, []);

  const handleCustomRulesYamlChange = useCallback((yaml: string | undefined) => {
    setCustomRulesYaml(yaml);
  }, []);

  const handleViewHistoryReport = useCallback(
    (report: CheckReport) => {
      setCheckReport(report);
      setSessionId(report.session_id);
      setSelectedRuleId(report.rule_id);
      setIsReadOnly(true);
      setCustomRulesYaml(undefined);
      setAppState("REPORT_READY");
    },
    [setAppState],
  );

  const reset = useCallback(() => {
    setSessionId("");
    setCheckReport(null);
    setFixReport(null);
    setFixLoading(false);
    setCustomRulesYaml(undefined);
    setIsReadOnly(false);
  }, []);

  return {
    sessionId,
    selectedRuleId,
    checkReport,
    fixReport,
    fixLoading,
    customRulesYaml,
    isReadOnly,
    handleCheckStart,
    handleCheckComplete,
    handleCheckError,
    handleFix,
    handleDownloadComplete,
    handleRecheck,
    handleRuleChange,
    handleCustomRulesYamlChange,
    handleViewHistoryReport,
    reset,
  };
}
