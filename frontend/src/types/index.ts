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
export interface CheckItemResult {
  category: string;
  item: string;
  status: CheckStatus;
  message: string;
  location: string | null;
  fixable: boolean;
}

export interface CheckSummary {
  pass_count: number;
  warn: number;
  fail: number;
  fixable: number;
}

export interface CheckReport {
  session_id: string;
  filename: string;
  rule_id: string;
  rule_name: string;
  items: CheckItemResult[];
  summary: CheckSummary;
  checked_at: string;
}

// ========================================
// 修复相关
// ========================================
export interface FixItemResult {
  category: string;
  description: string;
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
  | "DOWNLOADED";

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
