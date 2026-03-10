"""
AI Prompt 模板

为不同 LLM 调用场景定义 system prompt 和消息构建函数。
所有 prompt 设计原则：
1. 限定 AI 只回答文档格式相关问题
2. 输出使用通俗中文，避免技术术语
3. 保持简洁，控制 token 消耗
"""

from __future__ import annotations

import json


# ============================================================
# 1. 检查报告 AI 总结
# ============================================================

SUMMARIZE_SYSTEM_PROMPT = """你是一个 Word 文档格式检查助手。你的任务是将技术性的格式检查结果翻译为通俗易懂的中文修改建议。

规则：
- 使用简洁的中文，不超过 300 字
- 不要出现 XML 术语（如 outlineLvl、numId、abstractNum、spacing_line 等）
- 把技术单位翻译为常见说法（如"磅"→"号"、"spacing 300"→"1.25倍行距"等）
- 按问题严重程度排列：先说错误（FAIL），再说警告（WARN）
- 如果存在可自动修复的项，提示用户可以点击"一键修复"
- 如果全部通过，简短恭喜即可
- 使用 Markdown 格式（支持加粗、列表）
- 不要输出"以下是总结"之类的开头，直接给出内容"""


def build_summarize_messages(check_report: dict) -> list[dict]:
    """构建检查报告 AI 总结的消息列表。

    Args:
        check_report: CheckReport 的字典表示

    Returns:
        OpenAI 格式的 messages 列表
    """
    # 提取关键信息，减少 token 消耗
    summary = check_report.get("summary", {})
    items = check_report.get("items", [])

    # 只保留 FAIL 和 WARN 项（PASS 不需要总结）
    problems = [
        {
            "category": item["category"],
            "item": item["item"],
            "status": item["status"],
            "message": item["message"],
            "fixable": item.get("fixable", False),
        }
        for item in items
        if item["status"] in ("FAIL", "WARN")
    ]

    user_content = f"""文件名：{check_report.get("filename", "未知")}
使用规则：{check_report.get("rule_name", "未知")}

检查汇总：
- 通过：{summary.get("pass_count", 0)} 项
- 警告：{summary.get("warn", 0)} 项
- 错误：{summary.get("fail", 0)} 项
- 可自动修复：{summary.get("fixable", 0)} 项

问题详情：
{json.dumps(problems, ensure_ascii=False, indent=2) if problems else "无问题，全部通过！"}

请给出简洁的修改建议总结。"""

    return [
        {"role": "system", "content": SUMMARIZE_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


# ============================================================
# 2. 格式问答
# ============================================================

CHAT_SYSTEM_PROMPT = """你是一个专业的 Word 文档格式咨询助手。你只回答与文档格式相关的问题。

你的能力范围：
- 解释文档格式检查结果
- 解答字体、字号、行距、页边距、标题编号等格式问题
- 解释学校/机构的论文格式要求
- 给出具体的 Word 操作指导

规则：
- 使用通俗的中文回答
- 回答简洁明了，控制在 200 字以内
- 如果用户的问题与文档格式无关，礼貌拒绝并引导回格式话题
- 使用 Markdown 格式
- 如果当前有检查报告上下文，优先基于报告内容回答"""


def build_chat_messages(
    user_messages: list[dict],
    check_report: dict | None = None,
) -> list[dict]:
    """构建格式问答的消息列表。

    Args:
        user_messages: 用户对话历史 [{"role": "user/assistant", "content": "..."}]
        check_report: 可选的检查报告上下文

    Returns:
        OpenAI 格式的 messages 列表
    """
    messages: list[dict] = [
        {"role": "system", "content": CHAT_SYSTEM_PROMPT},
    ]

    # 如果有检查报告，作为上下文注入
    if check_report:
        summary = check_report.get("summary", {})
        items = check_report.get("items", [])
        problems = [
            f"[{item['status']}] {item['category']} - {item['item']}: {item['message']}"
            for item in items
            if item["status"] in ("FAIL", "WARN")
        ]
        context = f"""[当前文档检查上下文]
文件：{check_report.get("filename", "未知")}
规则：{check_report.get("rule_name", "未知")}
结果：通过 {summary.get("pass_count", 0)} / 警告 {summary.get("warn", 0)} / 错误 {summary.get("fail", 0)}
问题列表：
""" + "\n".join(problems[:20])  # 最多 20 条，控制 token

        messages.append({"role": "system", "content": context})

    # 添加对话历史
    for msg in user_messages:
        messages.append({
            "role": msg["role"],
            "content": msg["content"],
        })

    return messages


# ============================================================
# 3. 自然语言格式要求 → YAML 规则
# ============================================================

GENERATE_RULES_SYSTEM_PROMPT = """你是一个 Word 文档格式规则生成器。你的任务是将用户提供的自然语言格式要求转换为 YAML 规则配置文件。

输出格式必须与以下结构兼容：

```yaml
meta:
  name: "规则名称"
  version: "1.0"
  description: "规则描述"

page_setup:
  paper_size: "A4"
  width_cm: 21.0
  height_cm: 29.7
  margin_top_cm: 2.5
  margin_bottom_cm: 2.5
  margin_left_cm: 3.0
  margin_right_cm: 3.0

styles:
  Normal:
    description: "基础正文样式"
    paragraph:
      alignment: "both"          # left/center/right/both
      line_spacing: 300          # Word内部值，1.25倍=300, 单倍=240, 1.5倍=360, 2倍=480
      line_spacing_rule: "auto"  # auto/exact/atLeast
    character:
      font_ascii: "Times New Roman"    # 英文字体
      font_east_asia: "宋体"           # 中文字体
      font_hAnsi: "Times New Roman"    # 西文字体
      font_size_pt: 12.0              # 字号（磅值）

  Heading 1:
    description: "一级标题"
    paragraph:
      alignment: "center"
      outline_level: 0           # 大纲级别（0=一级, 1=二级, 2=三级）
      spacing_before_lines: 100  # 段前（100=1行）
      spacing_after_lines: 80
    character:
      font_east_asia: "黑体"
      font_size_pt: 18.0
```

常见中文字号对照：
- 初号=42pt, 小初=36pt, 一号=26pt, 小一=24pt
- 二号=22pt, 小二=18pt, 三号=16pt, 小三=15pt
- 四号=14pt, 小四=12pt, 五号=10.5pt, 小五=9pt

规则：
1. 只输出合法的 YAML，不要附加任何解释文字
2. 如果用户未指定某项，使用合理的默认值并在 description 中标注"[推断]"
3. 中文字体默认宋体，英文字体默认 Times New Roman
4. 行距"1.25倍"对应 line_spacing: 300, line_spacing_rule: "auto"
5. 行距"单倍"对应 line_spacing: 240
6. 行距"1.5倍"对应 line_spacing: 360
7. 行距"2倍"对应 line_spacing: 480
8. 首行缩进2字符对应 first_line_indent_chars: 200
9. alignment 使用英文值：left/center/right/both"""


def build_generate_rules_messages(
    text: str,
    name: str | None = None,
) -> list[dict]:
    """构建规则生成的消息列表。

    Args:
        text: 用户输入的自然语言格式要求
        name: 可选的规则名称

    Returns:
        OpenAI 格式的 messages 列表
    """
    user_content = f"""请将以下格式要求转换为 YAML 规则配置文件：

{text}"""

    if name:
        user_content += f"\n\n规则名称：{name}"

    return [
        {"role": "system", "content": GENERATE_RULES_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
