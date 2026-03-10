"""
规则扫描服务

扫描 rules/ 目录，解析 YAML 规则文件的 meta 信息，
返回可用规则列表（默认规则排首位）。
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path

import yaml

from api.schemas import RuleInfo
from config import RULES_DIR

logger = logging.getLogger(__name__)

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
        except yaml.YAMLError as e:
            # YAML 语法错误，跳过该文件
            logger.warning(f"规则文件 YAML 解析失败: {filename}, error={e}")
            continue
        except Exception as e:
            logger.warning(f"规则文件读取失败: {filename}, error={e}")
            continue

    # 默认规则排首位
    rules.sort(key=lambda r: (not r.is_default, r.id))

    return rules


def get_rule_path(rule_id: str) -> str | None:
    """根据 rule_id 获取规则文件的绝对路径。

    对 rule_id 做安全校验，防止路径穿越攻击。

    Returns:
        规则文件路径，如果不存在则返回 None
    """
    # 安全校验：rule_id 只允许字母、数字、下划线、连字符
    if not re.match(r"^[a-zA-Z0-9_\-]+$", rule_id):
        return None

    for ext in (".yaml", ".yml"):
        path = os.path.join(RULES_DIR, rule_id + ext)
        # 二次防御：确保解析后的路径在 RULES_DIR 下
        resolved = Path(path).resolve()
        if not str(resolved).startswith(str(Path(RULES_DIR).resolve())):
            return None
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
    except Exception as e:
        logger.error(f"规则文件解析失败: rule_id={rule_id}, path={path}, error={e}")
        return None
