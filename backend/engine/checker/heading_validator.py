"""
标题相关检查方法

从 checker.py 迁移而来，包含标题样式检查和文档结构检查。

所有函数接收 checker (DocxChecker) 实例作为参数，
通过 checker.add_result() 报告结果。
"""

import re

from engine.checker.base import CheckResult


def check_heading_styles(checker):
    """检查标题段落的样式是否正确"""
    structure = checker.rules.get('structure', {})
    heading_map = structure.get('heading_style_mapping', {})

    expected_styles = {}
    if heading_map:
        expected_styles[0] = heading_map.get('level_1', 'Heading 1')
        expected_styles[1] = heading_map.get('level_2', '一级节标题2.3')
        expected_styles[2] = heading_map.get('level_3', '二级节标题2.3.1')

    for i, para in enumerate(checker.doc.paragraphs):
        text = para.text.strip()
        if not text:
            continue

        style_name = para.style.name if para.style else "None"
        outline_lvl = checker._get_para_outline_level(para)

        # 跳过 TOC 条目
        if (style_name or "").lower().startswith('toc ') or style_name == '目录标题':
            continue

        # 检查标题段落的样式与大纲级别一致
        if outline_lvl < 3:  # 1-3级标题
            expected_style = expected_styles.get(outline_lvl)
            if expected_style and style_name != expected_style:
                # 也接受 Heading N（兼容性）
                if not (style_name == f"Heading {outline_lvl + 1}"):
                    checker.add_result("标题样式", f"段落{i}", CheckResult.WARN,
                                    f"\"{text[:40]}\" 样式={style_name}, "
                                    f"建议使用 \"{expected_style}\"",
                                    f"段落{i}", fixable=True)

        # 检查看起来像标题但不是标题的段落
        if outline_lvl >= 9 and style_name not in ('说明文字', 'Normal', '论文正文-首行缩进',
                                                     '表题注', '续表题注', '图题', '子图题', '续图题',
                                                     '表正文', '公式题注', '参考文献', '关键词'):
            if re.match(r'^\d+\.\d+', text) and len(text) < 80:
                if not (style_name or "").lower().startswith('toc'):
                    checker.add_result("标题样式", f"段落{i}", CheckResult.WARN,
                                    f"\"{text[:40]}\" 看起来像标题，但样式为 \"{style_name}\"(正文级别)",
                                    f"段落{i}")


def check_document_structure(checker):
    """检查必要的章节是否存在"""
    structure = checker.rules.get('structure', {})
    required = structure.get('required_chapters', [])

    # 收集所有一级标题
    h1_texts = []
    for para in checker.doc.paragraphs:
        if checker._get_para_outline_level(para) == 0:
            h1_texts.append(para.text.strip())

    for req in required:
        pattern = req['pattern']
        found = any(pattern in t for t in h1_texts)
        if found:
            checker.add_result("文档结构", f"章节 \"{pattern[:20]}\"", CheckResult.PASS, "已找到")
        else:
            checker.add_result("文档结构", f"章节 \"{pattern[:20]}\"", CheckResult.FAIL,
                            f"未找到包含 \"{pattern}\" 的一级标题")


def check_heading_hierarchy(checker):
    """检查标题层级连续性和深度限制

    功能：
    1. 验证标题层级不跳跃（如 H1 后不应直接出现 H3）
    2. 验证标题深度不超过配置的最大值
    3. 排除 non_chapter_styles 配置中的非章节标题

    规则配置路径: structure.heading_hierarchy
    """
    structure = checker.rules.get('structure', {})
    hierarchy_rules = structure.get('heading_hierarchy', {})

    # 如果未启用则跳过
    if not hierarchy_rules.get('enabled', False):
        return

    max_depth = hierarchy_rules.get('max_heading_depth', 4)
    non_chapter_styles = set(hierarchy_rules.get('non_chapter_styles', []))

    # 收集所有标题段落信息
    headings = []
    for i, para in enumerate(checker.doc.paragraphs):
        outline_level = checker._get_para_outline_level(para)
        if outline_level >= 9:  # 非标题段落
            continue

        text = para.text.strip()
        if not text:
            continue

        style_name = para.style.name if para.style else ""

        # 排除非章节标题样式
        if style_name in non_chapter_styles:
            continue

        headings.append({
            'para_index': i,
            'level': outline_level,  # 0-based: 0=H1, 1=H2, ...
            'text': text,
            'style_name': style_name,
        })

    # 无标题段落时直接返回（不报错）
    if not headings:
        return

    # 线性扫描验证层级连续性
    prev_level = None
    for heading in headings:
        level = heading['level']
        text = heading['text']
        para_idx = heading['para_index']

        # 检查层级跳跃：当前级别 > 前一级别 + 1
        if prev_level is not None and level > prev_level + 1:
            gap = level - prev_level
            checker.add_result(
                "标题层级", f"段落{para_idx}",
                CheckResult.FAIL,
                f"\"{text[:40]}\" (H{level + 1}) 标题层级跳跃: "
                f"从 H{prev_level + 1} 直接到 H{level + 1}，跳过了 {gap - 1} 级",
                f"段落{para_idx}",
            )

        # 检查深度限制
        if level + 1 > max_depth:
            checker.add_result(
                "标题层级", f"段落{para_idx}",
                CheckResult.WARN,
                f"\"{text[:40]}\" (H{level + 1}) 超过最大标题深度 {max_depth}",
                f"段落{para_idx}",
            )

        prev_level = level
