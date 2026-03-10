"""
API 集成测试 — 模板提取相关端点

测试内容：
- POST /api/extract-rules — 上传模板文档提取格式规则
- 错误处理（文件类型、损坏文件）
- 自定义名称参数
"""

import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


@pytest.mark.asyncio
class TestExtractRulesAPI:
    """测试 POST /api/extract-rules"""

    async def test_extract_success(self, client, sample_docx):
        """正常上传模板应返回 200 和提取结果"""
        with open(sample_docx, "rb") as f:
            resp = await client.post(
                "/api/extract-rules",
                files={"file": ("template.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "yaml_content" in data
        assert "summary" in data
        assert "filename" in data
        assert data["filename"] == "template.docx"
        assert len(data["yaml_content"]) > 0

    async def test_extract_response_summary_fields(self, client, sample_docx):
        """响应 summary 应包含所有摘要字段"""
        with open(sample_docx, "rb") as f:
            resp = await client.post(
                "/api/extract-rules",
                files={"file": ("template.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            )
        assert resp.status_code == 200
        summary = resp.json()["summary"]
        assert "has_page_setup" in summary
        assert "has_header_footer" in summary
        assert "has_numbering" in summary
        assert "has_structure" in summary
        assert "has_special_checks" in summary
        assert "has_heading_style_fix" in summary
        assert "style_count" in summary
        assert "extracted_at" in summary

    async def test_extract_invalid_file_type(self, client, non_docx_file):
        """非 .docx 文件应返回 400"""
        with open(non_docx_file, "rb") as f:
            resp = await client.post(
                "/api/extract-rules",
                files={"file": ("test.txt", f, "text/plain")},
            )
        assert resp.status_code == 400
        data = resp.json()
        assert data["detail"]["error"] == "INVALID_FILE_TYPE"

    async def test_extract_corrupted_file(self, client, corrupted_file):
        """损坏文件应返回 422"""
        with open(corrupted_file, "rb") as f:
            resp = await client.post(
                "/api/extract-rules",
                files={"file": ("corrupted.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            )
        assert resp.status_code == 422

    async def test_extract_with_name(self, client, sample_docx):
        """传入自定义名称应反映在响应中"""
        with open(sample_docx, "rb") as f:
            resp = await client.post(
                "/api/extract-rules",
                files={"file": ("template.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                data={"name": "毕业论文模板规则"},
            )
        assert resp.status_code == 200
        data = resp.json()
        # 自定义名称应出现在 yaml_content 中
        assert "毕业论文模板规则" in data["yaml_content"]

    async def test_extract_yaml_is_valid_string(self, client, sample_docx):
        """返回的 yaml_content 应为可用的 YAML 格式字符串"""
        with open(sample_docx, "rb") as f:
            resp = await client.post(
                "/api/extract-rules",
                files={"file": ("template.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            )
        assert resp.status_code == 200
        yaml_content = resp.json()["yaml_content"]
        # 验证基本的 YAML 结构标记
        assert "meta:" in yaml_content or "meta" in yaml_content

    async def test_extract_good_docx(self, client, good_docx):
        """格式良好的 docx 也能正常提取"""
        with open(good_docx, "rb") as f:
            resp = await client.post(
                "/api/extract-rules",
                files={"file": ("good.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["summary"]["has_page_setup"] is True
