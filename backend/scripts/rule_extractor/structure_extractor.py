"""
规则提取器 — 结构与编号提取模块

负责从 Word 文档中提取：
- 文档结构信息（章节、标题映射、TOC 配置）
- 编号定义（numbering.xml）
- 特殊检查规则（模板说明、字体一致性等）
- 标题样式修复规则
"""

import re
from collections import OrderedDict

from .constants import NSMAP, W


class StructureExtractorMixin:
    """结构与编号提取功能的 Mixin，注入到 RuleExtractor 中使用。

    依赖宿主类提供：self.doc, self.rules
    依赖 StyleExtractorMixin 提供：self._is_instruction_style()
    """

    # ========================================
    # 文档结构提取
    # ========================================
    def extract_structure(self):
        """提取文档结构信息（章节、标题映射、TOC 配置）"""
        structure = OrderedDict()

        # 收集一级标题
        chapters = []
        heading_style_names = {}  # outline_level -> style_name

        for para in self.doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue

            outline_lvl = self._get_para_outline_level(para)

            if outline_lvl < 9:
                style_name = para.style.name if para.style else 'Normal'
                if outline_lvl not in heading_style_names:
                    heading_style_names[outline_lvl] = style_name

                if outline_lvl == 0:
                    chapters.append(OrderedDict([
                        ('pattern', text[:30]),
                        ('style', style_name),
                    ]))

        # 必要章节
        if chapters:
            structure['required_chapters'] = chapters

        # 标题样式映射
        if heading_style_names:
            mapping = OrderedDict()
            for lvl in sorted(heading_style_names.keys()):
                if lvl <= 5:
                    mapping[f'level_{lvl + 1}'] = heading_style_names[lvl]
            if mapping:
                structure['heading_style_mapping'] = mapping

        # TOC 配置
        toc_info = self._extract_toc_info()
        if toc_info:
            structure['toc'] = toc_info

        if structure:
            self.rules['structure'] = structure

    def _get_para_outline_level(self, para):
        """获取段落的实际大纲级别"""
        # 段落直接设置
        pPr = para._element.find('w:pPr', NSMAP)
        if pPr is not None:
            ol = pPr.find('w:outlineLvl', NSMAP)
            if ol is not None:
                return int(ol.get(f'{{{W}}}val'))

        # 样式定义
        if para.style and para.style.element is not None:
            style_pPr = para.style.element.find('.//w:pPr', NSMAP)
            if style_pPr is not None:
                ol = style_pPr.find('w:outlineLvl', NSMAP)
                if ol is not None:
                    return int(ol.get(f'{{{W}}}val'))

        # Heading 推断
        if para.style and para.style.name:
            m = re.match(r'Heading (\d+)', para.style.name)
            if m:
                return int(m.group(1)) - 1

        return 9

    def _extract_toc_info(self):
        """提取 TOC 域代码配置"""
        toc_info = OrderedDict()

        for para in self.doc.paragraphs:
            for run in para._element.findall('.//w:r', NSMAP):
                instrText = run.find('w:instrText', NSMAP)
                if instrText is not None and instrText.text and 'TOC' in instrText.text:
                    code = instrText.text.strip()

                    # TOC 标题样式
                    toc_info['toc_title_style'] = '目录标题'

                    # \o 大纲范围
                    m = re.search(r'\\o\s*"1-(\d+)"', code)
                    if m:
                        toc_info['outline_range'] = f'1-{m.group(1)}'

                    # \t 自定义样式映射
                    m = re.search(r'\\t\s*"([^"]+)"', code)
                    if m:
                        custom_styles = OrderedDict()
                        parts = m.group(1).split(',')
                        for i in range(0, len(parts) - 1, 2):
                            style_name = parts[i].strip()
                            try:
                                level = int(parts[i + 1].strip())
                                custom_styles[style_name] = level
                            except (ValueError, IndexError):
                                pass
                        if custom_styles:
                            toc_info['custom_styles'] = custom_styles

                    return toc_info

        return toc_info

    # ========================================
    # 编号定义提取
    # ========================================
    def extract_numbering(self):
        """提取 numbering.xml 中的编号定义"""
        try:
            numbering_el = self.doc.part.numbering_part._element
        except Exception:
            return

        numbering = OrderedDict()

        # 收集每个样式关联的 numId 和 ilvl
        style_num_map = {}  # style_name -> (numId, ilvl)
        for style in self.doc.styles:
            s_pPr = style.element.find('.//w:pPr', NSMAP)
            if s_pPr is not None:
                numPr = s_pPr.find('w:numPr', NSMAP)
                if numPr is not None:
                    numId_el = numPr.find('w:numId', NSMAP)
                    ilvl_el = numPr.find('w:ilvl', NSMAP)
                    numId = numId_el.get(f'{{{W}}}val') if numId_el is not None else None
                    ilvl = ilvl_el.get(f'{{{W}}}val') if ilvl_el is not None else '0'
                    if numId and numId != '0':
                        style_num_map[style.name] = (numId, ilvl)

        # numId → abstractNumId 映射
        numId_to_absId = {}
        for num_el in numbering_el.findall('w:num', NSMAP):
            nid = num_el.get(f'{{{W}}}numId')
            abs_ref = num_el.find('w:abstractNumId', NSMAP)
            if abs_ref is not None:
                numId_to_absId[nid] = abs_ref.get(f'{{{W}}}val')

        # 按 abstractNumId 分组
        absId_groups = {}  # absId -> [(style_name, numId, ilvl)]
        for sname, (numId, ilvl) in style_num_map.items():
            absId = numId_to_absId.get(numId)
            if absId:
                if absId not in absId_groups:
                    absId_groups[absId] = []
                absId_groups[absId].append((sname, numId, ilvl))

        # 提取每个 abstractNum 的详细信息
        for abs_num in numbering_el.findall('w:abstractNum', NSMAP):
            abs_id = abs_num.get(f'{{{W}}}abstractNumId')

            # 获取多级类型
            multi_type = abs_num.find('w:multiLevelType', NSMAP)
            if multi_type is not None:
                multi_val = multi_type.get(f'{{{W}}}val')
            else:
                multi_val = 'singleLevel'

            # 判断是否是标题编号
            associated_styles = absId_groups.get(abs_id, [])
            has_heading = any('Heading' in s[0] for s in associated_styles)

            # 提取每个级别
            levels_info = self._extract_numbering_levels(abs_num)

            # 只保留有实际内容的编号定义
            if not levels_info:
                continue

            # 生成编号定义名称和描述
            num_key, desc = self._generate_numbering_name(
                abs_id, has_heading, associated_styles, levels_info
            )

            num_entry = OrderedDict([
                ('description', desc),
                ('type', 'multilevel' if multi_val in ('multilevel', 'hybridMultilevel') else 'singleLevel'),
                ('levels', levels_info),
            ])

            numbering[num_key] = num_entry

        if numbering:
            self.rules['numbering'] = numbering

    def _extract_numbering_levels(self, abs_num):
        """提取 abstractNum 中每个级别的详细信息"""
        levels_info = OrderedDict()

        for lvl in abs_num.findall('w:lvl', NSMAP):
            ilvl = lvl.get(f'{{{W}}}ilvl')
            ilvl_int = int(ilvl) if ilvl else 0

            lvl_info = OrderedDict()

            # numFmt
            numFmt = lvl.find('w:numFmt', NSMAP)
            if numFmt is not None:
                lvl_info['numFmt'] = numFmt.get(f'{{{W}}}val')

            # lvlText
            lvlText = lvl.find('w:lvlText', NSMAP)
            if lvlText is not None:
                lvl_info['lvlText'] = lvlText.get(f'{{{W}}}val')

            # pStyle
            pStyle = lvl.find('w:pStyle', NSMAP)
            if pStyle is not None:
                psval = pStyle.get(f'{{{W}}}val')
                # 尝试从 styleId 找回样式名
                for s in self.doc.styles:
                    if s.style_id == psval:
                        lvl_info['pStyle'] = s.name
                        break
                else:
                    lvl_info['pStyle'] = psval

            # suff
            suff = lvl.find('w:suff', NSMAP)
            if suff is not None:
                lvl_info['suff'] = suff.get(f'{{{W}}}val')
            else:
                lvl_info['suff'] = 'tab'  # 默认值

            # start
            start = lvl.find('w:start', NSMAP)
            if start is not None:
                start_val = int(start.get(f'{{{W}}}val'))
                if start_val != 1:
                    lvl_info['start'] = start_val

            # tabs 和 indent
            pPr = lvl.find('w:pPr', NSMAP)
            if pPr is not None:
                tabs = pPr.find('w:tabs', NSMAP)
                if tabs is not None:
                    tab_els = tabs.findall('w:tab', NSMAP)
                    if len(tab_els) == 1:
                        pos = tab_els[0].get(f'{{{W}}}pos')
                        if pos:
                            lvl_info['tab_pos'] = int(pos)

                ind = pPr.find('w:ind', NSMAP)
                if ind is not None:
                    left = ind.get(f'{{{W}}}left')
                    if left:
                        lvl_info['ind_left'] = int(left)
                    fl = ind.get(f'{{{W}}}firstLine')
                    if fl:
                        lvl_info['ind_firstLine'] = int(fl)
                    hanging = ind.get(f'{{{W}}}hanging')
                    if hanging:
                        lvl_info['ind_hanging'] = int(hanging)

            levels_info[ilvl_int] = lvl_info

        return levels_info

    def _generate_numbering_name(self, abs_id, has_heading, associated_styles, levels_info):
        """生成编号定义的名称和描述"""
        if has_heading:
            num_key = 'heading_numbering'
            desc = '标题使用多级编号'
            if any('图' in (lv.get('lvlText', '') or '') for lv in levels_info.values()):
                desc += '，章节标题和图表题注共享同一编号链'
        else:
            style_names = [s[0] for s in associated_styles]
            if style_names:
                num_key = f'{style_names[0]}_numbering'.replace(' ', '_')
                desc = f'样式 {", ".join(style_names)} 的编号'
            else:
                p_styles = [lv.get('pStyle', '') for lv in levels_info.values() if lv.get('pStyle')]
                if p_styles:
                    num_key = f'{p_styles[0]}_numbering'.replace(' ', '_')
                    desc = f'样式 {", ".join(p_styles)} 的编号'
                else:
                    num_key = f'numbering_{abs_id}'
                    desc = f'编号定义 abstractNumId={abs_id}'

        return num_key, desc

    # ========================================
    # 特殊检查规则
    # ========================================
    def extract_special_checks(self):
        """生成特殊检查规则（基于文档内容自动推断）"""
        checks = OrderedDict()

        # 检查是否有"说明文字"样式 → 启用模板说明检查
        has_instruction_style = False
        instruction_style_name = None
        for style in self.doc.styles:
            if self._is_instruction_style(style):
                has_instruction_style = True
                instruction_style_name = style.name
                break

        checks['template_instructions_check'] = OrderedDict([
            ('enabled', has_instruction_style),
            ('description', '检查是否存在未删除的模板说明文字'),
        ])
        if has_instruction_style:
            checks['template_instructions_check']['style_name'] = instruction_style_name
            checks['template_instructions_check']['color'] = 'FF0000'

        # 正文字体一致性
        checks['body_font_consistency'] = self._build_font_consistency_check(
            target_names=('论文正文-首行缩进', 'Normal'),
            check_key='body',
        )

        # 标题字体一致性
        checks['heading_font_consistency'] = self._build_heading_font_check()

        # 图表标题检查
        styles_section = self.rules.get('styles', {})
        fig_style = '图题' if '图题' in styles_section else None
        tbl_style = '表题注' if '表题注' in styles_section else None
        checks['figure_table_caption'] = OrderedDict([
            ('enabled', bool(fig_style or tbl_style)),
            ('description', '检查图片是否有对应的图题'),
        ])
        if fig_style:
            checks['figure_table_caption']['figure_caption_style'] = fig_style
        if tbl_style:
            checks['figure_table_caption']['table_caption_style'] = tbl_style

        self.rules['special_checks'] = checks

    def _build_font_consistency_check(self, target_names, check_key):
        """构建字体一致性检查规则"""
        styles_section = self.rules.get('styles', {})
        body_styles = []
        cn_font = None
        en_font = None

        for sname in target_names:
            if sname in styles_section:
                body_styles.append(sname)
                char = styles_section[sname].get('character', {})
                if not cn_font:
                    cn_font = char.get('font_east_asia')
                if not en_font:
                    en_font = char.get('font_ascii')

        check = OrderedDict([
            ('enabled', bool(body_styles and (cn_font or en_font))),
            ('description', f'检查{check_key}中文使用{cn_font or "未指定"}、英文使用{en_font or "未指定"}'),
        ])
        if body_styles:
            check['target_styles'] = body_styles
            if cn_font:
                check['expected_chinese_font'] = cn_font
            if en_font:
                check['expected_english_font'] = en_font

        return check

    def _build_heading_font_check(self):
        """构建标题字体一致性检查规则"""
        styles_section = self.rules.get('styles', {})
        heading_styles = []
        cn_font = None
        en_font = None

        for sname, sinfo in styles_section.items():
            para = sinfo.get('paragraph', {})
            if para.get('outline_level') is not None:
                heading_styles.append(sname)
                char = sinfo.get('character', {})
                if not cn_font:
                    cn_font = char.get('font_east_asia')
                if not en_font:
                    en_font = char.get('font_ascii')

        check = OrderedDict([
            ('enabled', bool(heading_styles and (cn_font or en_font))),
            ('description', f'检查标题中文使用{cn_font or "未指定"}、英文使用{en_font or "未指定"}'),
        ])
        if heading_styles:
            check['target_styles'] = heading_styles
            if cn_font:
                check['expected_chinese_font'] = cn_font
            if en_font:
                check['expected_english_font'] = en_font

        return check

    # ========================================
    # 标题样式修复规则
    # ========================================
    def extract_heading_style_fix(self):
        """生成标题样式修复规则（自动推断错误样式 → 正确样式的映射）"""
        styles_section = self.rules.get('styles', {})
        structure = self.rules.get('structure', {})
        heading_map = structure.get('heading_style_mapping', {})

        if not heading_map:
            self.rules['heading_style_fix'] = OrderedDict([('enabled', False)])
            return

        fix = OrderedDict()
        fix['enabled'] = True
        fix['description'] = '修复使用错误样式的标题段落，替换为正确样式并去除手动编号'

        # 样式替换映射
        style_replacement = OrderedDict()
        for level_key, correct_style in heading_map.items():
            m = re.match(r'level_(\d+)', level_key)
            if m:
                lvl = int(m.group(1))
                builtin_name = f'Heading {lvl}'
                if correct_style != builtin_name:
                    style_replacement[builtin_name] = correct_style

        if style_replacement:
            fix['style_replacement'] = style_replacement

        # 说明文字修复
        if '说明文字' in styles_section:
            target = '论文正文-首行缩进' if '论文正文-首行缩进' in styles_section else 'Normal'
            fix['caption_style_fix'] = OrderedDict([
                ('source', '说明文字'),
                ('target', target),
            ])

        # 手动编号模式
        manual_patterns = OrderedDict()
        for level_key, correct_style in heading_map.items():
            m = re.match(r'level_(\d+)', level_key)
            if not m:
                continue
            lvl = int(m.group(1))
            if lvl == 1:
                continue
            pattern_parts = r'\d+' + (r'\.\d+' * (lvl - 1))
            manual_patterns[correct_style] = f'^{pattern_parts}\\s*'

        if manual_patterns:
            fix['manual_numbering_patterns'] = manual_patterns

        self.rules['heading_style_fix'] = fix
