/**
 * 规则管理面板组件
 *
 * 功能：
 * - 展示所有已保存的自定义规则列表
 * - 查看规则 YAML 详情预览
 * - 重命名规则
 * - 删除规则（二次确认）
 * - 下载规则为 .yaml 文件
 */

import { useState, useEffect, useCallback } from "react";
import { Dialog, Input, MessagePlugin } from "tdesign-react";
import {
  getAll,
  remove,
  rename,
  downloadAsYaml,
} from "../services/ruleStorage";
import {
  highlightYaml,
  YAML_HIGHLIGHT_STYLES,
} from "../utils/yamlHighlight";
import type { CustomRule } from "../types";

/** 来源标签映射 */
const SOURCE_LABELS: Record<string, { text: string; color: string }> = {
  "template-extract": { text: "模板提取", color: "bg-violet-100 text-violet-700 border-violet-200" },
  "llm-generate": { text: "AI 生成", color: "bg-amber-100 text-amber-700 border-amber-200" },
};

interface RuleManagerProps {
  /** 当规则列表发生变化时回调（新增/删除/重命名后触发） */
  onRulesChange?: () => void;
}

export default function RuleManager({ onRulesChange }: RuleManagerProps) {
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renameDialogVisible, setRenameDialogVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [targetRule, setTargetRule] = useState<CustomRule | null>(null);
  const [newName, setNewName] = useState("");

  // 加载规则列表
  const loadRules = useCallback(() => {
    setRules(getAll());
  }, []);

  useEffect(() => {
    // 使用 queueMicrotask 避免在 effect 中同步调用 setState
    queueMicrotask(() => {
      loadRules();
    });
  }, [loadRules]);

  // 监听 storage 事件（多 Tab 同步）
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "docx-fix:custom-rules") {
        loadRules();
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [loadRules]);

  // 切换展开/折叠
  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // 打开重命名对话框
  const openRename = useCallback((rule: CustomRule) => {
    setTargetRule(rule);
    setNewName(rule.name);
    setRenameDialogVisible(true);
  }, []);

  // 确认重命名
  const handleRename = useCallback(() => {
    if (!targetRule || !newName.trim()) {
      MessagePlugin.warning("请输入规则名称");
      return;
    }
    const success = rename(targetRule.id, newName.trim());
    if (success) {
      MessagePlugin.success("重命名成功");
      loadRules();
      onRulesChange?.();
    } else {
      MessagePlugin.error("重命名失败");
    }
    setRenameDialogVisible(false);
    setTargetRule(null);
  }, [targetRule, newName, loadRules, onRulesChange]);

  // 打开删除确认
  const openDelete = useCallback((rule: CustomRule) => {
    setTargetRule(rule);
    setDeleteDialogVisible(true);
  }, []);

  // 确认删除
  const handleDelete = useCallback(() => {
    if (!targetRule) return;
    const success = remove(targetRule.id);
    if (success) {
      MessagePlugin.success("规则已删除");
      // 如果删除的是当前展开的，关闭详情
      if (expandedId === targetRule.id) {
        setExpandedId(null);
      }
      loadRules();
      onRulesChange?.();
    } else {
      MessagePlugin.error("删除失败");
    }
    setDeleteDialogVisible(false);
    setTargetRule(null);
  }, [targetRule, expandedId, loadRules, onRulesChange]);

  // 下载
  const handleDownload = useCallback((rule: CustomRule) => {
    downloadAsYaml(rule);
    MessagePlugin.success("已开始下载");
  }, []);

  // 格式化日期
  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  // 当前时间戳（避免在渲染期间调用不纯函数 Date.now()）
  const [now] = useState(() => Date.now());

  // 计算剩余天数
  const daysRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  if (rules.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-white/60 text-center">
        <div className="text-4xl mb-3">📂</div>
        <h4 className="text-base font-bold text-slate-700">暂无保存的规则</h4>
        <p className="text-sm text-slate-500 mt-1">
          提取模板或使用 AI 生成规则后，可保存到此处方便复用
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <style>{YAML_HIGHLIGHT_STYLES}</style>

      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <h4 className="text-base font-bold text-slate-700">
          📂 我的规则 <span className="text-sm font-normal text-slate-400">({rules.length})</span>
        </h4>
      </div>

      {/* 规则列表 */}
      <div className="space-y-2">
        {rules.map((rule) => {
          const sourceInfo = SOURCE_LABELS[rule.source] || {
            text: rule.source,
            color: "bg-slate-100 text-slate-600 border-slate-200",
          };
          const isExpanded = expandedId === rule.id;
          const remaining = daysRemaining(rule.expires_at);

          return (
            <div
              key={rule.id}
              className="glass-card rounded-xl border border-white/60 overflow-hidden transition-all"
            >
              {/* 规则行 */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors"
                onClick={() => toggleExpand(rule.id)}
              >
                {/* 展开指示 */}
                <span
                  className={`text-slate-400 transition-transform duration-200 text-xs ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                >
                  ▶
                </span>

                {/* 规则信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 text-sm truncate">
                      {rule.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full border ${sourceInfo.color}`}
                    >
                      {sourceInfo.text}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    {rule.source_filename && (
                      <span>📄 {rule.source_filename}</span>
                    )}
                    <span>保存于 {formatDate(rule.created_at)}</span>
                    <span
                      className={
                        remaining <= 7
                          ? "text-orange-500 font-medium"
                          : ""
                      }
                    >
                      {remaining}天后过期
                    </span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => openRename(rule)}
                    className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                    title="重命名"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDownload(rule)}
                    className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                    title="下载 YAML"
                  >
                    ⬇️
                  </button>
                  <button
                    onClick={() => openDelete(rule)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* YAML 详情预览（展开时显示） */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="mt-3">
                    <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto text-xs leading-relaxed font-mono max-h-80 overflow-y-auto">
                      <code
                        dangerouslySetInnerHTML={{
                          __html: highlightYaml(rule.yaml_content),
                        }}
                      />
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 重命名对话框 */}
      <Dialog
        header="重命名规则"
        visible={renameDialogVisible}
        onClose={() => setRenameDialogVisible(false)}
        onConfirm={handleRename}
        confirmBtn="确认"
        cancelBtn="取消"
      >
        <div className="py-2">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            新名称
          </label>
          <Input
            value={newName}
            onChange={(val) => setNewName(val as string)}
            placeholder="请输入新的规则名称"
            maxlength={100}
          />
        </div>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog
        header="确认删除"
        visible={deleteDialogVisible}
        onClose={() => setDeleteDialogVisible(false)}
        onConfirm={handleDelete}
        confirmBtn={{ content: "删除", theme: "danger" }}
        cancelBtn="取消"
      >
        <div className="py-2 text-sm text-slate-600">
          确定要删除规则「<span className="font-semibold">{targetRule?.name}</span>」吗？此操作不可撤销。
        </div>
      </Dialog>
    </div>
  );
}
