"""
规则扫描服务

扫描 rules/ 目录，解析 YAML 规则文件的 meta 信息，
返回可用规则列表（默认规则排首位）。
"""

from __future__ import annotations

import os

import yaml

from api.schemas import RuleInfo

# backend 目录
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES_DIR = os.path.join(BACKEND_DIR, "rules")
DEFAULT_RULE_ID = "default"


def get_rules_list() -> list[RuleInfo]:
    """扫描 rules/ 目录，返回所有可用规则的元信息列表。

    默认规则（default.yaml）排在首位。
    YAML 语法错误的文件会被跳过并标记为不可用。
    """
    rules = []

    if not os.path.exists(RULES_DIR):
        return rules

    for filename in os.listdir(RULES_DIR):
        if not (filename.endswith(".yaml") or filename.endswith(".yml")):
            continue

        filepath = os.path.join(RULES_DIR, filename)
        rule_id = os.path.splitext(filename)[0]

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)

            meta = data.get("meta", {}) if data else {}
            rules.append(
                RuleInfo(
                    id=rule_id,
                    filename=filename,
                    name=meta.get("name", rule_id),
                    description=meta.get("description", ""),
                    is_default=(rule_id == DEFAULT_RULE_ID),
                )
            )
        except yaml.YAMLError:
            # YAML 语法错误，跳过该文件
            continue
        except Exception:
            continue

    # 默认规则排首位
    rules.sort(key=lambda r: (not r.is_default, r.id))

    return rules


def get_rule_path(rule_id: str) -> str | None:
    """根据 rule_id 获取规则文件的绝对路径。

    Returns:
        规则文件路径，如果不存在则返回 None
    """
    for ext in (".yaml", ".yml"):
        path = os.path.join(RULES_DIR, rule_id + ext)
        if os.path.exists(path):
            return path
    return None


def get_rule_detail(rule_id: str) -> dict | None:
    """获取规则文件的完整内容（用于规则详情展示）。

    Returns:
        解析后的 YAML 字典，如果不存在或解析失败则返回 None
    """
    path = get_rule_path(rule_id)
    if path is None:
        return None

    try:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception:
        return None
