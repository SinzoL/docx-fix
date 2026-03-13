import { SvgIcon } from "./icons/SvgIcon";

type ThemeColor = "blue" | "emerald" | "violet";

interface FullscreenLoadingProps {
  /** 主色调：blue(检查) / emerald(修复) / violet(提取/润色) */
  color: ThemeColor;
  /** SvgIcon 图标名称 */
  icon: string;
  /** 主标题 */
  title: string;
  /** 副文字 */
  subtitle?: string;
  /** 进度百分比 (0-100)，不传则不显示进度条 */
  progress?: number;
  /** 进度文本，如 "3/10 步骤" */
  progressText?: string;
}

const colorMap: Record<ThemeColor, { outer: string; inner: string; bg: string }> = {
  blue: {
    outer: "border-blue-100",
    inner: "border-blue-500",
    bg: "bg-blue-500",
  },
  emerald: {
    outer: "border-emerald-100",
    inner: "border-emerald-500",
    bg: "bg-emerald-500",
  },
  violet: {
    outer: "border-violet-100",
    inner: "border-violet-500",
    bg: "bg-violet-500",
  },
};

/**
 * 全屏加载动画组件
 *
 * 三模块 + 修复共用，通过 props 区分颜色和文案。
 * 支持可选的进度条显示。
 */
export default function FullscreenLoading({ 
  color, 
  icon, 
  title, 
  subtitle,
  progress,
  progressText,
}: FullscreenLoadingProps) {
  const theme = colorMap[color];
  const showProgress = progress !== undefined && progress >= 0;

  return (
    <div className="glass-card rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto mt-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6">
        <div className={`absolute inset-0 border-4 ${theme.outer} rounded-full`}></div>
        <div className={`absolute inset-0 border-4 ${theme.inner} border-t-transparent rounded-full animate-spin`}></div>
        <div className="absolute inset-0 flex items-center justify-center text-xl sm:text-2xl">
          <SvgIcon name={icon} size={24} />
        </div>
      </div>
      <h3 className="text-xl sm:text-2xl font-bold text-slate-800 font-display">{title}</h3>
      {subtitle && (
        <p className="text-sm sm:text-base text-slate-500 mt-2 sm:mt-3 font-medium">
          {subtitle}
        </p>
      )}
      
      {/* 进度条 */}
      {showProgress && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-2 text-xs font-medium text-slate-500">
            <span>{progressText || `处理中...`}</span>
            <span>{Math.min(100, Math.max(0, progress))}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={`h-full ${theme.bg} rounded-full transition-all duration-300 ease-out`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
