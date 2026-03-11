/**
 * React 错误边界组件
 *
 * 功能：
 * - 捕获子组件渲染错误，防止白屏
 * - 展示友好的错误提示和重试按钮
 */

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="glass-card rounded-2xl p-8 sm:p-12 text-center max-w-lg w-full">
            <div className="w-20 h-20 bg-red-100 rounded-full mx-auto flex items-center justify-center mb-6">
              <span className="text-4xl">⚠️</span>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-3 font-display">
              页面出错了
            </h3>
            <p className="text-slate-500 mb-2">
              页面遇到了一个意外错误，请尝试刷新。
            </p>
            {this.state.error && (
              <p className="text-xs text-slate-400 bg-slate-100 rounded-lg p-3 mb-6 font-mono break-all">
                {this.state.error.message}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-6 py-2.5 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
              >
                重试
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-white text-slate-600 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-all cursor-pointer"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
