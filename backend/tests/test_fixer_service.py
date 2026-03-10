"""
fixer_service 单元测试

测试内容：
- 修复流程
- 修复前后对比
- changed_items 计算
- 异常处理
"""

import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from services.fixer_service import run_fix  # noqa: E402
from api.schemas import FixReport  # noqa: E402


class TestRunFix:
    """测试 run_fix 函数"""

    def test_returns_fix_report(self, sample_docx, default_rule_path):
        """应返回 FixReport 类型"""
        report = run_fix(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="fix-session-001",
            filename="test_sample.docx",
            rule_name="通用默认检查",
        )
        assert isinstance(report, FixReport)

    def test_report_has_correct_metadata(self, sample_docx, default_rule_path):
        """报告应包含正确的元数据"""
        report = run_fix(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="fix-session-002",
            filename="test_sample.docx",
            rule_name="通用默认检查",
        )
        assert report.session_id == "fix-session-002"
        assert report.filename == "test_sample.docx"
        assert report.rule_name == "通用默认检查"
        assert report.fixed_at

    def test_report_has_summaries(self, sample_docx, default_rule_path):
        """报告应包含修复前后 summary"""
        report = run_fix(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="fix-session-003",
            filename="test_sample.docx",
            rule_name="通用默认检查",
        )
        assert "pass" in report.before_summary
        assert "warn" in report.before_summary
        assert "fail" in report.before_summary
        assert "pass" in report.after_summary
        assert "warn" in report.after_summary
        assert "fail" in report.after_summary

    def test_fix_reduces_failures(self, sample_docx, default_rule_path):
        """修复应减少失败项数量（或至少不增加）"""
        report = run_fix(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="fix-session-004",
            filename="test_sample.docx",
            rule_name="通用默认检查",
        )
        assert report.after_summary["fail"] <= report.before_summary["fail"]

    def test_fix_creates_fixed_file(self, sample_docx, default_rule_path):
        """修复应创建 _fixed.docx 文件"""
        run_fix(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="fix-session-005",
            filename="test_sample.docx",
            rule_name="通用默认检查",
        )
        base, ext = os.path.splitext(sample_docx)
        fixed_path = base + "_fixed" + ext
        assert os.path.exists(fixed_path)

    def test_changed_items_valid(self, sample_docx, default_rule_path):
        """changed_items 中的状态应不同"""
        report = run_fix(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="fix-session-006",
            filename="test_sample.docx",
            rule_name="通用默认检查",
        )
        for item in report.changed_items:
            assert item.before_status != item.after_status
            assert item.category
            assert item.item

    def test_corrupted_file_raises(self, corrupted_file, default_rule_path):
        """损坏文件应抛出异常"""
        with pytest.raises(Exception):
            run_fix(
                filepath=corrupted_file,
                rules_path=default_rule_path,
                session_id="fix-session-007",
                filename="corrupted.docx",
                rule_name="通用默认检查",
            )
