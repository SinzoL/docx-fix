/**
 * 应用主组件
 *
 * 设计模式：自定义 Hook 分域 + 顶层状态编排
 *
 * 状态机：IDLE → UPLOADING → CHECKING → REPORT_READY → FIXING → FIX_PREVIEW → DOWNLOADED
 *
 * 检查/修复逻辑委托给 useCheckFlow Hook，App 仅负责：
 * - 顶层 appState 状态机
 * - Tab 导航
 * - 初始化（清理缓存、规则同步）
 * - 布局和路由级渲染
 */

import { useState, useEffect, useCallback } from "react";
import type { AppState } from "./types";
import { cleanExpired, cleanExpiredPolish } from "./services/cache";
import { init as initRuleStorage, startCrossTabSync } from "./services/ruleStorage";
import { useCheckFlow } from "./hooks/useCheckFlow";
import UploadPanel from "./components/UploadPanel";
import ExtractPanel from "./components/ExtractPanel";
import CheckReportView from "./components/CheckReport";
import FixPreview from "./components/FixPreview";
import HistoryList from "./components/HistoryList";
import PolishPanel from "./components/PolishPanel";
import { SvgIcon } from "./components/icons/SvgIcon";

function App() {
  const [appState, setAppState] = useState<AppState>("IDLE");
  const [activeTab, setActiveTab] = useState<"check" | "extract" | "polish">("check");

  // 检查/修复流程 — 委托自定义 Hook 管理
  const check = useCheckFlow(setAppState);

  // 初始化：清理过期缓存 + 规则同步
  useEffect(() => {
    cleanExpired().then((count) => {
      if (count > 0) console.log(`已清理 ${count} 条过期缓存`);
    });
    cleanExpiredPolish().then((count) => {
      if (count > 0) console.log(`已清理 ${count} 条过期润色缓存`);
    });
    initRuleStorage();
    const stopSync = startCrossTabSync();
    return () => stopSync();
  }, []);

  // 重置到初始状态
  const handleReset = useCallback(() => {
    setAppState("IDLE");
    check.reset();
  }, [check]);

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
                <button
                  onClick={() => setActiveTab("polish")}
                  className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                    activeTab === "polish"
                      ? "bg-white text-violet-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
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
                <HistoryList onViewReport={check.handleViewHistoryReport} />
              </div>
            </div>

            <div style={{ display: activeTab === "extract" ? "block" : "none" }}>
              <ExtractPanel />
            </div>

            <div style={{ display: activeTab === "polish" ? "block" : "none" }}>
              <PolishPanel />
            </div>
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
        {appState === "REPORT_READY" && check.checkReport && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4 sm:mt-6">
            <CheckReportView
              report={check.checkReport}
              onFix={check.handleFix}
              fixLoading={check.fixLoading}
              sessionId={check.sessionId}
              onRecheck={check.handleRecheck}
              readOnly={check.isReadOnly}
              customRulesYaml={check.customRulesYaml}
              onCustomRulesYamlChange={check.handleCustomRulesYamlChange}
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
