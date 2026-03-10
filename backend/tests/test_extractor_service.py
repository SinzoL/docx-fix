"""
extractor_service 单元测试

测试内容：
- 正常提取流程
- YAML 内容生成
- 摘要构建
- 自定义名称传递
- 损坏文件异常处理
"""

import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from services.extractor_service import run_extract  # noqa: E402


class TestRunExtract:
    """测试 run_extract 函数"""

    def test_returns_dict_with_required_keys(self, sample_docx):
        """应返回包含 rules/yaml_content/summary 的字典"""
        result = run_extract(filepath=sample_docx)
        assert isinstance(result, dict)
        assert "rules" in result
        assert "yaml_content" in result
        assert "summary" in result

    def test_rules_is_dict(self, sample_docx):
        """rules 应为字典类型"""
        result = run_extract(filepath=sample_docx)
        assert isinstance(result["rules"], dict)

    def test_yaml_content_is_nonempty_string(self, sample_docx):
        """yaml_content 应为非空字符串"""
        result = run_extract(filepath=sample_docx)
        assert isinstance(result["yaml_content"], str)
        assert len(result["yaml_content"]) > 0

    def test_yaml_content_contains_meta_section(self, sample_docx):
        """yaml_content 应包含 meta 元信息节"""
        result = run_extract(filepath=sample_docx)
        yaml_content = result["yaml_content"]
        assert "meta" in yaml_content

    def test_yaml_content_contains_section_markers(self, sample_docx):
        """yaml_content 应包含分节注释标记"""
        result = run_extract(filepath=sample_docx)
        yaml_content = result["yaml_content"]
        # 分节注释中的分隔线
        assert "=" * 28 in yaml_content

    def test_summary_has_required_fields(self, sample_docx):
        """summary 应包含所有必要字段"""
        result = run_extract(filepath=sample_docx)
        summary = result["summary"]
        assert isinstance(summary, dict)
        assert "has_page_setup" in summary
        assert "has_header_footer" in summary
        assert "has_numbering" in summary
        assert "has_structure" in summary
        assert "has_special_checks" in summary
        assert "has_heading_style_fix" in summary
        assert "style_count" in summary
        assert "extracted_at" in summary

    def test_summary_field_types(self, sample_docx):
        """summary 字段类型应正确"""
        result = run_extract(filepath=sample_docx)
        summary = result["summary"]
        assert isinstance(summary["has_page_setup"], bool)
        assert isinstance(summary["has_header_footer"], bool)
        assert isinstance(summary["has_numbering"], bool)
        assert isinstance(summary["has_structure"], bool)
        assert isinstance(summary["has_special_checks"], bool)
        assert isinstance(summary["has_heading_style_fix"], bool)
        assert isinstance(summary["style_count"], int)
        assert isinstance(summary["extracted_at"], str)

    def test_sample_docx_detects_page_setup(self, sample_docx):
        """sample_docx 应能检测到页面设置"""
        result = run_extract(filepath=sample_docx)
        summary = result["summary"]
        # 任何有效 docx 至少有页面设置
        assert summary["has_page_setup"] is True

    def test_page_setup_info_when_detected(self, sample_docx):
        """检测到页面设置时应包含 page_setup_info"""
        result = run_extract(filepath=sample_docx)
        summary = result["summary"]
        if summary["has_page_setup"]:
            assert "page_setup_info" in summary
            psi = summary["page_setup_info"]
            assert "paper_size" in psi
            assert "width_cm" in psi
            assert "height_cm" in psi

    def test_extract_with_custom_name(self, sample_docx):
        """传入自定义名称应反映在 yaml_content 中"""
        result = run_extract(filepath=sample_docx, name="我的测试规则")
        yaml_content = result["yaml_content"]
        assert "我的测试规则" in yaml_content

    def test_extract_with_description(self, sample_docx):
        """传入描述参数不应报错"""
        result = run_extract(
            filepath=sample_docx,
            name="测试规则",
            description="这是一个测试描述"
        )
        assert isinstance(result, dict)
        assert len(result["yaml_content"]) > 0

    def test_style_names_in_summary(self, sample_docx):
        """当检测到样式时，summary 应包含 style_names 列表"""
        result = run_extract(filepath=sample_docx)
        summary = result["summary"]
        if summary["style_count"] > 0:
            assert "style_names" in summary
            assert isinstance(summary["style_names"], list)
            assert len(summary["style_names"]) == summary["style_count"]

    def test_corrupted_file_raises(self, corrupted_file):
        """损坏文件应抛出异常"""
        with pytest.raises(Exception):
            run_extract(filepath=corrupted_file)

    def test_good_docx_extract(self, good_docx):
        """格式良好的 docx 也能正常提取"""
        result = run_extract(filepath=good_docx)
        assert isinstance(result, dict)
        assert len(result["yaml_content"]) > 0
        assert result["summary"]["has_page_setup"] is True
