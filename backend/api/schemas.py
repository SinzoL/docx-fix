"""
Pydantic 请求/响应模型

对应 data-model.md 和 contracts/api.md 中定义的数据结构。
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel


class CheckStatus(str, Enum):
    """检查状态枚举"""
    PASS = "PASS"
    WARN = "WARN"
    FAIL = "FAIL"


# ========================================
# 规则相关
# ========================================

class RuleInfo(BaseModel):
    """规则文件的元信息"""
    id: str
    filename: str
    name: str
    description: str
    is_default: bool
    is_preset: bool = False


class RuleDetailItem(BaseModel):
    """规则详情中的单条规则"""
    item: str
    value: str


class RuleDetailSection(BaseModel):
    """规则详情中的分组"""
    name: str
    rules: list[RuleDetailItem]


class RuleDetailResponse(BaseModel):
    """GET /api/rules/{rule_id} 响应"""
    id: str
    name: str
    description: str
    sections: list[RuleDetailSection]


class RulesListResponse(BaseModel):
    """GET /api/rules 响应"""
    rules: list[RuleInfo]


# ========================================
# 检查相关
# ========================================

class AiReviewResult(BaseModel):
    """LLM 审查结果"""
    verdict: str  # "confirmed" | "ignored" | "uncertain"
    reason: str = ""


class CheckItemResult(BaseModel):
    """单条检查结果"""
    category: str
    item: str
    status: CheckStatus
    message: str
    location: Optional[str] = None
    fixable: bool = False
    # 006-text-conventions 新增
    id: Optional[str] = None  # 文本习惯检查项 ID（如 "tc-001"），用于异步 AI 审查匹配
    check_layer: str = "format"  # "format" | "text_convention"
    ai_review: Optional[AiReviewResult] = None  # LLM 审查结果（仅争议项在审查后有）


class CheckSummary(BaseModel):
    """检查汇总"""
    pass_count: int  # 使用 pass_count 因为 pass 是 Python 关键字
    warn: int
    fail: int
    fixable: int

    class Config:
        # 允许在 JSON 中使用 "pass" 作为字段名
        populate_by_name = True


class DisputedItem(BaseModel):
    """争议项（传给 LLM 审查的数据）"""
    id: str
    rule: str
    paragraph_index: int
    paragraph_source: str = "body"
    text_context: str
    issue_description: str


class TextConventionMeta(BaseModel):
    """文本习惯检查元数据"""
    disputed_items: list[DisputedItem] = []
    document_stats: dict = {}  # {total_paragraphs, cjk_spaced_count, cjk_unspaced_count}


class CheckReport(BaseModel):
    """POST /api/check 响应 — 完整检查报告"""
    session_id: str
    filename: str
    rule_id: str
    rule_name: str
    items: list[CheckItemResult]
    summary: CheckSummary
    checked_at: str
    # 006-text-conventions 新增
    text_convention_meta: Optional[TextConventionMeta] = None


# ========================================
# 修复相关
# ========================================

class RecheckRequest(BaseModel):
    """POST /api/recheck 请求体 — 使用已上传的文件切换规则重新检查"""
    session_id: str
    rule_id: str
    custom_rules_yaml: Optional[str] = None


class FixRequest(BaseModel):
    """POST /api/fix 请求体"""
    session_id: str
    rule_id: str
    custom_rules_yaml: Optional[str] = None
    include_text_fix: bool = False  # 是否执行文本排版修复（默认关闭）


class FixItemResult(BaseModel):
    """单条修复结果"""
    category: str
    description: str
    fix_layer: str = "format"  # "format" | "text_convention"


class ChangedItem(BaseModel):
    """修复前后变化的检查项"""
    category: str
    item: str
    before_status: CheckStatus
    after_status: CheckStatus
    message: str


class FixSummary(BaseModel):
    """修复前后检查汇总（强类型）"""
    pass_count: int
    warn: int
    fail: int


class FixReport(BaseModel):
    """POST /api/fix 响应 — 修复结果预览"""
    session_id: str
    filename: str
    rule_name: str
    fix_items: list[FixItemResult]
    before_summary: FixSummary
    after_summary: FixSummary
    changed_items: list[ChangedItem]
    fixed_at: str
    after_items: list[CheckItemResult] = []  # 修复后的完整检查项列表


# ========================================
# 错误响应
# ========================================

class ErrorResponse(BaseModel):
    """统一错误响应格式"""
    error: str
    message: str


# ========================================
# AI 相关
# ========================================

class AiSummarizeRequest(BaseModel):
    """POST /api/ai/summarize 请求体"""
    session_id: str = ""
    check_report: dict  # CheckReport 的完整 JSON


class AiChatMessage(BaseModel):
    """对话消息"""
    role: str  # "user" | "assistant"
    content: str


class AiChatRequest(BaseModel):
    """POST /api/ai/chat 请求体"""
    session_id: str = ""
    messages: list[AiChatMessage]
    check_report: Optional[dict] = None  # 可选的检查报告上下文


class AiGenerateRulesRequest(BaseModel):
    """POST /api/ai/generate-rules 请求体"""
    text: str  # 自然语言格式要求
    name: Optional[str] = None  # 规则名称


class AiGenerateRulesResponse(BaseModel):
    """POST /api/ai/generate-rules 响应"""
    yaml_content: str  # 生成的 YAML 内容
    warnings: list[str] = []  # 推断项提醒


# ========================================
# AI 文本排版争议审查
# ========================================

class AiReviewConventionsRequest(BaseModel):
    """POST /api/ai/review-conventions 请求体"""
    session_id: str = ""
    disputed_items: list[DisputedItem]
    document_stats: dict = {}  # {total_paragraphs, cjk_spaced_count, cjk_unspaced_count}


class AiReviewItemResult(BaseModel):
    """单个争议项的审查结果"""
    id: str
    verdict: str  # "confirmed" | "ignored" | "uncertain"
    reason: str = ""


class AiReviewConventionsResponse(BaseModel):
    """POST /api/ai/review-conventions 响应"""
    reviews: list[AiReviewItemResult]


# ========================================
# 模板提取相关
# ========================================

class ExtractRulesPageSetup(BaseModel):
    """提取摘要中的页面设置信息"""
    paper_size: Optional[str] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None


class ExtractRulesSummary(BaseModel):
    """模板提取结果摘要"""
    has_page_setup: bool = False
    has_header_footer: bool = False
    has_numbering: bool = False
    has_structure: bool = False
    has_special_checks: bool = False
    has_heading_style_fix: bool = False
    style_count: int = 0
    style_names: list[str] = []
    page_setup_info: Optional[ExtractRulesPageSetup] = None
    extracted_at: str = ""


class ExtractRulesResponse(BaseModel):
    """POST /api/extract-rules 响应"""
    yaml_content: str  # 格式化的 YAML 规则字符串（前端可直接展示/编辑/保存到 localStorage）
    summary: ExtractRulesSummary  # 提取结果摘要
    filename: str  # 源模板文件名


# ========================================
# 润色相关
# ========================================

class ChangeDetailSchema(BaseModel):
    """单个修改点的详情"""
    type: str  # "grammar" | "wording" | "punctuation" | "structure" | "academic" | "typo" | "rule_punctuation" | "rule_space" | "rule_fullwidth"
    original: str
    revised: str
    explanation: str


class PolishSuggestionSchema(BaseModel):
    """单条润色建议"""
    paragraph_index: int
    original_text: str
    polished_text: str
    change_type: str  # "grammar" | "wording" | "punctuation" | "structure" | "academic" | "typo" | "rule_punctuation" | "rule_space" | "rule_fullwidth"
    changes: list[ChangeDetailSchema]
    explanation: str
    confidence: float
    semantic_warning: bool = False
    semantic_warning_text: Optional[str] = None
    source: str = "llm"  # "llm" | "rule"


class PolishSummarySchema(BaseModel):
    """润色统计信息"""
    total_paragraphs: int
    polishable_paragraphs: int
    skipped_paragraphs: int
    modified_paragraphs: int
    total_suggestions: int
    by_type: dict[str, int]
    semantic_warnings: int
    by_source: Optional[dict[str, int]] = None  # {"rule": N, "llm": N}


class PolishReportSchema(BaseModel):
    """完整润色报告"""
    session_id: str
    filename: str
    suggestions: list[PolishSuggestionSchema]
    summary: PolishSummarySchema
    polished_at: str


class PolishApplyRequestSchema(BaseModel):
    """应用润色修改请求"""
    session_id: str
    accepted_indices: list[int]


class PolishApplyResponseSchema(BaseModel):
    """应用润色修改响应"""
    session_id: str
    filename: str
    applied_count: int
    download_url: str


class PolishSessionStatusSchema(BaseModel):
    """GET /api/polish/session/{session_id}/status 响应"""
    exists: bool
    applied: bool = False
    filename: str = ""
