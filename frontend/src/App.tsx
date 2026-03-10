/**
 * 应用主组件
 *
 * 定义应用状态机：
 * IDLE → UPLOADING → CHECKING → REPORT_READY → FIXING → FIX_PREVIEW → DOWNLOADED
 */

import { useState, useEffect, useCallback } from "react";
import { MessagePlugin } from "tdesign-react";
import type { AppState, CheckReport, FixReport } from "./types";
import { fixFile } from "./services/api";
import { cleanExpired, saveHistory, updateFixReport } from "./services/cache";
import { init as initRuleStorage, startCrossTabSync } from "./services/ruleStorage";
import UploadPanel from "./components/UploadPanel";
import ExtractPanel from "./components/ExtractPanel";
import CheckReportView from "./components/CheckReport";
import FixPreview from "./components/FixPreview";
import HistoryList from "./components/HistoryList";
import { SvgIcon } from "./components/icons/SvgIcon";

function App() {
  const [appState, setAppState] = useState<AppState>("IDLE");
  const [activeTab, setActiveTab] = useState<"check" | "extract">("check");
  const [sessionId, setSessionId] = useState<string>("");
  const [selectedRuleId, setSelectedRuleId] = useState<string>("default");
  const [checkReport, setCheckReport] = useState<CheckReport | null>(null);
  const [fixReport, setFixReport] = useState<FixReport | null>(null);
  const [fixLoading, setFixLoading] = useState(false);
  /** 当前选中的自定义规则 YAML 内容（选择自定义规则时有值） */
  const [customRulesYaml, setCustomRulesYaml] = useState<string | undefined>(undefined);
  /** #13: 是否为只读模式（查看历史报告时启用） */
  const [isReadOnly, setIsReadOnly] = useState(false);

  // 初始化：清理过期缓存
  useEffect(() => {
    cleanExpired().then((count) => {
      if (count > 0) {
        console.log(`已清理 ${count} 条过期缓存`);
      }
    });
    // 初始化 localStorage 规则存储（清理过期规则）
    initRuleStorage();
    // 启动跨 Tab 规则同步（T023: 当其他 Tab 修改规则时自动更新）
    const stopSync = startCrossTabSync();
    return () => stopSync();
  }, []);

  // 重置到初始状态
  const handleReset = useCallback(() => {
    setAppState("IDLE");
    setSessionId("");
    setCheckReport(null);
    setFixReport(null);
    setFixLoading(false);
    setCustomRulesYaml(undefined);
    setIsReadOnly(false);
  }, []);

  // 检查开始回调（UploadPanel 内部已经做了状态管理）
  const handleCheckStart = useCallback(() => {
    setAppState("CHECKING");
  }, []);

  // 检查完成回调
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
        report
      ).catch((err) => {
        console.warn("缓存检查记录失败:", err);
      });
    },
    []
  );

  // 上传/检查出错回调
  const handleCheckError = useCallback(() => {
    setAppState("IDLE");
  }, []);

  // 一键修复（#5: 增加防抖保护，fixLoading 为 true 时忽略重复调用）
  const handleFix = useCallback(async () => {
    if (!sessionId || !selectedRuleId || fixLoading) return;

    setFixLoading(true);
    setAppState("FIXING");

    try {
      const report = await fixFile(sessionId, selectedRuleId, customRulesYaml);
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
      // 修复失败回到报告页面
      setAppState("REPORT_READY");
    } finally {
      setFixLoading(false);
    }
  }, [sessionId, selectedRuleId, customRulesYaml, fixLoading]);

  // 下载完成回调
  const handleDownloadComplete = useCallback(() => {
    setAppState("DOWNLOADED");
  }, []);

  // 重新检查回调（规则切换后）
  const handleRecheck = useCallback(
    (report: CheckReport) => {
      setCheckReport(report);
      setSelectedRuleId(report.rule_id);
      setFixReport(null);
    },
    []
  );

  // 规则切换回调
  const handleRuleChange = useCallback((ruleId: string) => {
    setSelectedRuleId(ruleId);
  }, []);

  // 查看历史报告回调（#13: 历史报告设为只读模式）
  const handleViewHistoryReport = useCallback((report: CheckReport) => {
    setCheckReport(report);
    setSessionId(report.session_id);
    setSelectedRuleId(report.rule_id);
    setIsReadOnly(true);
    setCustomRulesYaml(undefined);
    setAppState("REPORT_READY");
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden font-sans">
      {/* 动态渐变背景装饰 */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-400/20 blur-[100px] animate-float pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-400/20 blur-[120px] animate-float pointer-events-none" style={{ animationDelay: '2s' }}></div>

      {/* 头部 */}
      <header className="sticky top-0 z-50 glass border-b border-white/50">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 to-indigo-500 rounded-xl shadow-lg flex items-center justify-center text-white text-xl shadow-blue-500/30">
                <SvgIcon name="document" size={22} />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 font-display">
                  DocxFix AI
                </h1>
                <p className="text-xs font-medium text-slate-500 mt-0.5 tracking-wide uppercase">
                  智能文档格式检查与修复
                </p>
              </div>
            </div>
            {appState !== "IDLE" && (
              <button
                onClick={handleReset}
                className="group flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white/50 rounded-full hover:bg-white hover:text-blue-600 hover:shadow-sm transition-all cursor-pointer"
              >
                <span className="transform group-hover:-translate-x-1 transition-transform">←</span>
                返回主页
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-5xl mx-auto px-6 py-8 relative z-10">
        {/* IDLE 状态 — 显示 Tab 导航 + 对应面板 */}
        {appState === "IDLE" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center py-4 sm:py-6">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3 sm:mb-4 font-display">
                格式问题，<span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">一键解决</span>
              </h2>
              <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto px-4">
                上传您的 Word 文档，借助大语言模型与精准规则，让格式规范不再令人头疼。
              </p>
            </div>

            {/* Tab 导航 */}
            <div className="flex justify-center">
              <div className="inline-flex bg-white/60 backdrop-blur-sm rounded-xl p-1 border border-slate-200/60 shadow-sm">
                <button
                  onClick={() => setActiveTab("check")}
                  className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                    activeTab === "check"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <SvgIcon name="search" size={16} /> 上传检查
                </button>
                <button
                  onClick={() => setActiveTab("extract")}
                  className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                    activeTab === "extract"
                      ? "bg-white text-purple-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <SvgIcon name="scan-extract" size={16} /> 提取规则
                </button>
              </div>
            </div>

            {/* 根据 Tab 展示不同面板 */}
            {activeTab === "check" && (
              <>
                <UploadPanel
                  onCheckStart={handleCheckStart}
                  onCheckComplete={handleCheckComplete}
                  onError={handleCheckError}
                  selectedRuleId={selectedRuleId}
                  onRuleChange={handleRuleChange}
                  customRulesYaml={customRulesYaml}
                  onCustomRulesYamlChange={setCustomRulesYaml}
                  onGoToExtract={() => setActiveTab("extract")}
                />
                <div className="mt-8">
                  <HistoryList onViewReport={handleViewHistoryReport} />
                </div>
              </>
            )}

            {activeTab === "extract" && (
              <ExtractPanel />
            )}
          </div>
        )}

        {/* CHECKING 状态 — 显示加载中 */}
        {appState === "CHECKING" && (
          <div className="glass-card rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto mt-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6">
              <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-xl sm:text-2xl"><SvgIcon name="search" size={24} /></div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-800 font-display">正在深度分析文档...</h3>
            <p className="text-sm sm:text-base text-slate-500 mt-2 sm:mt-3 font-medium">
              这可能需要几秒钟，AI 正在比对各项规则
            </p>
          </div>
        )}

        {/* REPORT_READY 状态 — 显示检查报告 */}
        {appState === "REPORT_READY" && checkReport && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4 sm:mt-6">
            <CheckReportView
              report={checkReport}
              onFix={handleFix}
              fixLoading={fixLoading}
              sessionId={sessionId}
              onRecheck={handleRecheck}
              readOnly={isReadOnly}
              customRulesYaml={customRulesYaml}
              onCustomRulesYamlChange={setCustomRulesYaml}
            />
          </div>
        )}

        {/* FIXING 状态 — 修复中 */}
        {appState === "FIXING" && (
          <div className="glass-card rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto mt-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6">
              <div className="absolute inset-0 border-4 border-emerald-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-xl sm:text-2xl"><SvgIcon name="sparkles" size={24} /></div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-800 font-display">正在魔法修复格式...</h3>
            <p className="text-sm sm:text-base text-slate-500 mt-2 sm:mt-3 font-medium">
              即将完成，让您的文档焕然一新
            </p>
          </div>
        )}

        {/* FIX_PREVIEW 状态 — 修复预览 */}
        {appState === "FIX_PREVIEW" && fixReport && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4 sm:mt-6">
            <FixPreview
              report={fixReport}
              sessionId={sessionId}
              onDownloadComplete={handleDownloadComplete}
            />
          </div>
        )}

        {/* DOWNLOADED 状态 */}
        {appState === "DOWNLOADED" && (
          <div className="glass-card rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto mt-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-tr from-green-400 to-emerald-500 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-6 sm:mb-8 animate-bounce">
              <span className="text-3xl sm:text-4xl text-white"><SvgIcon name="check" size={36} /></span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2 sm:mb-3 font-display">大功告成！</h3>
            <p className="text-base sm:text-lg text-slate-600">
              修复后的完美文档已下载到本地
            </p>
            <button
              onClick={handleReset}
              className="mt-8 px-8 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              检查新文档
            </button>
          </div>
        )}
      </main>

      {/* 页脚 */}
      <footer className="relative z-10 border-t border-slate-200/50 mt-8">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* 隐私安全声明 */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-slate-200/50">
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <SvgIcon name="shield-check" size={18} className="text-emerald-500" />
            </div>
            <div className="text-sm text-slate-500 leading-relaxed">
              <span className="font-semibold text-slate-600">隐私保护承诺</span>
              <span className="mx-1.5 text-slate-300">|</span>
              您上传的论文文档和模板文件仅在处理期间临时使用，完成后立即从服务器删除；自定义规则仅存储在您的浏览器本地，不会上传至服务器。我们不会收集、存储或分享您的任何文件内容。
            </div>
          </div>

          {/* 底部信息栏 */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
            <p className="font-medium">DocxFix AI · 智能驱动的文档格式检查与修复工具</p>
            <div className="flex items-center gap-5">
              <a
                href="https://github.com/SinzoL/docx-fix"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <SvgIcon name="github" size={16} />
                <span>GitHub</span>
                <SvgIcon name="external-link" size={12} className="opacity-50" />
              </a>
              <a
                href="mailto:3013749951@qq.com"
                className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <SvgIcon name="mail" size={16} />
                <span>3013749951@qq.com</span>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
