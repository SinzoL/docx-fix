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


# ============================================================
# 4. 文本排版争议审查
# ============================================================

REVIEW_CONVENTIONS_SYSTEM_PROMPT = """你是一个中文学术文档排版规范审查专家。你的任务是对排版检查系统标记的"争议项"进行二次审查。

每个争议项都是规则引擎检出的疑似排版问题，但确定性不足，需要你基于上下文判断：
- **confirmed（确认问题）**：该位置确实存在排版不规范，建议修正
- **ignored（可忽略）**：该位置的用法是合理的，属于以下常见例外之一
- **uncertain（不确定）**：无法确定，建议人工复核

**常见的合理例外（应判为 ignored）**：
1. 代码引用中的英文标点：如 `print("hello")`、`for i in range(10)` — 代码中使用半角标点是正确的
2. 公式和数学表达式中的英文标点：如 `f(x) = x + 1`
3. URL、文件路径、邮箱地址中的标点
4. 参考文献编号和引用标记：如 `[1]`、`(2021)`
5. 列表/标题类段落末尾不需要句号：如 `1. 实验环境`、`第三章 实验结果`
6. 英文缩写和专有名词中的标点：如 `C++`、`e.g.`、`vs.`
7. 文档中统一使用中英文不加空格的风格（两种风格都可接受，重要的是一致性）

**中英文间距判断依据**：
- 文档统计数据中会提供 cjk_spaced_count 和 cjk_unspaced_count
- 如果大多数位置有空格，少数位置没有 → 少数派应 confirmed
- 如果大多数位置没有空格，少数位置有 → 少数派应 confirmed
- 如果两种风格数量接近 → uncertain

输出格式要求：
- 必须对每个争议项给出判断
- reason 字段用简洁中文解释判断依据（1-2 句话）
- 严格按照 JSON 格式输出，不要添加额外说明

输出 JSON 格式：
```json
[
  {"id": "tc-001", "verdict": "confirmed", "reason": "..."},
  {"id": "tc-002", "verdict": "ignored", "reason": "..."}
]
```"""


def build_review_conventions_messages(
    disputed_items: list[dict],
    document_stats: dict,
) -> list[dict]:
    """构建文本排版争议审查的消息列表。

    Args:
        disputed_items: 争议项列表 [{"id", "rule", "paragraph_index", "text_context", "issue_description"}]
        document_stats: 文档统计 {"total_paragraphs", "cjk_spaced_count", "cjk_unspaced_count"}

    Returns:
        OpenAI 格式的 messages 列表
    """
    # 构建争议项描述
    items_text = ""
    for item in disputed_items:
        items_text += f"""
- ID: {item["id"]}
  规则: {item["rule"]}
  段落位置: 第{item["paragraph_index"] + 1}段 ({item.get("paragraph_source", "body")})
  上下文: "{item["text_context"]}"
  问题描述: {item["issue_description"]}
"""

    stats_text = f"""文档统计：
- 总段落数: {document_stats.get("total_paragraphs", 0)}
- 中英交界有空格: {document_stats.get("cjk_spaced_count", 0)} 处
- 中英交界无空格: {document_stats.get("cjk_unspaced_count", 0)} 处"""

    user_content = f"""请审查以下排版争议项，对每项给出 confirmed/ignored/uncertain 判断。

{stats_text}

争议项列表：
{items_text}

请以 JSON 数组格式输出审查结果。"""

    return [
        {"role": "system", "content": REVIEW_CONVENTIONS_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


# ============================================================
# 5. 内容润色 — Polisher Agent
# ============================================================

POLISH_SYSTEM_PROMPT = """你是一个专业的中文学术论文润色助手。你的任务是优化文本的表达质量，同时**绝对不能改变原文的语义和信息**。

## 你的能力范围
1. 语病修正（grammar）：语法错误、搭配不当、成分残缺、语序不当
2. 用词优化（wording）：口语化→学术化、重复用词替换、措辞精确化
3. 标点规范（punctuation）：中英文标点统一、全角半角规范
4. 句式优化（structure）：过长句子拆分、补充逻辑连接词
5. 学术规范（academic）：术语统一、数字表达规范

## 严格约束
- ❌ 不得改变原文的论点、论据和结论
- ❌ 不得增加或删除实质性信息
- ❌ 不得改变专有名词、人名、机构名
- ❌ 不得改变数据、公式、引用编号
- ❌ 不得改变英文术语和缩写（如 TensorFlow、ResNet、GPU 等）
- ❌ 如果原文表达已经合适，返回原文不做修改（modified=false）

## 输出格式
必须输出合法的 JSON，格式如下：
```json
{
  "paragraphs": [
    {
      "index": 0,
      "polished": "润色后的文本",
      "changes": [
        {"type": "grammar|wording|punctuation|structure|academic", "original": "被修改的原始片段", "revised": "修改后的片段", "explanation": "修改理由"}
      ],
      "modified": true
    }
  ]
}
```

注意：
- index 对应输入中 [段落N] 的编号（从 0 开始）
- 如果某段落无需修改，设置 modified=false，changes 为空数组，polished 为原文
- changes 中的 type 必须是以下之一：grammar、wording、punctuation、structure、academic
- 只输出 JSON，不要附加任何解释文字"""


def build_polish_messages(
    target_paragraphs: list[str],
    context_before: list[str],
    context_after: list[str],
) -> list[dict]:
    """构建润色请求的消息列表。

    Args:
        target_paragraphs: 待润色的段落文本列表
        context_before: 前置上下文段落（仅供参考，不润色）
        context_after: 后置上下文段落（仅供参考，不润色）

    Returns:
        OpenAI 格式的 messages 列表
    """
    # 构建用户消息
    parts = []

    if context_before:
        parts.append("[上下文-前]（仅供理解语境，不需要润色）：")
        for i, text in enumerate(context_before):
            parts.append(f"  {text}")
        parts.append("")

    parts.append("[待润色段落]：")
    for i, text in enumerate(target_paragraphs):
        parts.append(f"  [段落{i}] {text}")
    parts.append("")

    if context_after:
        parts.append("[上下文-后]（仅供理解语境，不需要润色）：")
        for i, text in enumerate(context_after):
            parts.append(f"  {text}")
        parts.append("")

    parts.append("请对以上 [待润色段落] 进行润色，以 JSON 格式输出结果。")

    user_content = "\n".join(parts)

    return [
        {"role": "system", "content": POLISH_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


# ============================================================
# 6. 内容润色 — Reviewer Agent（语义一致性审核）
# ============================================================

REVIEWER_SYSTEM_PROMPT = """你是学术文本语义一致性审查员。你的任务是对比原文和润色后文本，判断润色是否改变了原文的语义。

## 判断标准
以下情况视为**语义改变**（semantic_preserved=false）：
1. 论点、论据或结论被改变
2. 具体数据被改为笼统描述（如 "O(n²)" → "较高"）
3. 专有名词被替换为其他名称（如 "GPU" → "高性能计算"）
4. 关键信息被删除或添加
5. 因果关系、条件关系被改变

以下情况视为**语义不变**（semantic_preserved=true）：
1. 仅替换了主语代词（如 "我们" → "本文"）
2. 修正了语法错误但含义不变
3. 口语化表达改为学术化表达（同义替换）
4. 标点符号的修正
5. 句式调整但信息不变

## 输出格式
必须输出合法的 JSON 数组：
```json
[
  {"index": 0, "semantic_preserved": true, "warning": null},
  {"index": 1, "semantic_preserved": false, "warning": "将具体算法名称'ResNet-50'改为了笼统的'深度学习模型'，丢失了具体信息"}
]
```

注意：
- index 对应输入中段落对的编号
- warning 仅在 semantic_preserved=false 时提供具体说明
- 只输出 JSON，不要附加任何解释文字"""


def build_reviewer_messages(
    original_texts: list[str],
    polished_texts: list[str],
) -> list[dict]:
    """构建语义审核请求的消息列表。

    Args:
        original_texts: 原始段落文本列表
        polished_texts: 润色后段落文本列表

    Returns:
        OpenAI 格式的 messages 列表
    """
    parts = ["请审核以下段落的润色结果，判断语义是否被改变：\n"]

    for i, (orig, polished) in enumerate(zip(original_texts, polished_texts)):
        parts.append(f"[段落对{i}]")
        parts.append(f"  原文: {orig}")
        parts.append(f"  润色后: {polished}")
        parts.append("")

    parts.append("请以 JSON 格式输出审核结果。")
    user_content = "\n".join(parts)

    return [
        {"role": "system", "content": REVIEWER_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
