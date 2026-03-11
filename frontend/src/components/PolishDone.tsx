/**
 * PolishDone — 润色完成页面
 *
 * 显示成功提示 + "润色新文档" 按钮 + 历史列表
 */

import type { PolishHistoryRecord } from "../types";
import PolishHistoryList from "./PolishHistoryList";

interface PolishDoneProps {
  onReset: () => void;
  onViewHistoryResult: (record: PolishHistoryRecord) => void;
  historyRefreshKey: number;
}

export default function PolishDone({ onReset, onViewHistoryResult, historyRefreshKey }: PolishDoneProps) {
  return (
    <div className="space-y-8">
      <div className="glass-card rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto animate-in fade-in zoom-in-95 duration-500">
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-tr from-green-400 to-emerald-500 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-6 sm:mb-8 animate-bounce">
          <span className="text-3xl sm:text-4xl text-white">✓</span>
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2 sm:mb-3 font-display">润色完成！</h3>
        <p className="text-base sm:text-lg text-slate-600">
          润色后的文档已下载到本地
        </p>
        <button
          onClick={onReset}
          className="mt-8 px-8 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          润色新文档
        </button>
      </div>
      {/* 润色历史 */}
      <PolishHistoryList
        onViewResult={onViewHistoryResult}
        refreshKey={historyRefreshKey}
      />
    </div>
  );
}
