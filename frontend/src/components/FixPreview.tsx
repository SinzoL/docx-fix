/**
 * 修复预览组件
 *
 * 功能：
 * - 展示修复前后 summary 对比
 * - 展示修复项列表
 * - 展示变化项（before_status → after_status）
 * - #1: 展示修复后完整检查报告
 * - 下载修复后文件
 */

import { useState, useCallback } from "react";
import { MessagePlugin } from "tdesign-react";
import { downloadFixedFile, triggerDownload } from "../services/api";
import type { FixReport, CheckItemResult } from "../types";
import { SvgIcon } from "./icons/SvgIcon";

interface FixPreviewProps {
  report: FixReport;
  sessionId: string;
  onDownloadComplete: () => void;
}

// 状态颜色映射（复用 CheckReport 的逻辑）
const STATUS_CONFIG = {
  PASS: { icon: "check", label: "通过" },
  WARN: { icon: "alert-triangle", label: "警告" },
  FAIL: { icon: "x-circle", label: "失败" },
};

export default function FixPreview({
  report,
  sessionId,
  onDownloadComplete,
}: FixPreviewProps) {
  const [downloading, setDownloading] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);

  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const blob = await downloadFixedFile(sessionId);
      const base = report.filename.replace(/\.docx$/i, "");
      triggerDownload(blob, `${base}_fixed.docx`);
      MessagePlugin.success("下载成功！");
      setDownloadSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "下载失败";
      MessagePlugin.error(message);
    } finally {
      setDownloading(false);
    }
  }, [sessionId, report.filename]);

  // 按类别分组修复后检查项
  const groupedAfterItems = (report.after_items ?? []).reduce<Record<string, CheckItemResult[]>>((groups, item) => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
    return groups;
  }, {});

  return (
    <div className="space-y-4">
      {/* 修复概览 */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border-t-4 border-t-emerald-500 relative overflow-hidden">
        {/* 背景光晕装饰 */}
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-emerald-400/20 blur-3xl rounded-full pointer-events-none"></div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 mb-6 relative z-10">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 font-display flex items-center gap-2">
              <span className="text-emerald-500"><SvgIcon name="sparkles" size={22} /></span> 修复结果预览
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-2 flex items-center gap-2">
              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">{report.filename}</span> 
              <span>·</span> 
              <span>检查标准：<span className="text-emerald-600">{report.rule_name}</span></span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {downloadSuccess && (
              <button
                onClick={onDownloadComplete}
                className="px-6 py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 hover:shadow-lg transition-all cursor-pointer"
              >
                ✓ 完成
              </button>
            )}
            <button
              disabled={downloading}
              onClick={handleDownload}
              aria-label="下载修复后的文档"
              className={`px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all flex items-center gap-2 ${
                downloading
                  ? "bg-slate-400 cursor-not-allowed shadow-none"
                  : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 hover:shadow-emerald-500/30 hover:-translate-y-0.5 cursor-pointer"
              }`}
            >
            {downloading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                下载中...
              </span>
            ) : (
              <>
                <span className="text-lg"><SvgIcon name="folder" size={18} /></span> 下载修复后文件
              </>
            )}
          </button>
          </div>
        </div>

        {/* 修复前后对比 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
          {/* 修复前 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 relative">
            <h3 className="text-sm font-bold text-slate-500 mb-4 uppercase tracking-wider flex items-center justify-between">
              <span>修复前</span>
              <span className="text-xl"><SvgIcon name="alert-triangle" size={20} /></span>
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-black text-emerald-600/50 font-display">
                  {report.before_summary.pass_count}
                </div>
                <div className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">通过</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-amber-500 font-display">
                  {report.before_summary.warn}
                </div>
                <div className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">警告</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-rose-500 font-display">
                  {report.before_summary.fail}
                </div>
                <div className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">错误</div>
              </div>
            </div>
          </div>

          {/* 修复后 */}
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-100/30 to-transparent pointer-events-none"></div>
            <h3 className="text-sm font-bold text-emerald-700 mb-4 uppercase tracking-wider flex items-center justify-between relative z-10">
              <span>修复后</span>
              <span className="text-xl"><SvgIcon name="check" size={20} /></span>
            </h3>
            <div className="grid grid-cols-3 gap-4 relative z-10">
              <div className="text-center">
                <div className="text-3xl font-black text-emerald-600 font-display animate-in zoom-in duration-500">
                  {report.after_summary.pass_count}
                </div>
                <div className="text-xs font-bold text-emerald-800 mt-1 uppercase tracking-wider">通过</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-amber-500 font-display transition-all duration-500">
                  {report.after_summary.warn}
                </div>
                <div className="text-xs font-bold text-amber-800 mt-1 uppercase tracking-wider">警告</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-rose-500 font-display transition-all duration-500">
                  {report.after_summary.fail}
                </div>
                <div className="text-xs font-bold text-rose-800 mt-1 uppercase tracking-wider">错误</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 变化项列表 */}
      {report.changed_items.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden border border-white/60">
          <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
              状态变化项 ({report.changed_items.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100/50">
            {report.changed_items.map((item, index) => {
              const STATUS_STYLES = {
                FAIL: { bg: 'bg-rose-100 text-rose-700 border-rose-200', label: '失败' },
                WARN: { bg: 'bg-amber-100 text-amber-700 border-amber-200', label: '警告' },
                PASS: { bg: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: '通过' },
              } as const;
              const beforeStyle = STATUS_STYLES[item.before_status as keyof typeof STATUS_STYLES] || STATUS_STYLES.PASS;
              const afterStyle = STATUS_STYLES[item.after_status as keyof typeof STATUS_STYLES] || STATUS_STYLES.PASS;
              
              return (
                <div
                  key={index}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-emerald-50/30 transition-colors"
                >
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${beforeStyle.bg}`}>
                      {beforeStyle.label}
                    </span>
                    <span className="text-slate-300">→</span>
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${afterStyle.bg}`}>
                      {afterStyle.label}
                    </span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-bold">
                        {item.category}
                      </span>
                      <span className="text-sm font-bold text-slate-800">
                        {item.item}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {item.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 修复操作列表（按 fix_layer 分组） */}
      {report.fix_items.length > 0 && (() => {
        const formatFixItems = report.fix_items.filter(i => (i.fix_layer ?? "format") === "format");
        const textFixItems = report.fix_items.filter(i => i.fix_layer === "text_convention");

        return (
          <>
            {/* 格式修复操作 */}
            {formatFixItems.length > 0 && (
              <div className="glass-card rounded-xl overflow-hidden border border-white/60">
                <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                    格式修复操作 ({formatFixItems.length})
                  </h3>
                </div>
                <div className="divide-y divide-slate-100/50">
                  {formatFixItems.map((item, index) => (
                    <div key={index} className="px-6 py-3 flex items-start sm:items-center gap-3 hover:bg-blue-50/30 transition-colors">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-xs font-bold shrink-0">
                        {item.category}
                      </span>
                      <span className="text-sm font-medium text-slate-600">
                        {item.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 文本排版修复操作 */}
            {textFixItems.length > 0 && (
              <div className="glass-card rounded-xl overflow-hidden border border-white/60">
                <div className="px-6 py-4 bg-violet-50/80 border-b border-violet-100">
                  <h3 className="font-bold text-violet-800 flex items-center gap-2">
                    <span className="w-2 h-6 bg-violet-500 rounded-full"></span>
                    文本排版修复 ({textFixItems.length})
                  </h3>
                </div>
                <div className="divide-y divide-violet-100/50">
                  {textFixItems.map((item, index) => (
                    <div key={index} className="px-6 py-3 flex items-start sm:items-center gap-3 hover:bg-violet-50/30 transition-colors">
                      <span className="px-2.5 py-1 bg-violet-50 text-violet-700 border border-violet-100 rounded-lg text-xs font-bold shrink-0">
                        {item.category}
                      </span>
                      <span className="text-sm font-medium text-slate-600">
                        {item.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* #1: 修复后完整检查报告（可展开/收起） */}
      {(report.after_items ?? []).length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden border border-white/60">
          <div
            className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 transition-colors"
            onClick={() => setShowFullReport(!showFullReport)}
          >
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <span className="w-2 h-6 bg-indigo-500 rounded-full"></span>
              修复后完整检查报告 ({(report.after_items ?? []).length} 项)
            </h3>
            <span className={`text-slate-400 transition-transform duration-200 ${showFullReport ? 'rotate-90' : ''}`}>
              <SvgIcon name="chevron-right" size={16} />
            </span>
          </div>
          {showFullReport && (
            <div className="divide-y divide-slate-100/50 animate-in fade-in slide-in-from-top-2 duration-200">
              {Object.entries(groupedAfterItems).map(([category, items]) => (
                <div key={category}>
                  <div className="px-6 py-3 bg-slate-50/50 text-sm font-bold text-slate-600">
                    {category}
                  </div>
                  {items.map((item, idx) => {
                    const config = STATUS_CONFIG[item.status];
                    return (
                      <div key={`${item.item}-${idx}`} className="px-6 py-3 flex items-center gap-3 hover:bg-blue-50/20 transition-colors">
                        <span className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border ${
                          item.status === 'PASS' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          item.status === 'WARN' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          <SvgIcon name={config.icon} size={12} /> {config.label}
                        </span>
                        <span className="text-sm font-medium text-slate-700">{item.item}</span>
                        <span className="text-xs text-slate-500 truncate">{item.message}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
