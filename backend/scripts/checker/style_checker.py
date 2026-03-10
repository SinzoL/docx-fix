"""
样式相关检查方法

从 checker.py 迁移而来，包含样式定义检查、段落格式检查、
模板说明文字检查、字体一致性检查和图表标题检查。

所有函数接收 checker (DocxChecker) 实例作为参数，
通过 checker.add_result() 报告结果。
"""

import re

from scripts.checker.base import NSMAP, W, CheckResult, fonts_match


def _get_style_xml_info(checker, style, inherit=True):
    """从样式 XML 中提取格式信息。

    Args:
        checker: DocxChecker 实例
        style: python-docx 的 Style 对象
        inherit: 是否沿 basedOn 链向上查找缺失属性（默认 True）
    """
    info = {}
    elem = style.element
    pPr = elem.find('.//w:pPr', NSMAP)
    rPr = elem.find('.//w:rPr', NSMAP)

    if pPr is not None:
        # 对齐
        jc = pPr.find('w:jc', NSMAP)
        if jc is not None:
            info['alignment'] = jc.get(f'{{{W}}}val')

        # 行距
        spacing = pPr.find('w:spacing', NSMAP)
        if spacing is not None:
            for attr in ['before', 'after', 'line', 'lineRule', 'beforeLines', 'afterLines']:
                v = spacing.get(f'{{{W}}}{attr}')
                if v is not None:
                    info[f'spacing_{attr}'] = v

        # 缩进
        ind = pPr.find('w:ind', NSMAP)
        if ind is not None:
            for attr in ['firstLine', 'firstLineChars', 'left', 'right', 'hanging']:
                v = ind.get(f'{{{W}}}{attr}')
                if v is not None:
                    info[f'indent_{attr}'] = v

        # 大纲级别
        outlineLvl = pPr.find('w:outlineLvl', NSMAP)
        if outlineLvl is not None:
            info['outlineLevel'] = int(outlineLvl.get(f'{{{W}}}val'))

    if rPr is not None:
        rFonts = rPr.find('w:rFonts', NSMAP)
        if rFonts is not None:
            for attr in ['ascii', 'eastAsia', 'hAnsi']:
                v = rFonts.get(f'{{{W}}}{attr}')
                if v is not None:
                    info[f'font_{attr}'] = v

        sz = rPr.find('w:sz', NSMAP)
        if sz is not None:
            info['fontSize_half_pt'] = int(sz.get(f'{{{W}}}val'))

        b = rPr.find('w:b', NSMAP)
        if b is not None:
            val = b.get(f'{{{W}}}val', 'true')
            info['bold'] = val not in ('0', 'false')

    # 沿 basedOn 链继承缺失属性
    if inherit:
        parent_style = _get_parent_style(checker, style)
        if parent_style is not None:
            parent_info = _get_style_xml_info(checker, parent_style, inherit=True)
            for key, val in parent_info.items():
                if key not in info:
                    info[key] = val

    return info


def _get_parent_style(checker, style):
    """获取样式的 basedOn 父样式"""
    based_on = style.element.find('w:basedOn', NSMAP)
    if based_on is None:
        return None
    parent_id = based_on.get(f'{{{W}}}val')
    if not parent_id:
        return None
    for s in checker.doc.styles:
        if s.style_id == parent_id:
            return s
    return None


def check_style_definitions(checker):
    """检查文档中样式定义是否与规则匹配"""
    style_rules = checker.rules.get('styles', {})

    for style_name, rules in style_rules.items():
        if rules.get('check_type') == 'content_match':
            continue  # 封面等特殊处理
        if rules.get('should_not_exist'):
            continue  # 说明文字等

        # 查找文档中的样式
        found_style = None
        for style in checker.doc.styles:
            if style.name == style_name:
                found_style = style
                break

        if found_style is None:
            checker.add_result("样式定义", style_name, CheckResult.WARN,
                            f"文档中未找到样式 \"{style_name}\"")
            continue

        actual = _get_style_xml_info(checker, found_style)

        # 检查段落格式
        para_rules = rules.get('paragraph', {})
        char_rules = rules.get('character', {})

        # 大纲级别
        if 'outline_level' in para_rules:
            expected_lvl = para_rules['outline_level']
            actual_lvl = actual.get('outlineLevel')
            if actual_lvl is None or actual_lvl != expected_lvl:
                checker.add_result("样式定义", f"{style_name} 大纲级别", CheckResult.FAIL,
                                f"当前={actual_lvl}, 要求={expected_lvl}", fixable=True)
            else:
                checker.add_result("样式定义", f"{style_name} 大纲级别", CheckResult.PASS,
                                f"级别 {expected_lvl + 1}")

        # 对齐方式
        if 'alignment' in para_rules:
            expected_align = para_rules['alignment']
            actual_align = actual.get('alignment', 'left')
            if actual_align != expected_align:
                checker.add_result("样式定义", f"{style_name} 对齐", CheckResult.FAIL,
                                f"当前={actual_align}, 要求={expected_align}", fixable=True)

        # 行距
        if 'line_spacing' in para_rules:
            expected_ls = str(para_rules['line_spacing'])
            actual_ls = actual.get('spacing_line')
            if actual_ls and actual_ls != expected_ls:
                checker.add_result("样式定义", f"{style_name} 行距", CheckResult.WARN,
                                f"当前={actual_ls}, 要求={expected_ls}", fixable=True)

        # 字体
        font_map = {
            'font_ascii': 'font_ascii',
            'font_east_asia': 'font_eastAsia',
            'font_hAnsi': 'font_hAnsi',
        }
        for rule_key, actual_key in font_map.items():
            if rule_key in char_rules:
                expected_font = char_rules[rule_key]
                actual_font = actual.get(actual_key)
                if actual_font and not fonts_match(actual_font, expected_font):
                    checker.add_result("样式定义", f"{style_name} 字体({rule_key})", CheckResult.FAIL,
                                    f"当前={actual_font}, 要求={expected_font}", fixable=True)

        # 字号
        if 'font_size_pt' in char_rules:
            expected_pt = char_rules['font_size_pt']
            expected_half = int(expected_pt * 2)
            actual_half = actual.get('fontSize_half_pt')
            if actual_half and actual_half != expected_half:
                checker.add_result("样式定义", f"{style_name} 字号", CheckResult.FAIL,
                                f"当前={actual_half/2}磅, 要求={expected_pt}磅", fixable=True)


def check_paragraph_formatting(checker):
    """检查段落级别的格式（字体、字号等）

    使用 PropertyResolver 进行完整的 OOXML 属性解析优先级链：
    Run 直接格式 → 段落样式 rPr → basedOn 链 → docDefaults → 内置默认

    检查消息中融入属性来源标注，帮助用户定位问题根源。
    """
    from scripts.checker.property_resolver import PropertySource

    style_rules = checker.rules.get('styles', {})
    resolver = checker.resolver

    # 统计各样式下的格式异常
    issues_by_style = {}

    for i, para in enumerate(checker.doc.paragraphs):
        text = para.text.strip()
        if not text:
            continue

        style_name = para.style.name if para.style else "None"

        # 跳过 TOC 条目、说明文字和封面段落
        if (style_name or "").lower().startswith('toc ') or style_name == '说明文字':
            continue
        if checker._is_cover_page_paragraph(para):
            continue

        rules = style_rules.get(style_name)
        if not rules:
            continue

        char_rules = rules.get('character', {})
        if not char_rules:
            continue

        # 检查 Run 级别的字体和字号（使用 PropertyResolver 解析完整优先级链）
        for _j, run in enumerate(para.runs):
            rt = run.text
            if not rt or not rt.strip():
                continue

            # 使用 PropertyResolver 解析 Run 的所有最终生效属性
            resolved = resolver.resolve_run_properties(run, para)

            # 字号检查
            if 'font_size_pt' in char_rules:
                prop = resolved.get('fontSize_half_pt')
                if prop is not None:
                    actual_pt = prop.value / 2
                    expected_pt = char_rules['font_size_pt']
                    if abs(actual_pt - expected_pt) > 0.5:
                        key = f"{style_name}_字号"
                        if key not in issues_by_style:
                            issues_by_style[key] = []
                        # 使用来源标注生成消息
                        msg = resolver.format_source_message(
                            prop, "字号",
                            f"{actual_pt}磅", f"{expected_pt}磅"
                        )
                        is_direct = prop.source == PropertySource.RUN_DIRECT
                        issues_by_style[key].append(
                            (i, f"\"{rt[:20]}\" {msg}", is_direct))

            # 英文字体检查（font_ascii）
            if 'font_ascii' in char_rules:
                prop = resolved.get('font_ascii')
                if prop is not None:
                    expected = char_rules['font_ascii']
                    if not fonts_match(prop.value, expected):
                        key = f"{style_name}_英文字体"
                        if key not in issues_by_style:
                            issues_by_style[key] = []
                        msg = resolver.format_source_message(
                            prop, "英文字体",
                            prop.value, expected
                        )
                        is_direct = prop.source == PropertySource.RUN_DIRECT
                        issues_by_style[key].append(
                            (i, f"\"{rt[:20]}\" {msg}", is_direct))

            # 中文字体检查（font_eastAsia）
            if 'font_east_asia' in char_rules:
                prop = resolved.get('font_eastAsia')
                if prop is not None:
                    expected_ea = char_rules['font_east_asia']
                    if not fonts_match(prop.value, expected_ea):
                        key = f"{style_name}_中文字体"
                        if key not in issues_by_style:
                            issues_by_style[key] = []
                        msg = resolver.format_source_message(
                            prop, "中文字体",
                            prop.value, expected_ea
                        )
                        is_direct = prop.source == PropertySource.RUN_DIRECT
                        issues_by_style[key].append(
                            (i, f"\"{rt[:20]}\" {msg}", is_direct))

    # 汇总输出
    for key, issues in issues_by_style.items():
        fixable = True  # 段落格式问题均可修复

        if len(issues) <= 3:
            for para_idx, msg, _is_direct in issues:
                checker.add_result("段落格式", key, CheckResult.FAIL, msg, f"段落{para_idx}", fixable=fixable)
        else:
            # 太多就汇总
            checker.add_result("段落格式", key, CheckResult.FAIL,
                            f"共 {len(issues)} 处不一致 (首例: {issues[0][1]})", fixable=fixable)


def check_template_instructions(checker):
    """检查是否残留模板说明文字。

    区分两种情况：
    1. 真正的模板说明文字（红色字体）→ 警告：未删除模板说明
    2. 被错误设置为"说明文字"样式的正文段落（非红色）→ 错误：样式错误，可自动修复
    """
    special = checker.rules.get('special_checks', {})
    check = special.get('template_instructions_check', {})
    if not check.get('enabled'):
        return

    style_name = check.get('style_name', '说明文字')
    template_paras = []  # 真正的模板说明（红色）
    wrong_style_paras = []  # 错误样式的正文段落

    for i, para in enumerate(checker.doc.paragraphs):
        if not (para.style and para.style.name == style_name and para.text.strip()):
            continue

        # 判断是否为红色字体
        is_red = False
        for run in para.runs:
            if run.font.color and run.font.color.rgb:
                rgb = str(run.font.color.rgb)
                if rgb.upper() in ('FF0000', 'CC0000', 'FF3333'):
                    is_red = True
                    break

        if is_red:
            template_paras.append((i, para.text.strip()[:50]))
        else:
            wrong_style_paras.append((i, para.text.strip()[:50]))

    if template_paras:
        checker.add_result("特殊检查", "模板说明文字", CheckResult.WARN,
                        f"发现 {len(template_paras)} 段未删除的模板说明文字(红色)")
        for idx, text in template_paras[:5]:
            checker.add_result("特殊检查", f"  说明文字-段落{idx}", CheckResult.WARN,
                            f"\"{text}\"", f"段落{idx}")

    if wrong_style_paras:
        checker.add_result("特殊检查", "说明文字样式误用", CheckResult.FAIL,
                        f"发现 {len(wrong_style_paras)} 段正文被错误设置为\"说明文字\"样式",
                        fixable=True)
        for idx, text in wrong_style_paras[:5]:
            checker.add_result("特殊检查", f"  误用-段落{idx}", CheckResult.FAIL,
                            f"\"{text}\" 应改为正文样式", f"段落{idx}", fixable=True)

    if not template_paras and not wrong_style_paras:
        checker.add_result("特殊检查", "模板说明文字", CheckResult.PASS, "无残留模板说明")


def check_font_consistency(checker):
    """检查正文和标题字体一致性"""
    special = checker.rules.get('special_checks', {})

    for check_key in ('body_font_consistency', 'heading_font_consistency'):
        check = special.get(check_key, {})
        if not check.get('enabled'):
            continue

        target_styles = check.get('target_styles', [])
        exp_cn = check.get('expected_chinese_font')
        exp_en = check.get('expected_english_font')
        desc = check.get('description', check_key)

        cn_issues = 0
        en_issues = 0

        for para in checker.doc.paragraphs:
            if not para.style or para.style.name not in target_styles:
                continue
            if not para.text.strip():
                continue
            # 跳过封面段落
            if checker._is_cover_page_paragraph(para):
                continue

            for run in para.runs:
                if not run.text.strip():
                    continue

                # 英文字体
                if exp_en and run.font.name and not fonts_match(run.font.name, exp_en):
                    en_issues += 1

                # 中文字体
                if exp_cn:
                    rPr = run._element.find('.//w:rPr', NSMAP)
                    if rPr is not None:
                        rFonts = rPr.find('w:rFonts', NSMAP)
                        if rFonts is not None:
                            ea = rFonts.get(f'{{{W}}}eastAsia')
                            if ea and not fonts_match(ea, exp_cn):
                                cn_issues += 1

        if cn_issues == 0 and en_issues == 0:
            checker.add_result("字体一致性", desc, CheckResult.PASS,
                            f"中文={exp_cn or '-'}, 英文={exp_en or '-'}")
        else:
            msgs = []
            if cn_issues:
                msgs.append(f"中文字体不一致 {cn_issues} 处(要求{exp_cn})")
            if en_issues:
                msgs.append(f"英文字体不一致 {en_issues} 处(要求{exp_en})")
            checker.add_result("字体一致性", desc, CheckResult.FAIL,
                            "; ".join(msgs), fixable=True)


def check_figure_table_captions(checker):
    """检查图注和表注的样式以及引用完整性。"""
    special = checker.rules.get('special_checks', {})
    ft_check = special.get('figure_table_caption', {})
    if not ft_check.get('enabled'):
        return

    fig_style_name = ft_check.get('figure_caption_style', '图题')
    tbl_style_name = ft_check.get('table_caption_style', '表题注')

    fig_pattern = re.compile(r'^图\s*(\d+-\d+)')
    tbl_pattern = re.compile(r'^表\s*(\d+-\d+)')
    fig_ref_pattern = re.compile(r'图\s*(\d+-\d+)')
    tbl_ref_pattern = re.compile(r'表\s*(\d+-\d+)')

    # 收集图注/表注及其样式
    fig_captions = {}  # {编号: (段落idx, 样式, 文本)}
    tbl_captions = {}
    fig_wrong_style = []
    tbl_wrong_style = []

    for i, para in enumerate(checker.doc.paragraphs):
        text = para.text.strip()
        if not text:
            continue
        style_name = para.style.name if para.style else 'None'

        m = fig_pattern.match(text)
        if m:
            fig_num = m.group(1)
            fig_captions[fig_num] = (i, style_name, text[:50])
            if style_name != fig_style_name:
                fig_wrong_style.append((i, fig_num, style_name, text[:50]))
            continue

        m = tbl_pattern.match(text)
        if m:
            tbl_num = m.group(1)
            tbl_captions[tbl_num] = (i, style_name, text[:50])
            if style_name != tbl_style_name:
                tbl_wrong_style.append((i, tbl_num, style_name, text[:50]))

    # 收集正文中的引用（排除图注/表注本身）
    fig_refs = set()
    tbl_refs = set()
    for i, para in enumerate(checker.doc.paragraphs):
        text = para.text.strip()
        if not text:
            continue
        # 跳过图注/表注本身和目录
        if fig_pattern.match(text) or tbl_pattern.match(text):
            continue
        style_name = para.style.name if para.style else 'None'
        if (style_name or '').lower().startswith('toc'):
            continue

        for m in fig_ref_pattern.finditer(text):
            fig_refs.add(m.group(1))
        for m in tbl_ref_pattern.finditer(text):
            tbl_refs.add(m.group(1))

    # 报告图注样式问题
    if fig_wrong_style:
        checker.add_result("图表标题", "图注样式", CheckResult.FAIL,
                        f"{len(fig_wrong_style)} 个图注未使用\"{fig_style_name}\"样式",
                        fixable=True)
        for idx, num, style, text in fig_wrong_style[:5]:
            checker.add_result("图表标题", f"  图{num}-段落{idx}", CheckResult.FAIL,
                            f"\"{text}\" 样式=\"{style}\"(应为\"{fig_style_name}\")",
                            f"段落{idx}", fixable=True)
    elif fig_captions:
        checker.add_result("图表标题", "图注样式", CheckResult.PASS,
                        f"全部 {len(fig_captions)} 个图注样式正确")

    # 报告表注样式问题
    if tbl_wrong_style:
        checker.add_result("图表标题", "表注样式", CheckResult.FAIL,
                        f"{len(tbl_wrong_style)} 个表注未使用\"{tbl_style_name}\"样式",
                        fixable=True)
        for idx, num, style, text in tbl_wrong_style[:5]:
            checker.add_result("图表标题", f"  表{num}-段落{idx}", CheckResult.FAIL,
                            f"\"{text}\" 样式=\"{style}\"(应为\"{tbl_style_name}\")",
                            f"段落{idx}", fixable=True)
    elif tbl_captions:
        checker.add_result("图表标题", "表注样式", CheckResult.PASS,
                        f"全部 {len(tbl_captions)} 个表注样式正确")

    # 图引用检查
    fig_nums = set(fig_captions.keys())
    unreferenced_figs = fig_nums - fig_refs
    phantom_fig_refs = fig_refs - fig_nums

    if unreferenced_figs:
        checker.add_result("图表引用", "未被引用的图", CheckResult.WARN,
                        f"{len(unreferenced_figs)} 张图未在正文中被引用: "
                        f"{', '.join('图' + n for n in sorted(unreferenced_figs))}")
    if phantom_fig_refs:
        checker.add_result("图表引用", "悬空图引用", CheckResult.WARN,
                        f"{len(phantom_fig_refs)} 个图引用找不到对应图注: "
                        f"{', '.join('图' + n for n in sorted(phantom_fig_refs))}")
    if not unreferenced_figs and not phantom_fig_refs and fig_captions:
        checker.add_result("图表引用", "图引用完整性", CheckResult.PASS,
                        f"全部 {len(fig_captions)} 张图均被正确引用")

    # 表引用检查
    tbl_nums = set(tbl_captions.keys())
    unreferenced_tbls = tbl_nums - tbl_refs
    phantom_tbl_refs = tbl_refs - tbl_nums

    if unreferenced_tbls:
        checker.add_result("图表引用", "未被引用的表", CheckResult.WARN,
                        f"{len(unreferenced_tbls)} 个表未在正文中被引用: "
                        f"{', '.join('表' + n for n in sorted(unreferenced_tbls))}")
    if phantom_tbl_refs:
        checker.add_result("图表引用", "悬空表引用", CheckResult.WARN,
                        f"{len(phantom_tbl_refs)} 个表引用找不到对应表注: "
                        f"{', '.join('表' + n for n in sorted(phantom_tbl_refs))}")
    if not unreferenced_tbls and not phantom_tbl_refs and tbl_captions:
        checker.add_result("图表引用", "表引用完整性", CheckResult.PASS,
                        f"全部 {len(tbl_captions)} 个表均被正确引用")

    # 无图无表
    if not fig_captions and not tbl_captions:
        checker.add_result("图表标题", "图表标题", CheckResult.PASS, "文档中无图表标题")
