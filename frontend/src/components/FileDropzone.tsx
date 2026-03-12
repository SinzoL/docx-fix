/**
 * 文件拖拽上传区组件
 *
 * 支持拖拽/点击上传 .docx 文件，展示已选/未选两种状态。
 */

import { Upload } from "tdesign-react";
import type { UploadFile } from "tdesign-react";
import { CheckCircleIcon } from "tdesign-icons-react";
import { formatFileSize } from "../utils/format";

interface FileDropzoneProps {
  selectedFile: File | null;
  onFileChange: (files: Array<UploadFile>) => void;
}

export default function FileDropzone({ selectedFile, onFileChange }: FileDropzoneProps) {
  return (
    <div className="p-4 sm:p-6" aria-label="上传Word文档区域，支持拖拽或点击上传">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
        <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-600 text-white text-xs font-bold">2</span>
        上传目标文档
      </label>
      <Upload
        theme="custom"
        draggable
        accept=".docx"
        autoUpload={false}
        onChange={onFileChange}
        multiple={false}
      >
        <div className={`w-full border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-all cursor-pointer group relative overflow-hidden ${
          selectedFile ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-300 hover:border-blue-400 bg-slate-50/30 hover:bg-blue-50/20'
        }`}>
          {/* 背景动效 */}
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
              <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-700 font-display">
                  拖拽文件到此处，或点击浏览
                </p>
                <p className="text-sm font-medium text-slate-500 mt-2">
                  仅支持 <span className="text-blue-600">.docx</span> 格式，最大 50MB
                </p>
              </div>
            </div>
          )}
        </div>
      </Upload>
    </div>
  );
}
