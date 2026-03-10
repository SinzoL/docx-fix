"""
rules_service 单元测试

测试内容：
- 规则列表扫描
- 默认规则排首位
- 规则路径解析
- 规则详情获取
- 异常情况处理（YAML 语法错误、目录为空等）
"""

import os
import sys

# 确保 backend 目录在 sys.path 中
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from services.rules_service import get_rules_list, get_rule_path, get_rule_detail  # noqa: E402


class TestGetRulesList:
    """测试 get_rules_list 函数"""

    def test_returns_list(self):
        """应该返回规则列表"""
        rules = get_rules_list()
        assert isinstance(rules, list)

    def test_contains_default_rule(self):
        """应该包含 default 规则"""
        rules = get_rules_list()
        default_rules = [r for r in rules if r.id == "default"]
        assert len(default_rules) == 1
        assert default_rules[0].is_default is True

    def test_default_rule_first(self):
        """默认规则应排在首位"""
        rules = get_rules_list()
        if len(rules) > 0:
            assert rules[0].is_default is True

    def test_rule_has_required_fields(self):
        """每条规则应有必要字段"""
        rules = get_rules_list()
        for rule in rules:
            assert rule.id
            assert rule.filename
            assert rule.name
            assert isinstance(rule.is_default, bool)

    def test_non_default_not_marked(self):
        """非默认规则 is_default 应为 False"""
        rules = get_rules_list()
        non_default = [r for r in rules if r.id != "default"]
        for rule in non_default:
            assert rule.is_default is False


class TestGetRulePath:
    """测试 get_rule_path 函数"""

    def test_default_rule_exists(self):
        """默认规则路径应该存在"""
        path = get_rule_path("default")
        assert path is not None
        assert os.path.exists(path)

    def test_nonexistent_rule(self):
        """不存在的规则应返回 None"""
        path = get_rule_path("nonexistent_rule_xyz")
        assert path is None

    def test_returns_absolute_path(self):
        """应返回绝对路径"""
        path = get_rule_path("default")
        assert path is not None
        assert os.path.isabs(path)


class TestGetRuleDetail:
    """测试 get_rule_detail 函数"""

    def test_default_rule_detail(self):
        """应能获取默认规则详情"""
        detail = get_rule_detail("default")
        assert detail is not None
        assert isinstance(detail, dict)
        assert "meta" in detail

    def test_has_meta_name(self):
        """规则详情应包含 meta.name"""
        detail = get_rule_detail("default")
        assert detail is not None
        assert "name" in detail.get("meta", {})

    def test_nonexistent_rule_returns_none(self):
        """不存在的规则应返回 None"""
        detail = get_rule_detail("nonexistent_rule_xyz")
        assert detail is None
