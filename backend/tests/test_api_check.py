"""
API 集成测试 — 检查相关端点

测试内容：
- GET /api/rules — 规则列表
- POST /api/check — 文件上传与检查
- 错误处理（文件类型、大小、规则校验、损坏文件）
"""

import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


@pytest.mark.asyncio
class TestGetRulesAPI:
    """测试 GET /api/rules"""

    async def test_list_rules_success(self, client):
        """应返回 200 和规则列表"""
        resp = await client.get("/api/rules")
        assert resp.status_code == 200
        data = resp.json()
        assert "rules" in data
        assert len(data["rules"]) > 0

    async def test_list_rules_has_default(self, client):
        """应包含默认规则"""
        resp = await client.get("/api/rules")
        data = resp.json()
        default_rules = [r for r in data["rules"] if r["id"] == "default"]
        assert len(default_rules) == 1
        assert default_rules[0]["is_default"] is True

    async def test_list_rules_default_first(self, client):
        """默认规则应排在首位"""
        resp = await client.get("/api/rules")
        data = resp.json()
        if len(data["rules"]) > 0:
            assert data["rules"][0]["is_default"] is True


@pytest.mark.asyncio
class TestCheckFileAPI:
    """测试 POST /api/check"""

    async def test_check_success(self, client, sample_docx):
        """正常上传检查应返回 200"""
        with open(sample_docx, "rb") as f:
            resp = await client.post(
                "/api/check",
                files={"file": ("test.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                data={"rule_id": "default", "session_id": "api-test-001"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == "api-test-001"
        assert data["filename"] == "test.docx"
        assert "items" in data
        assert "summary" in data

    async def test_check_invalid_file_type(self, client, non_docx_file):
        """非 .docx 文件应返回 400"""
        with open(non_docx_file, "rb") as f:
            resp = await client.post(
                "/api/check",
                files={"file": ("test.txt", f, "text/plain")},
                data={"rule_id": "default"},
            )
        assert resp.status_code == 400

    async def test_check_invalid_rule(self, client, sample_docx):
        """无效规则 ID 应返回 400"""
        with open(sample_docx, "rb") as f:
            resp = await client.post(
                "/api/check",
                files={"file": ("test.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                data={"rule_id": "nonexistent_xyz"},
            )
        assert resp.status_code == 400

    async def test_check_corrupted_file(self, client, corrupted_file):
        """损坏文件应返回 422"""
        with open(corrupted_file, "rb") as f:
            resp = await client.post(
                "/api/check",
                files={"file": ("corrupted.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                data={"rule_id": "default"},
            )
        assert resp.status_code == 422

    async def test_check_generates_session_id(self, client, sample_docx):
        """未提供 session_id 时应自动生成"""
        with open(sample_docx, "rb") as f:
            resp = await client.post(
                "/api/check",
                files={"file": ("test.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                data={"rule_id": "default"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"]  # 非空


@pytest.mark.asyncio
class TestCheckThenFixAPI:
    """测试 POST /api/check → POST /api/fix → GET /api/fix/download 完整流程"""

    async def test_full_flow(self, client, sample_docx):
        """完整流程：上传检查 → 修复 → 下载"""
        # 1. 上传检查
        with open(sample_docx, "rb") as f:
            check_resp = await client.post(
                "/api/check",
                files={"file": ("test.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                data={"rule_id": "default", "session_id": "flow-test-001"},
            )
        assert check_resp.status_code == 200

        # 2. 执行修复
        fix_resp = await client.post(
            "/api/fix",
            json={"session_id": "flow-test-001", "rule_id": "default"},
        )
        assert fix_resp.status_code == 200
        fix_data = fix_resp.json()
        assert "before_summary" in fix_data
        assert "after_summary" in fix_data

        # 3. 下载修复文件
        dl_resp = await client.get("/api/fix/download?session_id=flow-test-001")
        assert dl_resp.status_code == 200
        assert len(dl_resp.content) > 0


@pytest.mark.asyncio
class TestFixAPI:
    """测试 POST /api/fix 错误处理"""

    async def test_fix_session_not_found(self, client):
        """不存在的 session 应返回 404"""
        resp = await client.post(
            "/api/fix",
            json={"session_id": "nonexistent-session", "rule_id": "default"},
        )
        assert resp.status_code == 404

    async def test_download_session_not_found(self, client):
        """不存在的 session 下载应返回 404"""
        resp = await client.get("/api/fix/download?session_id=nonexistent-session")
        assert resp.status_code == 404
