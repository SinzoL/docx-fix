"""
修复引擎封装服务

封装现有 fixer.py 中的 DocxFixer，
提供修复执行和修复前后对比功能。

006-text-conventions: 新增文本排版修复支持，
当 include_text_fix=True 时，在格式修复后叠加文本修复。
"""

import os
import shutil
import logging
import yaml
from datetime import datetime, timezone

from api.schemas import (
    FixReport,
    FixSummary,
    FixItemResult,
    ChangedItem,
    CheckItemResult,
    CheckStatus,
)
from scripts.checker import DocxChecker
from scripts.fixer import DocxFixer

logger = logging.getLogger(__name__)


def run_fix(
    filepath: str,
    rules_path: str,
    session_id: str,
    filename: str,
    rule_name: str,
    include_text_fix: bool = False,
) -> FixReport:
    """执行格式修复并返回修复前后对比报告。

    流程：
    1. 先用 checker 检查一次（修复前基线）
    2. 复制文件为 _fixed 版本
    3. 在 _fixed 版本上运行格式修复 (DocxFixer)
    4. 可选：在 _fixed 版本上叠加文本修复 (text_convention_fixer)
    5. 再用 checker 检查修复后的文件
    6. 对比修复前后的差异

    Args:
        filepath: 上传文件的临时路径
        rules_path: 规则文件的绝对路径
        session_id: 会话 ID
        filename: 原始文件名
        rule_name: 规则名称
        include_text_fix: 是否执行文本排版修复（默认 False）

    Returns:
        FixReport 修复报告
    """
    # 1. 修复前检查
    checker_before = DocxChecker(filepath, rules_path)
    checker_before.run_all_checks()

    before_summary = FixSummary(
        pass_count=sum(1 for r in checker_before.results if r.status == "PASS"),
        warn=sum(1 for r in checker_before.results if r.status == "WARN"),
        fail=sum(1 for r in checker_before.results if r.status == "FAIL"),
    )

    # 2. 复制文件用于修复
    base, ext = os.path.splitext(filepath)
    fixed_path = base + "_fixed" + ext
    shutil.copy2(filepath, fixed_path)

    # 3. 执行格式修复
    fixer = DocxFixer(fixed_path, rules_path)
    fixes = fixer.run_all_fixes(dry_run=False)

    # 序列化格式修复项
    fix_items = [
        FixItemResult(category=cat, description=desc, fix_layer="format")
        for cat, desc in fixes
    ]

    # 4. 可选：执行文本排版修复（在格式修复后的文件上叠加）
    if include_text_fix:
        try:
            from docx import Document
            from scripts.text_convention_fixer import run_text_convention_fixes

            # 读取规则
            with open(rules_path, 'r', encoding='utf-8') as f:
                rules = yaml.safe_load(f) or {}

            # 重新打开修复后的文档
            doc = Document(fixed_path)

            # 执行文本修复
            text_records = run_text_convention_fixes(doc, rules)

            if text_records:
                # 保存文档
                doc.save(fixed_path)

                # 添加文本修复项
                for record in text_records:
                    fix_items.append(
                        FixItemResult(
                            category=record.category,
                            description=record.description,
                            fix_layer="text_convention",
                        )
                    )

                logger.info(
                    f"文本排版修复完成: session_id={session_id}, "
                    f"修复 {len(text_records)} 项"
                )

        except Exception as e:
            # 文本修复失败不影响格式修复结果
            logger.warning(
                f"文本排版修复失败（不影响格式修复）: session_id={session_id}, "
                f"error={e}"
            )

    # 5. 修复后检查
    checker_after = DocxChecker(fixed_path, rules_path)
    checker_after.run_all_checks()

    after_summary = FixSummary(
        pass_count=sum(1 for r in checker_after.results if r.status == "PASS"),
        warn=sum(1 for r in checker_after.results if r.status == "WARN"),
        fail=sum(1 for r in checker_after.results if r.status == "FAIL"),
    )

    # 序列化修复后完整检查项（#1: 让前端能展示修复后完整报告）
    after_items = [
        CheckItemResult(
            category=r.category,
            item=r.item,
            status=CheckStatus(r.status),
            message=r.message,
            location=r.location,
            fixable=r.fixable,
            check_layer="format" if not r.category.startswith("通用·") else "text_convention",
        )
        for r in checker_after.results
    ]

    # 6. 计算变化项
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
        after_items=after_items,
    )
