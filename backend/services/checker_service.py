"""
检查引擎封装服务

封装现有 checker.py 中的 DocxChecker，
提供 Web API 友好的接口（JSON 序列化）。
"""

import os
import sys
from datetime import datetime, timezone

from api.schemas import CheckItemResult, CheckReport, CheckSummary, CheckStatus

# 将 backend/scripts/ 加入 sys.path，以便导入 checker.py
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BACKEND_DIR, "scripts")
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)


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
    from checker import DocxChecker

    checker = DocxChecker(filepath, rules_path)
    checker.run_all_checks()

    # 序列化检查结果
    items = []
    for r in checker.results:
        items.append(
            CheckItemResult(
                category=r.category,
                item=r.item,
                status=CheckStatus(r.status),
                message=r.message,
                location=r.location,
                fixable=r.fixable,
            )
        )

    # 计算汇总
    pass_count = sum(1 for r in checker.results if r.status == "PASS")
    warn_count = sum(1 for r in checker.results if r.status == "WARN")
    fail_count = sum(1 for r in checker.results if r.status == "FAIL")
    fixable_count = sum(1 for r in checker.results if r.fixable)

    summary = CheckSummary(
        pass_count=pass_count,
        warn=warn_count,
        fail=fail_count,
        fixable=fixable_count,
    )

    return CheckReport(
        session_id=session_id,
        filename=filename,
        rule_id=rule_id,
        rule_name=rule_name,
        items=items,
        summary=summary,
        checked_at=datetime.now(timezone.utc).isoformat(),
    )
