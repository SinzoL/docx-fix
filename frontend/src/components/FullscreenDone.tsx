import { SvgIcon } from "./icons/SvgIcon";

interface FullscreenDoneProps {
  /** 主标题，如"大功告成！"/"润色完成！" */
  title: string;
  /** 副文字 */
  subtitle?: string;
  /** 操作按钮文案，如"检查新文档"/"润色新文档" */
  buttonText: string;
  /** 点击按钮回到 IDLE */
  onReset: () => void;
  /** 额外内容区（如历史列表等） */
  children?: React.ReactNode;
}

/**
 * 全屏完成页组件
 *
 * 三模块共用，通过 props 区分文案。
 * 视觉效果从 App.tsx 原有 DOWNLOADED 内联 JSX 提取，像素级一致。
 */
export default function FullscreenDone({ title, subtitle, buttonText, onReset, children }: FullscreenDoneProps) {
  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <div className="glass-card rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto mt-8">
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-tr from-green-400 to-emerald-500 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-6 sm:mb-8 animate-bounce">
          <span className="text-3xl sm:text-4xl text-white">
            <SvgIcon name="check" size={36} />
          </span>
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2 sm:mb-3 font-display">{title}</h3>
        {subtitle && (
          <p className="text-base sm:text-lg text-slate-600">{subtitle}</p>
        )}
        <button
          onClick={onReset}
          className="mt-8 px-8 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          {buttonText}
        </button>
      </div>
      {children && (
        <div className="max-w-lg mx-auto mt-6">
          {children}
        </div>
      )}
    </div>
  );
}
