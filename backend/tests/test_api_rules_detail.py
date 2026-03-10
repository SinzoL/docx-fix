"""
API 集成测试 — 规则详情端点

测试内容：
- GET /api/rules/{rule_id} — 正常获取、规则不存在
"""

import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


@pytest.mark.asyncio
class TestGetRuleDetailAPI:
    """测试 GET /api/rules/{rule_id}"""

    async def test_get_default_rule_detail(self, client):
        """应返回默认规则详情"""
        resp = await client.get("/api/rules/default")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "default"
        assert data["name"]
        assert "sections" in data
        assert isinstance(data["sections"], list)

    async def test_rule_detail_has_sections(self, client):
        """规则详情应包含 sections"""
        resp = await client.get("/api/rules/default")
        data = resp.json()
        # 默认规则至少有页面设置和样式 section
        if len(data["sections"]) > 0:
            section = data["sections"][0]
            assert "name" in section
            assert "rules" in section
            if len(section["rules"]) > 0:
                rule = section["rules"][0]
                assert "item" in rule
                assert "value" in rule

    async def test_nonexistent_rule_returns_404(self, client):
        """不存在的规则应返回 404"""
        resp = await client.get("/api/rules/nonexistent_xyz")
        assert resp.status_code == 404

    async def test_rule_detail_response_structure(self, client):
        """响应结构应包含 id, name, description, sections"""
        resp = await client.get("/api/rules/default")
        data = resp.json()
        assert "id" in data
        assert "name" in data
        assert "description" in data
        assert "sections" in data
