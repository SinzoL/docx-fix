/**
 * 前端类型定义
 *
 * 对应 data-model.md 和 contracts/api.md 中定义的数据结构。
 */

// ========================================
// 检查状态
// ========================================
export type CheckStatus = "PASS" | "WARN" | "FAIL";

// ========================================
// 规则相关
// ========================================
export interface RuleInfo {
  id: string;
  filename: string;
  name: string;
  description: string;
  is_default: boolean;
  is_preset: boolean;
}

export interface RuleDetailItem {
  item: string;
  value: string;
}

export interface RuleDetailSection {
  name: string;
  rules: RuleDetailItem[];
}

export interface RuleDetailResponse {
  id: string;
  name: string;
  description: string;
  sections: RuleDetailSection[];
}

export interface RulesListResponse {
  rules: RuleInfo[];
}

// ========================================
// 检查相关
// ========================================

/** LLM 审查结果 */
export interface AiReviewResult {
  verdict: "confirmed" | "ignored" | "uncertain";
  reason: string;
}

export interface CheckItemResult {
  category: string;
  item: string;
  status: CheckStatus;
  message: string;
  location: string | null;
  fixable: boolean;
  /** 文本习惯检查项 ID（如 "tc-001"），用于异步 AI 审查匹配 */
  id?: string;
  /** 检查层级："format"（格式检查）| "text_convention"（文本排版习惯） */
  check_layer?: "format" | "text_convention";
  /** LLM 审查结果（仅争议项在审查后有） */
  ai_review?: AiReviewResult | null;
}

export interface CheckSummary {
  pass_count: number;
  warn: number;
  fail: number;
  fixable: number;
}

/** 争议项（传给 AI 审查的数据） */
export interface DisputedItem {
  id: string;
  rule: string;
  paragraph_index: number;
  paragraph_source: string;
  text_context: string;
  issue_description: string;
}

/** 文本习惯检查元数据 */
export interface TextConventionMeta {
  disputed_items: DisputedItem[];
  document_stats: {
    total_paragraphs: number;
    cjk_spaced_count: number;
    cjk_unspaced_count: number;
  };
}

export interface CheckReport {
  session_id: string;
  filename: string;
  rule_id: string;
  rule_name: string;
  items: CheckItemResult[];
  summary: CheckSummary;
  checked_at: string;
  /** 文本习惯检查元数据（有争议项时存在） */
  text_convention_meta?: TextConventionMeta | null;
}

// ========================================
// 修复相关
// ========================================
export interface FixItemResult {
  category: string;
  description: string;
  /** 修复层级："format"（格式修复）| "text_convention"（文本修复） */
  fix_layer?: "format" | "text_convention";
}

export interface ChangedItem {
  category: string;
  item: string;
  before_status: CheckStatus;
  after_status: CheckStatus;
  message: string;
}

export interface FixSummary {
  pass_count: number;
  warn: number;
  fail: number;
}

export interface FixReport {
  session_id: string;
  filename: string;
  rule_name: string;
  fix_items: FixItemResult[];
  before_summary: FixSummary;
  after_summary: FixSummary;
  changed_items: ChangedItem[];
  fixed_at: string;
  after_items?: CheckItemResult[];  // #1: 修复后完整检查项列表（可选，旧版 API 无此字段）
}

// ========================================
// 错误响应
// ========================================
export interface ErrorResponse {
  error: string;
  message: string;
}

// ========================================
// 应用状态
// ========================================
export type AppState =
  | "IDLE"
  | "UPLOADING"
  | "CHECKING"
  | "REPORT_READY"
  | "FIXING"
  | "FIX_PREVIEW"
  | "DOWNLOADED"
  // 润色状态
  | "POLISHING"
  | "POLISH_PREVIEW"
  | "POLISH_APPLYING";

// ========================================
// IndexedDB 缓存
// ========================================
export interface HistoryRecord {
  id: string;
  filename: string;
  rule_id: string;
  rule_name: string;
  check_report: CheckReport;
  fix_report?: FixReport;
  created_at: number;
  expires_at: number;
}

// ========================================
// AI 相关
// ========================================
export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiSummarizeRequest {
  session_id: string;
  check_report: CheckReport;
}

export interface AiChatRequest {
  session_id: string;
  messages: AiChatMessage[];
  check_report?: CheckReport;
}

export interface AiGenerateRulesRequest {
  text: string;
  name?: string;
}

export interface AiGenerateRulesResponse {
  yaml_content: string;
  warnings: string[];
}

/** AI 审查争议项响应 */
export interface AiReviewConventionsResponse {
  reviews: Array<{
    id: string;
    verdict: "confirmed" | "ignored" | "uncertain";
    reason: string;
  }>;
}

// ========================================
// 模板提取相关
// ========================================

/** 提取结果中的页面设置信息 */
export interface ExtractPageSetupInfo {
  paper_size: string;
  width_cm: number;
  height_cm: number;
}

/** 模板提取结果摘要 */
export interface ExtractSummary {
  has_page_setup: boolean;
  has_header_footer: boolean;
  has_numbering: boolean;
  has_structure: boolean;
  has_special_checks: boolean;
  has_heading_style_fix: boolean;
  style_count: number;
  style_names: string[];
  page_setup_info: ExtractPageSetupInfo | null;
  extracted_at: string;
}

/** POST /api/extract-rules 响应 */
export interface ExtractResult {
  yaml_content: string;
  summary: ExtractSummary;
  filename: string;
}

// ========================================
// 自定义规则（localStorage）
// ========================================

/** 规则来源类型 */
export type RuleSource = "template-extract" | "llm-generate";

/** 自定义规则（保存在浏览器 localStorage 中） */
export interface CustomRule {
  id: string;
  name: string;
  source: RuleSource;
  yaml_content: string;
  source_filename?: string;
  created_at: string;
  expires_at: string;
}

// ========================================
// 润色相关
// ========================================

/** 润色修改类型 */
export type PolishChangeType =
  | "grammar" | "wording" | "punctuation" | "structure" | "academic"
  | "typo"              // 错别字（LLM 检出）
  | "rule_punctuation"  // 标点问题（规则检出）
  | "rule_space"        // 空格问题（规则检出）
  | "rule_fullwidth";   // 全半角问题（规则检出）

/** 单个修改点的详情 */
export interface ChangeDetail {
  type: PolishChangeType;
  original: string;
  revised: string;
  explanation: string;
}

/** 单条润色建议 */
export interface PolishSuggestion {
  paragraph_index: number;
  original_text: string;
  polished_text: string;
  change_type: PolishChangeType;
  changes: ChangeDetail[];
  explanation: string;
  confidence: number;
  semantic_warning: boolean;
  semantic_warning_text: string | null;
  /** 建议来源: "llm"(LLM润色) | "rule"(规则引擎) */
  source?: "llm" | "rule";
}

/** 润色统计信息 */
export interface PolishSummary {
  total_paragraphs: number;
  polishable_paragraphs: number;
  skipped_paragraphs: number;
  modified_paragraphs: number;
  total_suggestions: number;
  by_type: Record<string, number>;
  semantic_warnings: number;
  /** 按来源分组统计 */
  by_source?: { rule: number; llm: number };
}

/** 完整润色报告 */
export interface PolishReport {
  session_id: string;
  filename: string;
  suggestions: PolishSuggestion[];
  summary: PolishSummary;
  polished_at: string;
}

/** 应用润色修改请求 */
export interface PolishApplyRequest {
  session_id: string;
  accepted_indices: number[];
}

/** 应用润色修改响应 */
export interface PolishApplyResponse {
  session_id: string;
  filename: string;
  applied_count: number;
  download_url: string;
}

/** 润色 session 状态检查响应 */
export interface PolishSessionStatus {
  exists: boolean;
  applied: boolean;
  filename: string;
}

// ========================================
// 润色结果缓存（IndexedDB）
// ========================================

/** 润色结果缓存记录 */
export interface PolishHistoryRecord {
  /** session_id 作为主键 */
  id: string;
  filename: string;
  suggestions: PolishSuggestion[];
  summary: PolishSummary | null;
  /** 用户的接受/拒绝决策 (index → boolean) */
  decisions: Record<number, boolean>;
  /** 润色完成时间 */
  created_at: number;
  /** 缓存过期时间 */
  expires_at: number;
  /** 是否已应用（下载过） */
  applied: boolean;
}
