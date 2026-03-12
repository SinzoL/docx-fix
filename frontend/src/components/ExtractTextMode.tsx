/**
 * 文字描述模式子组件
 *
 * 负责：文本输入区域、AI 生成按钮、LLM 错误提示
 */

import { SvgIcon } from "./icons/SvgIcon";

interface ExtractTextModeProps {
  textInput: string;
  onTextChange: (value: string) => void;
  onGenerate: () => void;
  llmLoading: boolean;
  llmError: string;
  errorMsg: string;
  isError: boolean;
}

export default function ExtractTextMode({
  textInput,
  onTextChange,
  onGenerate,
  llmLoading,
  llmError,
  errorMsg,
  isError,
}: ExtractTextModeProps) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden shadow-xl shadow-blue-500/5 border border-white/60">
      {/* 说明区域 */}
      <div className="bg-white/40 p-4 sm:p-6 border-b border-slate-200/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-amber-500 to-orange-500 rounded-xl flex items-center justify-center text-white text-lg shadow-lg shadow-amber-500/30">
            <SvgIcon name="wrench" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              用文字描述格式要求
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              输入您的格式规范要求，AI 将自动生成对应的 YAML 检查规则
            </p>
          </div>
        </div>
      </div>

      {/* 文本输入区域 */}
      <div className="p-4 sm:p-6">
        <textarea
          value={textInput}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={"示例：\n- 正文使用宋体小四号，1.5倍行距\n- 一级标题黑体三号加粗，居中\n- 页边距上下2.54cm，左右3.17cm\n- 页码居中，从第二页开始\n- 图表标题使用宋体五号"}
          className="w-full h-48 sm:h-56 p-4 rounded-xl border border-slate-200 bg-white/80 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-300 transition-all placeholder:text-slate-400"
        />

        {/* LLM 不可用降级提示 */}
        {llmError && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm flex items-start gap-2">
            <span className="text-base mt-0.5"><SvgIcon name="alert-triangle" size={16} /></span>
            <div>
              <p className="font-semibold">AI 服务暂不可用</p>
              <p className="mt-1 text-amber-600">{llmError}</p>
            </div>
          </div>
        )}

        {/* 普通错误提示 */}
        {isError && errorMsg && !llmError && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            <SvgIcon name="x-circle" size={14} /> {errorMsg}
          </div>
        )}
      </div>

      {/* 生成按钮 */}
      <div className="p-4 sm:p-5 bg-slate-50/50 border-t border-slate-200/50 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="block text-xs text-slate-400">
            {textInput.length > 0 ? `${textInput.length} 字` : "请输入格式要求"}
          </span>
          <span className="block text-xs text-slate-400">点击生成后，输入内容会发送到 AI 服务生成规则；结果仅保存在当前浏览器。</span>
        </div>
        <button
          onClick={onGenerate}
          disabled={!textInput.trim() || llmLoading}
          className={`px-8 sm:px-10 py-2.5 sm:py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform ${
            !textInput.trim() || llmLoading
              ? "bg-slate-300 shadow-none cursor-not-allowed opacity-70"
              : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 hover:shadow-amber-500/30 hover:-translate-y-0.5 cursor-pointer"
          }`}
        >
          {llmLoading ? "AI 生成中..." : <><SvgIcon name="bot" size={16} /> 生成规则</>}
        </button>
      </div>
    </div>
  );
}
