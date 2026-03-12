/**
 * useCheckFlow — 检查/修复流程状态管理 Hook
 *
 * 设计模式：自定义 Hook 封装（State Colocation）
 * 将检查域的所有状态和回调从 App.tsx 中提取，实现关注点分离。
 *
 * 管理状态：sessionId、selectedRuleId、checkReport、fixReport、
 *          fixLoading、customRulesYaml、isReadOnly、sessionExpired
 * 暴露回调：handleCheckStart、handleCheckComplete、handleCheckError、
 *          handleFix、handleRecheck、handleRuleChange、handleViewHistoryReport
 */

import { useState, useCallback } from "react";
import { MessagePlugin } from "tdesign-react";
import type { AppState, CheckReport, FixReport, HistoryRecord } from "../types";
import { fixFile, checkCheckSessionStatus } from "../services/api";
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
  /** 当前选中规则对应的自定义 YAML 内容 */
  customRulesYaml: string | undefined;
  /** 可恢复的历史自定义规则 ID（用于本地规则已删除后仍可切回） */
  restorableCustomRuleId: string | undefined;
  /** 可恢复的历史自定义规则 YAML */
  restorableCustomRulesYaml: string | undefined;
  /** 只读模式（后端 session 过期时启用，禁用修复和切换规则） */
  isReadOnly: boolean;
  /** 后端 session 是否已过期（区分"从未有 session"和"session 已过期"） */
  sessionExpired: boolean;
  /** 历史报告恢复加载中 */
  restoring: boolean;

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
  handleRecheck: (report: CheckReport, nextSelectedRuleId?: string, nextCustomRulesYaml?: string) => void;
  /** 规则选择变化 */
  handleRuleChange: (ruleId: string) => void;
  /** 自定义规则 YAML 变化 */
  handleCustomRulesYamlChange: (yaml: string | undefined) => void;
  /** 查看历史报告（异步验证 session 后决定只读/可操作） */
  handleViewHistoryReport: (report: CheckReport, record?: HistoryRecord) => void;
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
  const [restorableCustomRuleId, setRestorableCustomRuleId] = useState<string | undefined>(undefined);
  const [restorableCustomRulesYaml, setRestorableCustomRulesYaml] = useState<string | undefined>(undefined);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleCheckStart = useCallback(() => {
    setAppState("CHECKING");
  }, [setAppState]);

  const handleCheckComplete = useCallback(
    (report: CheckReport, sid: string) => {
      setCheckReport(report);
      setSessionId(sid);
      setIsReadOnly(false);
      setSessionExpired(false);
      setAppState("REPORT_READY");

      // 缓存检查记录到 IndexedDB（含自定义规则 YAML + 规则选择身份）
      saveHistory(
        sid,
        report.filename,
        report.rule_id,
        report.rule_name,
        report,
        customRulesYaml,
        selectedRuleId,
      ).catch((err) => {
        console.warn("缓存检查记录失败:", err);
      });
    },
    [setAppState, customRulesYaml, selectedRuleId],
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

  const handleRecheck = useCallback(
    (report: CheckReport, nextSelectedRuleId?: string, nextCustomRulesYaml?: string) => {
      const effectiveRuleId = nextSelectedRuleId || report.rule_id;
      setCheckReport(report);
      setSelectedRuleId(effectiveRuleId);
      setCustomRulesYaml(nextCustomRulesYaml);
      setFixReport(null);
      setIsReadOnly(false);
      setSessionExpired(false);

      saveHistory(
        report.session_id,
        report.filename,
        report.rule_id,
        report.rule_name,
        report,
        nextCustomRulesYaml,
        effectiveRuleId,
      ).catch((err) => {
        console.warn("更新检查记录失败:", err);
      });
    },
    [],
  );

  const handleRuleChange = useCallback((ruleId: string) => {
    setSelectedRuleId(ruleId);
  }, []);

  const handleCustomRulesYamlChange = useCallback((yaml: string | undefined) => {
    setCustomRulesYaml(yaml);
  }, []);

  /**
   * 查看历史报告 — 异步验证 session 后决定只读/可操作
   *
   * 设计模式：降级策略（Graceful Degradation），参考润色模块的 triggerRestore：
   * - session 存活 → 可修复、可切换规则（isReadOnly=false）
   * - session 过期 → 只读模式（isReadOnly=true, sessionExpired=true）
   */
  const handleViewHistoryReport = useCallback(
    (report: CheckReport, record?: HistoryRecord) => {
      // 1. 立即展示报告（乐观加载）
      setCheckReport(report);
      setSessionId(report.session_id);
      // 恢复规则身份：优先用历史记录中保存的选择值，而不是 report.rule_id
      // （自定义规则场景下 report.rule_id 是 "default"，不是用户真实选择的 "custom:xxx"）
      const restoredRuleId = record?.selected_rule_id || report.rule_id;
      setSelectedRuleId(restoredRuleId);
      // 从历史记录中恢复自定义规则 YAML
      setCustomRulesYaml(record?.custom_rules_yaml);
      if (restoredRuleId.startsWith("custom:") && record?.custom_rules_yaml) {
        setRestorableCustomRuleId(restoredRuleId);
        setRestorableCustomRulesYaml(record.custom_rules_yaml);
      }
      setFixReport(null);
      setRestoring(true);
      // 先以只读模式展示，避免闪烁
      setIsReadOnly(true);
      setSessionExpired(false);
      setAppState("REPORT_READY");

      // 2. 异步验证后端 session 是否存活
      checkCheckSessionStatus(report.session_id)
        .then((status) => {
          if (status.exists) {
            // session 仍存活 → 解锁可操作模式
            setIsReadOnly(false);
            setSessionExpired(false);

            const restoredYaml = record?.custom_rules_yaml || status.custom_rules_yaml || undefined;
            const restoredSelectedRuleId = record?.selected_rule_id || status.selected_rule_id || report.rule_id;

            // 后端返回的数据作为备用源（当前端缓存缺失时）
            if (!record?.custom_rules_yaml && restoredYaml) {
              setCustomRulesYaml(restoredYaml);
            }
            if (!record?.selected_rule_id && restoredSelectedRuleId) {
              setSelectedRuleId(restoredSelectedRuleId);
            }
            if (restoredSelectedRuleId.startsWith("custom:") && restoredYaml) {
              setRestorableCustomRuleId(restoredSelectedRuleId);
              setRestorableCustomRulesYaml(restoredYaml);
            }
            if ((!record?.custom_rules_yaml && restoredYaml) || (!record?.selected_rule_id && restoredSelectedRuleId !== report.rule_id)) {
              saveHistory(
                report.session_id,
                report.filename,
                report.rule_id,
                report.rule_name,
                report,
                restoredYaml,
                restoredSelectedRuleId,
              ).catch((err) => {
                console.warn("回写历史记录失败:", err);
              });
            }
            MessagePlugin.success("会话仍然有效，可继续修复或切换规则");
          } else {
            // session 已过期 → 保持只读
            setIsReadOnly(true);
            setSessionExpired(true);
          }
        })
        .catch(() => {
          // 网络错误等 → 保守地保持只读
          setIsReadOnly(true);
          setSessionExpired(true);
        })
        .finally(() => {
          setRestoring(false);
        });
    },
    [setAppState],
  );

  const reset = useCallback(() => {
    setSessionId("");
    setSelectedRuleId("default");
    setCheckReport(null);
    setFixReport(null);
    setFixLoading(false);
    setCustomRulesYaml(undefined);
    setIsReadOnly(false);
    setSessionExpired(false);
    setRestoring(false);
  }, []);

  return {
    sessionId,
    selectedRuleId,
    checkReport,
    fixReport,
    fixLoading,
    customRulesYaml,
    restorableCustomRuleId,
    restorableCustomRulesYaml,
    isReadOnly,
    sessionExpired,
    restoring,
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
