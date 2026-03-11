/**
 * PolishUploadPanel — 润色上传入口面板
 *
 * 从 PolishPanel 瘦身而来，仅保留：
 * - 文件上传区域（拖拽/点击）
 * - "开始内容润色"按钮
 *
 * 不渲染 PolishProgress / PolishPreview / PolishDone（由 App.tsx 全屏渲染）
 */

import { useState, useCallback } from "react";
import { Upload, MessagePlugin } from "tdesign-react";
import type { UploadFile } from "tdesign-react";
import { CheckCircleIcon } from "tdesign-icons-react";
import { SvgIcon } from "./icons/SvgIcon";
import { formatFileSize } from "../utils/format";

interface PolishUploadPanelProps {
  /** 开始润色回调（传入文件） */
  onStartPolish: (file: File) => Promise<void>;
}

export default function PolishUploadPanel({
  onStartPolish,
}: PolishUploadPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // 文件变化处理
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
    } else {
      setSelectedFile(null);
    }
  }, []);

  // 开始润色
  const handleStart = useCallback(async () => {
    if (!selectedFile) {
      MessagePlugin.warning("请先选择文件");
      return;
    }
    setUploading(true);
    try {
      await onStartPolish(selectedFile);
    } finally {
      setUploading(false);
    }
  }, [selectedFile, onStartPolish]);

  return (
    <div className="glass-card rounded-2xl overflow-hidden shadow-xl shadow-violet-500/5 border border-white/60">
      {/* 提示信息 */}
      <div className="bg-gradient-to-br from-white/60 to-violet-50/40 p-4 sm:p-6 border-b border-slate-200/50">
        <div className="flex items-start gap-3 text-sm text-slate-600">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex-shrink-0">
            <SvgIcon name="sparkles" size={18} />
          </span>
          <div>
            <p className="font-semibold text-slate-700 mb-1">内容润色模式</p>
            <p className="text-xs text-slate-500">
              AI 将对文档中的文本进行学术表达优化（语病修正、用词润色、句式优化等），同时确保原始语义不变。
              您可以逐条审阅每一处修改，选择接受或拒绝。
            </p>
          </div>
        </div>
      </div>

      {/* 文件上传区域 */}
      <div className="p-4 sm:p-6">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-violet-600 text-white text-xs font-bold">1</span>
          上传目标文档
        </label>
        <Upload
          theme="custom"
          draggable
          accept=".docx"
          autoUpload={false}
          onChange={handleFileChange}
          multiple={false}
        >
          <div className={`w-full border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-all cursor-pointer group relative overflow-hidden ${
            selectedFile ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-300 hover:border-violet-400 bg-slate-50/30 hover:bg-violet-50/20'
          }`}>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full duration-1000 transition-transform"></div>

            {selectedFile ? (
              <div className="flex flex-col items-center gap-4 relative z-10 animate-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-500 shadow-sm">
                  <CheckCircleIcon size="40px" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-800 font-display">
                    {selectedFile.name}
                  </p>
                  <p className="text-sm font-medium text-slate-500 mt-1">
                    {formatFileSize(selectedFile.size)} · 点击或拖拽替换文件
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 relative z-10">
                <div className="w-20 h-20 bg-violet-50 text-violet-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-700 font-display">
                    拖拽文件到此处，或点击浏览
                  </p>
                  <p className="text-sm font-medium text-slate-500 mt-2">
                    仅支持 <span className="text-violet-600">.docx</span> 格式，最大 50MB
                  </p>
                </div>
              </div>
            )}
          </div>
        </Upload>
      </div>

      {/* 开始润色按钮 */}
      <div className="p-4 sm:p-5 bg-slate-50/50 border-t border-slate-200/50 flex justify-end">
        <button
          onClick={handleStart}
          disabled={!selectedFile || uploading}
          className={`px-8 sm:px-10 py-2.5 sm:py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform ${
            !selectedFile
              ? 'bg-slate-300 shadow-none cursor-not-allowed opacity-70'
              : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 hover:shadow-violet-500/30 hover:-translate-y-0.5 cursor-pointer'
          }`}
        >
          {uploading ? '正在上传...' : '开始内容润色'}
        </button>
      </div>
    </div>
  );
}
