/**
 * 应用主组件
 *
 * 设计模式：自定义 Hook 分域 + 顶层状态编排
 *
 * 三模块统一流程：
 * - 检查：IDLE → UPLOADING → CHECKING → REPORT_READY → FIXING → FIX_PREVIEW → DOWNLOADED
 * - 提取：IDLE → EXTRACTING → EXTRACT_RESULT
 * - 润色：IDLE → POLISHING → POLISH_PREVIEW → POLISH_APPLYING → POLISH_DONE
 *
 * 各模块业务逻辑分别委托给 useCheckFlow / useExtractFlow / usePolishFlow Hook，
 * App 仅负责：
 * - 顶层 appState 状态机
 * - Tab 导航
 * - 初始化（清理缓存、规则同步）
 * - 全屏布局渲染
 * - 返回/中断确认
 */

import { useState, useEffect, useCallback, Fragment } from "react";
import { DialogPlugin } from "tdesign-react";
import type { AppState } from "./types";
import { cleanExpired, cleanExpiredPolish, cleanExpiredExtract } from "./services/cache";
import { init as initRuleStorage, startCrossTabSync } from "./services/ruleStorage";
import { useCheckFlow } from "./hooks/useCheckFlow";
import { useExtractFlow } from "./hooks/useExtractFlow";
import { usePolishFlow } from "./hooks/usePolishFlow";
import UploadPanel from "./components/UploadPanel";
import ExtractUploadPanel from "./components/ExtractUploadPanel";
import ExtractResultView from "./components/ExtractResult";
import ExtractHistoryList from "./components/ExtractHistoryList";
import RuleManager from "./components/RuleManager";
import CheckReportView from "./components/CheckReport";
import FixPreview from "./components/FixPreview";
import HistoryList from "./components/HistoryList";
import PolishUploadPanel from "./components/PolishUploadPanel";
import PolishProgress from "./components/PolishProgress";
import PolishPreview from "./components/PolishPreview";
import PolishHistoryList from "./components/PolishHistoryList";
import FullscreenLoading from "./components/FullscreenLoading";
import FullscreenDone from "./components/FullscreenDone";
import { SvgIcon } from "./components/icons/SvgIcon";

/** 状态 → 所属 Tab 映射，用于返回时自动定位到正确 Tab */
const stateToTab: Record<AppState, "check" | "extract" | "polish"> = {
  IDLE: "check",
  UPLOADING: "check",
  CHECKING: "check",
  REPORT_READY: "check",
  FIXING: "check",
  FIX_PREVIEW: "check",
  DOWNLOADED: "check",
  EXTRACTING: "extract",
  EXTRACT_RESULT: "extract",
  POLISHING: "polish",
  POLISH_PREVIEW: "polish",
  POLISH_APPLYING: "polish",
  POLISH_DONE: "polish",
};

function App() {
  const [appState, setAppState] = useState<AppState>("IDLE");
  const [activeTab, setActiveTab] = useState<"check" | "extract" | "polish">("check");
  const [footerPrivacyExpanded, setFooterPrivacyExpanded] = useState(false);

  // 检查/修复流程 — 委托自定义 Hook 管理
  const check = useCheckFlow(setAppState);

  // 提取流程 — 委托自定义 Hook 管理
  const extract = useExtractFlow(setAppState);

  // 润色流程 — 委托自定义 Hook 管理
  const polish = usePolishFlow(setAppState);

  // 初始化：清理过期缓存 + 规则同步
  useEffect(() => {
    cleanExpired().then((count) => {
      if (count > 0) console.log(`已清理 ${count} 条过期缓存`);
    });
    cleanExpiredPolish().then((count) => {
      if (count > 0) console.log(`已清理 ${count} 条过期润色缓存`);
    });
    cleanExpiredExtract().then((count) => {
      if (count > 0) console.log(`已清理 ${count} 条过期提取缓存`);
    });
    initRuleStorage();
    const stopSync = startCrossTabSync();
    return () => stopSync();
  }, []);

  // 重置到初始状态（自动定位到触发该流程的模块 Tab）
  // 润色进行中返回 → 弹确认对话框
  const handleReset = useCallback(() => {
    if (polish.isPolishing) {
      const d = DialogPlugin.confirm({
        header: "确认离开",
        body: "润色正在进行中，离开后未完成的进度不会保存。确定离开？",
        confirmBtn: "确认离开",
        cancelBtn: "继续润色",
        onConfirm: () => {
          polish.abort();
          polish.reset();
          setActiveTab(stateToTab[appState]);
          setAppState("IDLE");
          d.hide();
        },
        onCancel: () => {
          d.hide();
        },
        onClose: () => {
          d.hide();
        },
      });
      return;
    }
    setActiveTab(stateToTab[appState]);
    setAppState("IDLE");
    check.reset();
    extract.reset();
    polish.reset();
  }, [appState, check, extract, polish]);

  // 按需触发润色 IndexedDB 恢复（仅在润色 Tab 可见 + IDLE 时）
  useEffect(() => {
    if (activeTab === "polish" && appState === "IDLE") {
      polish.triggerRestore();
    }
  }, [activeTab, appState, polish]);

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
                  className={`flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm transition-all duration-200 cursor-pointer ${
                    activeTab === "check"
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 font-bold"
                      : "text-slate-500 hover:text-slate-700 font-semibold"
                  }`}
                >
                  <SvgIcon name="search" size={16} /> 上传检查
                </button>
                <button
                  onClick={() => setActiveTab("extract")}
                  className={`flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm transition-all duration-200 cursor-pointer ${
                    activeTab === "extract"
                      ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/25 font-bold"
                      : "text-slate-500 hover:text-slate-700 font-semibold"
                  }`}
                >
                  <SvgIcon name="scan-extract" size={16} /> 提取规则
                </button>
                <button
                  onClick={() => setActiveTab("polish")}
                  className={`flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm transition-all duration-200 cursor-pointer ${
                    activeTab === "polish"
                      ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/25 font-bold"
                      : "text-slate-500 hover:text-slate-700 font-semibold"
                  }`}
                >
                  <SvgIcon name="sparkles" size={16} /> 内容润色
                </button>
              </div>
            </div>

            {/* 根据 Tab 展示不同面板（使用 display 控制保活，避免切换时丢失状态） */}
            <div style={{ display: activeTab === "check" ? "block" : "none" }}>
              <UploadPanel
                onCheckStart={check.handleCheckStart}
                onCheckComplete={check.handleCheckComplete}
                onError={check.handleCheckError}
                selectedRuleId={check.selectedRuleId}
                onRuleChange={check.handleRuleChange}
                customRulesYaml={check.customRulesYaml}
                onCustomRulesYamlChange={check.handleCustomRulesYamlChange}
                onGoToExtract={() => setActiveTab("extract")}
              />
              <div className="mt-8">
                <HistoryList onViewReport={(report, record) => check.handleViewHistoryReport(report, record)} />
              </div>
            </div>

            <div style={{ display: activeTab === "extract" ? "block" : "none" }}>
              <ExtractUploadPanel
                onExtractStart={extract.handleExtractStart}
                onExtractComplete={extract.handleExtractComplete}
                onExtractError={extract.handleExtractError}
                ruleManagerKey={extract.ruleManagerKey}
                onRuleManagerChange={extract.refreshRuleManager}
              />
              <div className="mt-8">
                <ExtractHistoryList
                  onViewResult={extract.handleViewHistory}
                  refreshKey={extract.historyRefreshKey}
                />
              </div>
            </div>

            <div style={{ display: activeTab === "polish" ? "block" : "none" }}>
              <PolishUploadPanel onStartPolish={polish.handleStartPolish} />
              <div className="mt-8">
                <PolishHistoryList
                  onViewResult={polish.handleViewHistory}
                  refreshKey={polish.historyRefreshKey}
                />
              </div>
            </div>
          </div>
        )}

        {/* CHECKING 状态 — 显示加载中 */}
        {appState === "CHECKING" && (
          <FullscreenLoading
            color="blue"
            icon="search"
            title="AI 正在深度检查中..."
            subtitle="正在逐项比对格式规则，预计需要 10~30 秒"
          />
        )}

        {/* REPORT_READY 状态 — 显示检查报告 */}
        {appState === "REPORT_READY" && check.checkReport && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4 sm:mt-6">
            <CheckReportView
              report={check.checkReport}
              onFix={check.handleFix}
              fixLoading={check.fixLoading}
              sessionId={check.sessionId}
              selectedRuleId={check.selectedRuleId}
              onSelectedRuleIdChange={check.handleRuleChange}
              onRecheck={check.handleRecheck}
              readOnly={check.isReadOnly}
              sessionExpired={check.sessionExpired}
              restoring={check.restoring}
              customRulesYaml={check.customRulesYaml}
              restorableCustomRuleId={check.restorableCustomRuleId}
              restorableCustomRulesYaml={check.restorableCustomRulesYaml}
              onCustomRulesYamlChange={check.handleCustomRulesYamlChange}
            />
          </div>
        )}

        {/* FIXING 状态 — 修复中 */}
        {appState === "FIXING" && (
          <FullscreenLoading
            color="emerald"
            icon="sparkles"
            title="正在智能修复格式..."
            subtitle="AI 正在逐项修复文档格式问题，预计需要 10~30 秒"
          />
        )}

        {/* FIX_PREVIEW 状态 — 修复预览 */}
        {appState === "FIX_PREVIEW" && check.fixReport && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4 sm:mt-6">
            <FixPreview
              report={check.fixReport}
              sessionId={check.sessionId}
              onDownloadComplete={check.handleDownloadComplete}
            />
          </div>
        )}

        {/* DOWNLOADED 状态 */}
        {appState === "DOWNLOADED" && (
          <FullscreenDone
            title="大功告成！"
            subtitle="修复后的完美文档已下载到本地"
            buttonText="检查新文档"
            onReset={handleReset}
          />
        )}

        {/* EXTRACTING 状态 — 提取中 */}
        {appState === "EXTRACTING" && (
          <FullscreenLoading
            color="violet"
            icon="scan-extract"
            title="正在分析模板文档..."
            subtitle="正在提取格式规则"
          />
        )}

        {/* EXTRACT_RESULT 状态 — 提取结果全屏 */}
        {appState === "EXTRACT_RESULT" && extract.extractResult && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4 sm:mt-6">
            <ExtractResultView
              result={extract.extractResult}
              ruleName={extract.ruleName}
              onRuleNameChange={extract.setRuleName}
              onDownload={extract.handleDownload}
              onSave={extract.handleSave}
              saveDialogVisible={extract.saveDialogVisible}
              onSaveDialogVisibleChange={extract.setSaveDialogVisible}
              onYamlContentChange={extract.handleMergedYamlChange}
            >
              <RuleManager key={`result-${extract.ruleManagerKey}`} />
            </ExtractResultView>
          </div>
        )}

        {/* POLISHING 状态 — 润色中（全屏进度） */}
        {appState === "POLISHING" && (
          <div className="glass-card rounded-2xl overflow-hidden shadow-xl shadow-violet-500/5 border border-white/60 max-w-2xl mx-auto mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-gradient-to-br from-white/60 to-violet-50/40 p-6 sm:p-8 text-center">
              <div className="relative mx-auto w-16 h-16 mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-violet-100 animate-spin" style={{ borderTopColor: 'rgb(139, 92, 246)' }}></div>
                <div className="absolute inset-2 rounded-full bg-violet-50 flex items-center justify-center">
                  <SvgIcon name="sparkles" size={24} className="text-violet-500" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-slate-800 font-display mb-1">正在润色文档...</h3>
              <p className="text-sm text-slate-500">AI 正在逐段分析文档内容</p>
            </div>
            <PolishProgress
              progress={polish.progress}
              totalParagraphs={polish.totalParagraphs}
              polishableParagraphs={polish.polishableParagraphs}
              suggestions={polish.suggestions}
            />
          </div>
        )}

        {/* POLISH_PREVIEW 状态 — 润色预览全屏 */}
        {appState === "POLISH_PREVIEW" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4 sm:mt-6">
            <PolishPreview
              suggestions={polish.suggestions}
              summary={polish.summary}
              onApply={polish.handleApplyAndDownload}
              applying={false}
              sessionId={polish.sessionId}
              initialDecisions={polish.initialDecisions}
              readOnly={polish.isReadOnly}
              sessionExpired={polish.sessionExpired}
            />
          </div>
        )}

        {/* POLISH_APPLYING 状态 — 正在应用润色修改 */}
        {appState === "POLISH_APPLYING" && (
          <FullscreenLoading
            color="violet"
            icon="sparkles"
            title="正在应用修改..."
            subtitle="即将完成，润色后的文档马上就好"
          />
        )}

        {/* POLISH_DONE 状态 — 润色完成 */}
        {appState === "POLISH_DONE" && (
          <FullscreenDone
            title="润色完成！"
            subtitle="润色后的文档已下载到本地"
            buttonText="润色新文档"
            onReset={handleReset}
          >
            <PolishHistoryList
              onViewResult={polish.handleViewHistory}
              refreshKey={polish.historyRefreshKey}
            />
          </FullscreenDone>
        )}
      </main>

      {/* 页脚 */}
      <footer className="relative z-10 border-t border-slate-200/50 mt-8">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* 隐私安全声明（可折叠） */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-slate-200/50">
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <SvgIcon name="shield-check" size={18} className="text-emerald-500" />
            </div>
            <div className="text-sm text-slate-500 leading-relaxed">
              <span className="font-semibold text-slate-600">隐私保护承诺</span>
              <span className="mx-1.5 text-slate-300">|</span>
              <span>您的文档数据受到安全保护。</span>
              {footerPrivacyExpanded ? (
                <Fragment>
                  <span> 上传的文档、模板文件及自定义规则内容会在服务器随会话临时保留，空闲约一小时后自动清除；检查记录、提取结果和润色结果仅缓存在浏览器本地（IndexedDB）。如使用 AI 总结、问答、规则生成、争议审查或内容润色，相关内容会发送到服务器并转交 AI 服务处理。</span>
                  <button onClick={() => setFooterPrivacyExpanded(false)} className="text-blue-500 hover:text-blue-600 ml-1 cursor-pointer hover:underline">收起</button>
                </Fragment>
              ) : (
                <button onClick={() => setFooterPrivacyExpanded(true)} className="text-blue-500 hover:text-blue-600 ml-1 cursor-pointer hover:underline">查看详情</button>
              )}
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
                <span>联系作者</span>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
