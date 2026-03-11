/**
 * 提取结果展示子组件
 *
 * 负责：操作栏（重新提取/下载/保存）、摘要卡片、YAML 预览、保存对话框
 */

import { useState } from "react";
import { Input, Dialog } from "tdesign-react";
import { SvgIcon } from "./icons/SvgIcon";
import {
  highlightYaml,
  parseYamlSections,
  YAML_HIGHLIGHT_STYLES,
} from "../utils/yamlHighlight";
import type { ExtractResult, ExtractSummary } from "../types";

/** 摘要检测模块配置 */
const SUMMARY_MODULES: {
  key: keyof ExtractSummary;
  label: string;
  icon: string;
}[] = [
  { key: "has_page_setup", label: "页面设置", icon: "ruler" },
  { key: "has_header_footer", label: "页眉页脚", icon: "bookmark" },
  { key: "has_numbering", label: "编号定义", icon: "hash" },
  { key: "has_structure", label: "文档结构", icon: "clipboard-list" },
  { key: "has_special_checks", label: "特殊检查", icon: "search" },
  { key: "has_heading_style_fix", label: "标题修复", icon: "wrench" },
];

interface ExtractResultViewProps {
  result: ExtractResult;
  ruleName: string;
  onRuleNameChange: (name: string) => void;
  onReset: () => void;
  onDownload: () => void;
  onSave: () => void;
  saveDialogVisible: boolean;
  onSaveDialogVisibleChange: (visible: boolean) => void;
  children?: React.ReactNode; // 用于插入 RuleManager
}

export default function ExtractResultView({
  result,
  ruleName,
  onRuleNameChange,
  onReset,
  onDownload,
  onSave,
  saveDialogVisible,
  onSaveDialogVisibleChange,
  children,
}: ExtractResultViewProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 注入 YAML 高亮样式 */}
      <style>{YAML_HIGHLIGHT_STYLES}</style>

      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-slate-800 font-display">
            提取完成 <SvgIcon name="sparkles" size={18} />
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            从{" "}
            <span className="font-semibold text-slate-700">
              {result.filename}
            </span>{" "}
            中成功提取格式规则
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onReset}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white/80 border border-slate-200 rounded-xl hover:bg-white hover:text-slate-800 transition-all cursor-pointer"
          >
            ← 重新提取
          </button>
          <button
            onClick={onDownload}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white/80 border border-slate-200 rounded-xl hover:bg-white hover:text-slate-800 transition-all cursor-pointer"
          >
            ⬇ 下载 YAML
          </button>
          <button
            onClick={() => onSaveDialogVisibleChange(true)}
            className="px-6 py-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl hover:from-violet-500 hover:to-purple-500 shadow-lg hover:shadow-purple-500/30 transition-all cursor-pointer"
          >
            <SvgIcon name="folder" size={14} /> 保存规则
          </button>
        </div>
      </div>

      {/* 摘要卡片 */}
      <SummaryCard summary={result.summary} />

      {/* YAML 预览 */}
      <YamlPreview yamlContent={result.yaml_content} />

      {/* 插槽：RuleManager 等额外内容 */}
      {children}

      {/* 保存对话框 */}
      <Dialog
        header="保存规则到浏览器"
        visible={saveDialogVisible}
        onClose={() => onSaveDialogVisibleChange(false)}
        onConfirm={onSave}
        confirmBtn="保存"
        cancelBtn="取消"
      >
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              规则名称
            </label>
            <Input
              value={ruleName}
              onChange={(val) => onRuleNameChange(val as string)}
              placeholder="请输入规则名称"
              maxlength={100}
            />
          </div>
          <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg">
            <SvgIcon name="lightbulb" size={14} /> 规则将保存在浏览器本地存储中，30 天后自动过期。不同设备/浏览器的规则互不影响。
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ========================================
// 内部子组件：摘要卡片
// ========================================

function SummaryCard({ summary }: { summary: ExtractSummary }) {
  const detectedModules = SUMMARY_MODULES.filter(
    (m) => summary[m.key] === true
  );

  return (
    <div className="glass-card rounded-2xl p-5 sm:p-6 border border-white/60">
      <h4 className="text-base font-bold text-slate-700 mb-4"><SvgIcon name="chart-bar" size={16} /> 提取摘要</h4>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* 样式数量统计 */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100/50">
          <div className="text-3xl font-extrabold text-blue-600">
            {summary.style_count}
          </div>
          <div className="text-xs font-medium text-slate-500 mt-1">
            检测到的样式
          </div>
        </div>

        {/* 检测模块列表 */}
        {SUMMARY_MODULES.map((mod) => {
          const detected = summary[mod.key] === true;
          return (
            <div
              key={mod.key}
              className={`rounded-xl p-4 border transition-all ${
                detected
                  ? "bg-emerald-50 border-emerald-100/50"
                  : "bg-slate-50 border-slate-100/50 opacity-50"
              }`}
            >
              <div className="text-2xl"><SvgIcon name={mod.icon} size={24} /></div>
              <div className="text-xs font-medium text-slate-600 mt-1">
                {mod.label}
              </div>
              <div
                className={`text-xs mt-1 font-semibold ${
                  detected ? "text-emerald-600" : "text-slate-400"
                }`}
              >
                {detected ? <><SvgIcon name="check" size={12} /> 已检测</> : "— 未检测到"}
              </div>
            </div>
          );
        })}
      </div>

      {/* 页面设置信息 */}
      {summary.page_setup_info && (
        <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
          <SvgIcon name="file-text" size={14} /> 纸张：{summary.page_setup_info.paper_size}（
          {summary.page_setup_info.width_cm} × {summary.page_setup_info.height_cm} cm）
        </div>
      )}

      {/* 样式名称列表 */}
      {summary.style_names && summary.style_names.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.style_names.map((name) => (
            <span
              key={name}
              className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-100"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* 检测结果 */}
      <div className="mt-4 text-xs text-slate-500">
        检测到 {detectedModules.length} 个模块 · 共 {summary.style_count} 个样式 · 提取于{" "}
        {summary.extracted_at
          ? new Date(summary.extracted_at).toLocaleString("zh-CN")
          : "刚刚"}
      </div>
    </div>
  );
}

// ========================================
// 内部子组件：YAML 预览（分节高亮）
// ========================================

function YamlPreview({ yamlContent }: { yamlContent: string }) {
  const sections = parseYamlSections(yamlContent);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    () => new Set(sections.map((_, i) => i))
  );

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-white/60">
      <div className="bg-white/40 px-5 py-4 border-b border-slate-200/50 flex items-center justify-between">
        <h4 className="text-base font-bold text-slate-700"><SvgIcon name="document" size={16} /> YAML 规则预览</h4>
        <span className="text-xs text-slate-400 font-mono">
          {sections.length} 节 · {yamlContent.split("\n").length} 行
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {sections.map((section, index) => (
          <div key={index}>
            {/* 节标题 */}
            <button
              onClick={() => toggleSection(index)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50/50 transition-colors cursor-pointer"
            >
              <span className="text-sm font-semibold text-slate-700">
                {section.title || `节 ${index + 1}`}
              </span>
              <span
                className={`text-slate-400 transition-transform duration-200 ${
                  expandedSections.has(index) ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            </button>

            {/* 节内容 */}
            {expandedSections.has(index) && (
              <div className="px-5 pb-4">
                <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto text-sm leading-relaxed font-mono">
                  {/* SECURITY: dangerouslySetInnerHTML 安全 — highlightYaml 内部对所有输入先做 escapeHtml 转义，再拼接 <span> 标签 */}
                  <code
                    dangerouslySetInnerHTML={{
                      __html: highlightYaml(section.content),
                    }}
                  />
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
