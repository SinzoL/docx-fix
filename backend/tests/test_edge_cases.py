"""
边缘情况测试

测试内容：
- 损坏文件处理
- 大文件拒绝
- 并发 session 隔离
- 空 session 处理
"""

import os
import sys
import io

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


@pytest.mark.asyncio
class TestEdgeCases:
    """边缘情况测试"""

    async def test_corrupted_docx_returns_422(self, client, corrupted_file):
        """损坏的 .docx 文件应返回 422"""
        with open(corrupted_file, "rb") as f:
            resp = await client.post(
                "/api/check",
                files={"file": ("bad.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                data={"rule_id": "default"},
            )
        assert resp.status_code == 422
        data = resp.json()
        assert "detail" in data

    async def test_empty_filename(self, client):
        """空文件名应返回 400 或 422"""
        content = b"some fake content"
        resp = await client.post(
            "/api/check",
            files={"file": ("", io.BytesIO(content), "application/octet-stream")},
            data={"rule_id": "default"},
        )
        # 空文件名不以 .docx 结尾，FastAPI 可能返回 400 或 422
        assert resp.status_code in (400, 422)

    async def test_session_isolation(self, client, sample_docx):
        """不同 session 应互不影响"""
        # Session A 上传检查
        with open(sample_docx, "rb") as f:
            resp_a = await client.post(
                "/api/check",
                files={"file": ("a.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                data={"rule_id": "default", "session_id": "session-a"},
            )
        assert resp_a.status_code == 200

        # Session B 上传检查
        with open(sample_docx, "rb") as f:
            resp_b = await client.post(
                "/api/check",
                files={"file": ("b.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                data={"rule_id": "default", "session_id": "session-b"},
            )
        assert resp_b.status_code == 200

        # Session A 修复
        fix_a = await client.post(
            "/api/fix",
            json={"session_id": "session-a", "rule_id": "default"},
        )
        assert fix_a.status_code == 200
        assert fix_a.json()["filename"] == "a.docx"

        # Session B 修复
        fix_b = await client.post(
            "/api/fix",
            json={"session_id": "session-b", "rule_id": "default"},
        )
        assert fix_b.status_code == 200
        assert fix_b.json()["filename"] == "b.docx"

    async def test_fix_without_check_returns_404(self, client):
        """未上传文件直接修复应返回 404"""
        resp = await client.post(
            "/api/fix",
            json={"session_id": "no-such-session", "rule_id": "default"},
        )
        assert resp.status_code == 404

    async def test_download_without_fix_returns_404(self, client, sample_docx):
        """只上传未修复直接下载应返回 404"""
        with open(sample_docx, "rb") as f:
            await client.post(
                "/api/check",
                files={"file": ("test.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                data={"rule_id": "default", "session_id": "check-only-session"},
            )

        resp = await client.get("/api/fix/download?session_id=check-only-session")
        assert resp.status_code == 404

    async def test_fix_invalid_rule_returns_400(self, client, sample_docx):
        """修复时使用无效规则应返回 400"""
        with open(sample_docx, "rb") as f:
            await client.post(
                "/api/check",
                files={"file": ("test.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                data={"rule_id": "default", "session_id": "rule-test-session"},
            )

        resp = await client.post(
            "/api/fix",
            json={"session_id": "rule-test-session", "rule_id": "nonexistent_rule"},
        )
        assert resp.status_code == 400
