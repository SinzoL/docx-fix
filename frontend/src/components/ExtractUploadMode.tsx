/**
 * 模板上传模式子组件
 *
 * 负责：文件拖拽上传区域、文件选中状态展示、提取按钮
 */

import { Upload } from "tdesign-react";
import type { UploadFile } from "tdesign-react";
import { CheckCircleIcon } from "tdesign-icons-react";
import { SvgIcon } from "./icons/SvgIcon";

interface ExtractUploadModeProps {
  selectedFile: File | null;
  onFileChange: (files: Array<UploadFile>) => void;
  onExtract: () => void;
  errorMsg: string;
  isError: boolean;
}

export default function ExtractUploadMode({
  selectedFile,
  onFileChange,
  onExtract,
  errorMsg,
  isError,
}: ExtractUploadModeProps) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden shadow-xl shadow-blue-500/5 border border-white/60">
      {/* 说明区域 */}
      <div className="bg-white/40 p-4 sm:p-6 border-b border-slate-200/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-violet-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-lg shadow-lg shadow-purple-500/30">
            <SvgIcon name="scan-extract" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              从模板文档提取规则
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              上传学校发布的 .docx 格式模板，自动提取格式要求生成检查规则
            </p>
          </div>
        </div>
      </div>

      {/* 文件上传 */}
      <div className="p-4 sm:p-6">
        <Upload
          theme="custom"
          draggable
          accept=".docx"
          autoUpload={false}
          onChange={onFileChange}
          multiple={false}
        >
          <div
            className={`w-full border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-all cursor-pointer group relative overflow-hidden ${
              selectedFile
                ? "border-emerald-300 bg-emerald-50/50"
                : "border-slate-300 hover:border-purple-400 bg-slate-50/30 hover:bg-purple-50/20"
            }`}
          >
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
                    {selectedFile.size >= 1024 * 1024
                      ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB`
                      : `${(selectedFile.size / 1024).toFixed(1)} KB`} ·
                    点击或拖拽替换文件
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 relative z-10">
                <div className="w-20 h-20 bg-purple-50 text-purple-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <svg
                    className="w-8 h-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-700 font-display">
                    拖拽模板文件到此处，或点击浏览
                  </p>
                  <p className="text-sm font-medium text-slate-500 mt-2">
                    仅支持{" "}
                    <span className="text-purple-600">.docx</span>{" "}
                    格式模板文件
                  </p>
                </div>
              </div>
            )}
          </div>
        </Upload>

        {/* 错误提示 */}
        {isError && errorMsg && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            <SvgIcon name="x-circle" size={14} /> {errorMsg}
          </div>
        )}
      </div>

      {/* 隐私提示 + 提取按钮 */}
      <div className="px-4 sm:px-6 pb-2 flex items-start gap-2 text-xs text-slate-400">
        <SvgIcon name="shield-check" size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
        <span>您的模板文档仅在提取期间临时处理，处理完成后立即从服务器删除，不会被存储或用于任何其他用途。</span>
      </div>
      <div className="p-4 sm:p-5 bg-slate-50/50 border-t border-slate-200/50 flex justify-end">
        <button
          onClick={onExtract}
          disabled={!selectedFile}
          className={`px-8 sm:px-10 py-2.5 sm:py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform ${
            !selectedFile
              ? "bg-slate-300 shadow-none cursor-not-allowed opacity-70"
              : "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 hover:shadow-purple-500/30 hover:-translate-y-0.5 cursor-pointer"
          }`}
        >
          开始提取规则
        </button>
      </div>
    </div>
  );
}
