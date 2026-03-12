"""
检查引擎封装服务

封装现有 checker.py 中的 DocxChecker，
提供 Web API 友好的接口（JSON 序列化）。

006-text-conventions: 集成文本排版习惯检查，
新增 check_layer / id / ai_review / text_convention_meta 字段。
"""

from datetime import datetime, timezone

from api.schemas import (
    CheckItemResult,
    CheckReport,
    CheckSummary,
    CheckStatus,
    TextConventionMeta,
    DisputedItem,
)
from engine.checker import DocxChecker
from engine.checker.text_convention_checker import TextIssue


def run_check(
    filepath: str,
    rules_path: str,
    session_id: str,
    filename: str,
    rule_id: str,
    rule_name: str,
) -> CheckReport:
    """执行格式检查并返回结构化的检查报告。

    Args:
        filepath: 上传文件的临时路径
        rules_path: 规则文件的绝对路径
        session_id: 会话 ID
        filename: 原始文件名
        rule_id: 规则 ID
        rule_name: 规则名称

    Returns:
        CheckReport 检查报告
    """
    checker = DocxChecker(filepath, rules_path)
    checker.run_all_checks()

    # 获取文本检查结果（由 run_all_checks 内部执行并保存）
    text_issues: list[TextIssue] = getattr(checker, '_text_issues', [])
    text_stats = getattr(checker, '_text_stats', None)

    # 序列化格式检查结果（标记 check_layer: "format"）
    items: list[CheckItemResult] = []
    for r in checker.results:
        items.append(
            CheckItemResult(
                category=r.category,
                item=r.item,
                status=CheckStatus(r.status),
                message=r.message,
                location=r.location,
                fixable=r.fixable,
                check_layer=r.check_layer,
            )
        )

    # 为文本习惯检查项生成 ID 并补充争议项数据
    disputed_items: list[DisputedItem] = []
    tc_id_counter = 0

    # 注意：确定性文本检查项已经通过 checker.add_result() 注册在 checker.results 中了
    # 我们需要遍历 items 并为 text_convention 类型的项分配 ID
    for item in items:
        if item.check_layer == "text_convention":
            tc_id_counter += 1
            item.id = f"tc-{tc_id_counter:03d}"

    # 处理争议项（这些没有注册到 checker.results 中，需要单独添加）
    for issue in text_issues:
        if issue.is_disputed:
            tc_id_counter += 1
            tc_id = f"tc-{tc_id_counter:03d}"

            # 争议项也添加到 items 中
            items.append(
                CheckItemResult(
                    category=issue.category,
                    item=issue.item,
                    status=CheckStatus(issue.status),
                    message=issue.message,
                    location=f"段落{issue.paragraph_index + 1} [{_source_label(issue.paragraph_source)}]"
                            + (f", 第{issue.char_offset + 1}字符" if issue.char_offset > 0 else ""),
                    fixable=issue.fixable,
                    id=tc_id,
                    check_layer="text_convention",
                    ai_review=None,
                )
            )

            # 添加到争议项列表
            disputed_items.append(
                DisputedItem(
                    id=tc_id,
                    rule=issue.rule,
                    paragraph_index=issue.paragraph_index,
                    paragraph_source=issue.paragraph_source,
                    text_context=issue.context,
                    issue_description=issue.message,
                )
            )

    # 计算汇总
    pass_count = sum(1 for item in items if item.status == CheckStatus.PASS)
    warn_count = sum(1 for item in items if item.status == CheckStatus.WARN)
    fail_count = sum(1 for item in items if item.status == CheckStatus.FAIL)
    fixable_count = sum(1 for item in items if item.fixable)

    summary = CheckSummary(
        pass_count=pass_count,
        warn=warn_count,
        fail=fail_count,
        fixable=fixable_count,
    )

    # 构建 text_convention_meta（仅在有文本检查结果时）
    text_convention_meta = None
    has_tc_items = any(item.check_layer == "text_convention" for item in items)
    if has_tc_items and text_stats:
        text_convention_meta = TextConventionMeta(
            disputed_items=disputed_items,
            document_stats={
                "total_paragraphs": text_stats.total_paragraphs,
                "cjk_spaced_count": text_stats.cjk_spaced_count,
                "cjk_unspaced_count": text_stats.cjk_unspaced_count,
            },
        )

    return CheckReport(
        session_id=session_id,
        filename=filename,
        rule_id=rule_id,
        rule_name=rule_name,
        items=items,
        summary=summary,
        checked_at=datetime.now(timezone.utc).isoformat(),
        text_convention_meta=text_convention_meta,
    )


def _source_label(source: str) -> str:
    """来源标记翻译"""
    labels = {"body": "主体", "table": "表格", "footnote": "脚注", "endnote": "尾注"}
    return labels.get(source, source)
