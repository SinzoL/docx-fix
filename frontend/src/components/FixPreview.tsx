/**
 * 修复预览组件
 *
 * 功能：
 * - 展示修复前后 summary 对比
 * - 展示修复项列表
 * - 展示变化项（before_status → after_status）
 * - 下载修复后文件
 */

import { useState, useCallback } from "react";
import { MessagePlugin } from "tdesign-react";
import { downloadFixedFile, triggerDownload } from "../services/api";
import type { FixReport } from "../types";

interface FixPreviewProps {
  report: FixReport;
  sessionId: string;
  onDownloadComplete: () => void;
}

export default function FixPreview({
  report,
  sessionId,
  onDownloadComplete,
}: FixPreviewProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const blob = await downloadFixedFile(sessionId);
      const base = report.filename.replace(/\.docx$/i, "");
      triggerDownload(blob, `${base}_fixed.docx`);
      MessagePlugin.success("下载成功！");
      onDownloadComplete();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "下载失败";
      MessagePlugin.error(message);
    } finally {
      setDownloading(false);
    }
  }, [sessionId, report.filename, onDownloadComplete]);

  return (
    <div className="space-y-4">
      {/* 修复概览 */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border-t-4 border-t-emerald-500 relative overflow-hidden">
        {/* 背景光晕装饰 */}
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-emerald-400/20 blur-3xl rounded-full pointer-events-none"></div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 mb-6 relative z-10">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 font-display flex items-center gap-2">
              <span className="text-emerald-500">✨</span> 修复结果预览
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-2 flex items-center gap-2">
              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">{report.filename}</span> 
              <span>·</span> 
              <span>模板：<span className="text-emerald-600">{report.rule_name}</span></span>
            </p>
          </div>

          <button
            disabled={downloading}
            onClick={handleDownload}
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
                <span className="text-lg">📥</span> 下载修复后文件
              </>
            )}
          </button>
        </div>

        {/* 修复前后对比 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
          {/* 修复前 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 relative">
            <h3 className="text-sm font-bold text-slate-500 mb-4 uppercase tracking-wider flex items-center justify-between">
              <span>修复前</span>
              <span className="text-xl">⚠️</span>
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-black text-emerald-600/50 font-display">
                  {report.before_summary.pass}
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
              <span className="text-xl">✅</span>
            </h3>
            <div className="grid grid-cols-3 gap-4 relative z-10">
              <div className="text-center">
                <div className="text-3xl font-black text-emerald-600 font-display animate-in zoom-in duration-500">
                  {report.after_summary.pass}
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
              const beforeColor = item.before_status === 'FAIL' ? 'rose' : item.before_status === 'WARN' ? 'amber' : 'emerald';
              const afterColor = item.after_status === 'PASS' ? 'emerald' : item.after_status === 'WARN' ? 'amber' : 'rose';
              
              return (
                <div
                  key={index}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-emerald-50/30 transition-colors"
                >
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-${beforeColor}-100 text-${beforeColor}-700 border border-${beforeColor}-200`}>
                      {item.before_status === 'FAIL' ? '失败' : item.before_status === 'WARN' ? '警告' : '通过'}
                    </span>
                    <span className="text-slate-300">→</span>
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-${afterColor}-100 text-${afterColor}-700 border border-${afterColor}-200`}>
                      {item.after_status === 'FAIL' ? '失败' : item.after_status === 'WARN' ? '警告' : '通过'}
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

      {/* 修复操作列表 */}
      {report.fix_items.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden border border-white/60">
          <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
              自动修复操作记录 ({report.fix_items.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100/50">
            {report.fix_items.map((item, index) => (
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
    </div>
  );
}
