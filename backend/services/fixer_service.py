"""
修复引擎封装服务

封装现有 fixer.py 中的 DocxFixer，
提供修复执行和修复前后对比功能。
"""

import os
import shutil
from datetime import datetime, timezone

from api.schemas import (
    FixReport,
    FixItemResult,
    ChangedItem,
    CheckStatus,
)
from scripts.checker import DocxChecker
from scripts.fixer import DocxFixer


def run_fix(
    filepath: str,
    rules_path: str,
    session_id: str,
    filename: str,
    rule_name: str,
) -> FixReport:
    """执行格式修复并返回修复前后对比报告。

    流程：
    1. 先用 checker 检查一次（修复前基线）
    2. 复制文件为 _fixed 版本
    3. 在 _fixed 版本上运行 fixer
    4. 再用 checker 检查修复后的文件
    5. 对比修复前后的差异

    Args:
        filepath: 上传文件的临时路径
        rules_path: 规则文件的绝对路径
        session_id: 会话 ID
        filename: 原始文件名
        rule_name: 规则名称

    Returns:
        FixReport 修复报告
    """
    # 1. 修复前检查
    checker_before = DocxChecker(filepath, rules_path)
    checker_before.run_all_checks()

    before_summary = {
        "pass": sum(1 for r in checker_before.results if r.status == "PASS"),
        "warn": sum(1 for r in checker_before.results if r.status == "WARN"),
        "fail": sum(1 for r in checker_before.results if r.status == "FAIL"),
    }

    # 2. 复制文件用于修复
    base, ext = os.path.splitext(filepath)
    fixed_path = base + "_fixed" + ext
    shutil.copy2(filepath, fixed_path)

    # 3. 执行修复
    fixer = DocxFixer(fixed_path, rules_path)
    fixes = fixer.run_all_fixes(dry_run=False)

    # 序列化修复项
    fix_items = [
        FixItemResult(category=cat, description=desc)
        for cat, desc in fixes
    ]

    # 4. 修复后检查
    checker_after = DocxChecker(fixed_path, rules_path)
    checker_after.run_all_checks()

    after_summary = {
        "pass": sum(1 for r in checker_after.results if r.status == "PASS"),
        "warn": sum(1 for r in checker_after.results if r.status == "WARN"),
        "fail": sum(1 for r in checker_after.results if r.status == "FAIL"),
    }

    # 5. 计算变化项
    before_map = {}
    for r in checker_before.results:
        key = (r.category, r.item)
        before_map[key] = r

    changed_items = []
    for r in checker_after.results:
        key = (r.category, r.item)
        before_r = before_map.get(key)
        if before_r and before_r.status != r.status:
            changed_items.append(
                ChangedItem(
                    category=r.category,
                    item=r.item,
                    before_status=CheckStatus(before_r.status),
                    after_status=CheckStatus(r.status),
                    message=r.message,
                )
            )

    return FixReport(
        session_id=session_id,
        filename=filename,
        rule_name=rule_name,
        fix_items=fix_items,
        before_summary=before_summary,
        after_summary=after_summary,
        changed_items=changed_items,
        fixed_at=datetime.now(timezone.utc).isoformat(),
    )
