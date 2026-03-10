"""
checker_service 单元测试

测试内容：
- 正常检查流程
- 结果序列化
- summary 计算
- 异常处理
"""

import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from services.checker_service import run_check  # noqa: E402
from api.schemas import CheckReport, CheckStatus  # noqa: E402


class TestRunCheck:
    """测试 run_check 函数"""

    def test_returns_check_report(self, sample_docx, default_rule_path):
        """应返回 CheckReport 类型"""
        report = run_check(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="test-session-001",
            filename="test_sample.docx",
            rule_id="default",
            rule_name="通用默认检查",
        )
        assert isinstance(report, CheckReport)

    def test_report_has_correct_metadata(self, sample_docx, default_rule_path):
        """报告应包含正确的元数据"""
        report = run_check(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="test-session-002",
            filename="test_sample.docx",
            rule_id="default",
            rule_name="通用默认检查",
        )
        assert report.session_id == "test-session-002"
        assert report.filename == "test_sample.docx"
        assert report.rule_id == "default"
        assert report.rule_name == "通用默认检查"
        assert report.checked_at  # 非空

    def test_report_has_items(self, sample_docx, default_rule_path):
        """报告应包含检查项"""
        report = run_check(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="test-session-003",
            filename="test_sample.docx",
            rule_id="default",
            rule_name="通用默认检查",
        )
        assert len(report.items) > 0

    def test_items_have_valid_status(self, sample_docx, default_rule_path):
        """检查项状态应为有效值"""
        report = run_check(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="test-session-004",
            filename="test_sample.docx",
            rule_id="default",
            rule_name="通用默认检查",
        )
        for item in report.items:
            assert item.status in (CheckStatus.PASS, CheckStatus.WARN, CheckStatus.FAIL)

    def test_items_have_required_fields(self, sample_docx, default_rule_path):
        """检查项应有必要字段"""
        report = run_check(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="test-session-005",
            filename="test_sample.docx",
            rule_id="default",
            rule_name="通用默认检查",
        )
        for item in report.items:
            assert item.category
            assert item.item
            assert item.message
            assert isinstance(item.fixable, bool)

    def test_summary_counts_match_items(self, sample_docx, default_rule_path):
        """summary 计数应与 items 一致"""
        report = run_check(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="test-session-006",
            filename="test_sample.docx",
            rule_id="default",
            rule_name="通用默认检查",
        )
        pass_count = sum(1 for i in report.items if i.status == CheckStatus.PASS)
        warn_count = sum(1 for i in report.items if i.status == CheckStatus.WARN)
        fail_count = sum(1 for i in report.items if i.status == CheckStatus.FAIL)
        fixable_count = sum(1 for i in report.items if i.fixable)

        assert report.summary.pass_count == pass_count
        assert report.summary.warn == warn_count
        assert report.summary.fail == fail_count
        assert report.summary.fixable == fixable_count

    def test_sample_docx_has_failures(self, sample_docx, default_rule_path):
        """样本文件应有检查失败项（因为字体故意设置错误）"""
        report = run_check(
            filepath=sample_docx,
            rules_path=default_rule_path,
            session_id="test-session-007",
            filename="test_sample.docx",
            rule_id="default",
            rule_name="通用默认检查",
        )
        # 至少有 FAIL 或 WARN
        total_issues = report.summary.fail + report.summary.warn
        assert total_issues > 0

    def test_corrupted_file_raises(self, corrupted_file, default_rule_path):
        """损坏文件应抛出异常"""
        with pytest.raises(Exception):
            run_check(
                filepath=corrupted_file,
                rules_path=default_rule_path,
                session_id="test-session-008",
                filename="corrupted.docx",
                rule_id="default",
                rule_name="通用默认检查",
            )
