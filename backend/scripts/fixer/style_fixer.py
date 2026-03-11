"""
样式修复混入类

包含：页面设置、样式定义、段落字体（Run级别）的修复逻辑。
"""

from docx.shared import Pt, Cm
from lxml import etree  # type: ignore[attr-defined]

from .constants import NSMAP, W, fonts_match


class StyleFixerMixin:
    """样式相关修复方法的混入类"""

    # ========================================
    # 1. 修复页面设置
    # ========================================
    def fix_page_setup(self):
        rules = self.rules.get('page_setup', {})
        if not rules:
            return

        for section in self.doc.sections:
            # 纸张大小
            exp_w = rules.get('width_cm')
            exp_h = rules.get('height_cm')
            if exp_w and exp_h:
                if section.page_width is None or section.page_height is None:
                    continue
                actual_w = round(section.page_width / 360000, 1)
                actual_h = round(section.page_height / 360000, 1)
                if abs(actual_w - exp_w) > 0.2 or abs(actual_h - exp_h) > 0.2:
                    self.log_fix("页面设置", f"纸张大小 {actual_w}×{actual_h} → {exp_w}×{exp_h}cm")
                    if not self.dry_run:
                        section.page_width = Cm(exp_w)
                        section.page_height = Cm(exp_h)

            # 页边距
            margin_map = {
                'margin_top_cm': 'top_margin',
                'margin_bottom_cm': 'bottom_margin',
                'margin_left_cm': 'left_margin',
                'margin_right_cm': 'right_margin',
            }
            for rule_key, attr in margin_map.items():
                expected = rules.get(rule_key)
                if expected is None:
                    continue
                actual_emu = getattr(section, attr)
                if actual_emu is None:
                    continue
                actual_cm = round(actual_emu / 360000, 2)
                if abs(actual_cm - expected) > 0.1:
                    self.log_fix("页面设置", f"{attr} {actual_cm}cm → {expected}cm")
                    if not self.dry_run:
                        setattr(section, attr, Cm(expected))

            # 页眉距离
            exp_hd = rules.get('header_distance_cm')
            if exp_hd and section.header_distance is not None:
                actual = round(section.header_distance / 360000, 2)
                if abs(actual - exp_hd) > 0.1:
                    self.log_fix("页面设置", f"页眉距顶端 {actual}cm → {exp_hd}cm")
                    if not self.dry_run:
                        section.header_distance = Cm(exp_hd)

            # 页脚距离
            exp_fd = rules.get('footer_distance_cm')
            if exp_fd and section.footer_distance is not None:
                actual = round(section.footer_distance / 360000, 2)
                if abs(actual - exp_fd) > 0.1:
                    self.log_fix("页面设置", f"页脚距底端 {actual}cm → {exp_fd}cm")
                    if not self.dry_run:
                        section.footer_distance = Cm(exp_fd)

    # ========================================
    # 2. 修复样式定义（辅助方法 + 主方法）
    # ========================================
    def _set_style_outline_level(self, style_elem, level):
        pPr = style_elem.find('.//w:pPr', NSMAP)
        if pPr is None:
            pPr = etree.SubElement(style_elem, f'{{{W}}}pPr')
        ol = pPr.find('w:outlineLvl', NSMAP)
        if ol is None:
            ol = etree.SubElement(pPr, f'{{{W}}}outlineLvl')
        ol.set(f'{{{W}}}val', str(level))

    def _set_style_alignment(self, style_elem, alignment):
        pPr = style_elem.find('.//w:pPr', NSMAP)
        if pPr is None:
            pPr = etree.SubElement(style_elem, f'{{{W}}}pPr')
        jc = pPr.find('w:jc', NSMAP)
        if jc is None:
            jc = etree.SubElement(pPr, f'{{{W}}}jc')
        jc.set(f'{{{W}}}val', alignment)

    def _set_style_spacing(self, style_elem, **kwargs):
        pPr = style_elem.find('.//w:pPr', NSMAP)
        if pPr is None:
            pPr = etree.SubElement(style_elem, f'{{{W}}}pPr')
        spacing = pPr.find('w:spacing', NSMAP)
        if spacing is None:
            spacing = etree.SubElement(pPr, f'{{{W}}}spacing')
        for k, v in kwargs.items():
            spacing.set(f'{{{W}}}{k}', str(v))

    def _set_style_font(self, style_elem, **kwargs):
        rPr = style_elem.find('.//w:rPr', NSMAP)
        if rPr is None:
            rPr = etree.SubElement(style_elem, f'{{{W}}}rPr')
        rFonts = rPr.find('w:rFonts', NSMAP)
        if rFonts is None:
            rFonts = etree.SubElement(rPr, f'{{{W}}}rFonts')
        for k, v in kwargs.items():
            rFonts.set(f'{{{W}}}{k}', v)

    def _set_style_font_size(self, style_elem, half_pt):
        rPr = style_elem.find('.//w:rPr', NSMAP)
        if rPr is None:
            rPr = etree.SubElement(style_elem, f'{{{W}}}rPr')
        sz = rPr.find('w:sz', NSMAP)
        if sz is None:
            sz = etree.SubElement(rPr, f'{{{W}}}sz')
        sz.set(f'{{{W}}}val', str(half_pt))
        szCs = rPr.find('w:szCs', NSMAP)
        if szCs is None:
            szCs = etree.SubElement(rPr, f'{{{W}}}szCs')
        szCs.set(f'{{{W}}}val', str(half_pt))

    def _get_style_outline_level(self, style_elem):
        pPr = style_elem.find('.//w:pPr', NSMAP)
        if pPr is not None:
            ol = pPr.find('w:outlineLvl', NSMAP)
            if ol is not None:
                return int(ol.get(f'{{{W}}}val'))
        return None

    def _get_style_font_info(self, style_elem):
        info = {}
        rPr = style_elem.find('.//w:rPr', NSMAP)
        if rPr is not None:
            rFonts = rPr.find('w:rFonts', NSMAP)
            if rFonts is not None:
                for attr in ['ascii', 'eastAsia', 'hAnsi']:
                    v = rFonts.get(f'{{{W}}}{attr}')
                    if v:
                        info[attr] = v
            sz = rPr.find('w:sz', NSMAP)
            if sz is not None:
                info['fontSize_half_pt'] = int(sz.get(f'{{{W}}}val'))
        return info

    def _get_style_spacing(self, style_elem):
        info = {}
        pPr = style_elem.find('.//w:pPr', NSMAP)
        if pPr is not None:
            spacing = pPr.find('w:spacing', NSMAP)
            if spacing is not None:
                for attr in ['line', 'lineRule', 'before', 'after', 'beforeLines', 'afterLines']:
                    v = spacing.get(f'{{{W}}}{attr}')
                    if v:
                        info[attr] = v
        return info

    def _get_style_alignment(self, style_elem):
        pPr = style_elem.find('.//w:pPr', NSMAP)
        if pPr is not None:
            jc = pPr.find('w:jc', NSMAP)
            if jc is not None:
                return jc.get(f'{{{W}}}val')
        return None

    def fix_style_definitions(self):
        """修复样式定义中的格式"""
        style_rules = self.rules.get('styles', {})

        for style_name, rules in style_rules.items():
            if rules.get('check_type') == 'content_match':
                continue
            if rules.get('should_not_exist'):
                continue

            # 查找样式
            found_style = None
            for style in self.doc.styles:
                if style.name == style_name:
                    found_style = style
                    break

            if found_style is None:
                continue

            para_rules = rules.get('paragraph', {})
            char_rules = rules.get('character', {})
            elem = found_style.element

            # 大纲级别
            if 'outline_level' in para_rules:
                expected = para_rules['outline_level']
                actual = self._get_style_outline_level(elem)
                if actual is None or actual != expected:
                    self.log_fix("样式定义", f"{style_name} 大纲级别 {actual} → {expected}")
                    if not self.dry_run:
                        self._set_style_outline_level(elem, expected)

            # 对齐
            if 'alignment' in para_rules:
                expected = para_rules['alignment']
                actual = self._get_style_alignment(elem)
                if actual != expected:
                    self.log_fix("样式定义", f"{style_name} 对齐 {actual} → {expected}")
                    if not self.dry_run:
                        self._set_style_alignment(elem, expected)

            # 行距
            actual_spacing = self._get_style_spacing(elem)
            spacing_updates = {}
            if 'line_spacing' in para_rules:
                expected_ls = str(para_rules['line_spacing'])
                if actual_spacing.get('line') != expected_ls:
                    spacing_updates['line'] = expected_ls
            if 'line_spacing_rule' in para_rules:
                expected_lr = para_rules['line_spacing_rule']
                if actual_spacing.get('lineRule') != expected_lr:
                    spacing_updates['lineRule'] = expected_lr
            if 'spacing_before_lines' in para_rules:
                expected = str(para_rules['spacing_before_lines'])
                if actual_spacing.get('beforeLines') != expected:
                    spacing_updates['beforeLines'] = expected
            if 'spacing_after_lines' in para_rules:
                expected = str(para_rules['spacing_after_lines'])
                if actual_spacing.get('afterLines') != expected:
                    spacing_updates['afterLines'] = expected

            if spacing_updates:
                self.log_fix("样式定义", f"{style_name} 间距 {spacing_updates}")
                if not self.dry_run:
                    self._set_style_spacing(elem, **spacing_updates)

            # 字体
            actual_font = self._get_style_font_info(elem)
            font_updates = {}
            font_key_map = {'font_ascii': 'ascii', 'font_east_asia': 'eastAsia', 'font_hAnsi': 'hAnsi'}
            for rule_key, xml_key in font_key_map.items():
                if rule_key in char_rules:
                    expected = char_rules[rule_key]
                    actual_val = actual_font.get(xml_key)
                    if actual_val and not fonts_match(actual_val, expected):
                        font_updates[xml_key] = expected

            if font_updates:
                self.log_fix("样式定义", f"{style_name} 字体 {font_updates}")
                if not self.dry_run:
                    self._set_style_font(elem, **font_updates)

            # 字号
            if 'font_size_pt' in char_rules:
                expected_pt = char_rules['font_size_pt']
                expected_half = int(expected_pt * 2)
                actual_half = actual_font.get('fontSize_half_pt')
                if actual_half is None or actual_half != expected_half:
                    self.log_fix("样式定义", f"{style_name} 字号 {(actual_half or 0)/2}磅 → {expected_pt}磅")
                    if not self.dry_run:
                        self._set_style_font_size(elem, expected_half)

    # ========================================
    # 5. 修复段落字体（Run 级别）
    # ========================================
    def _is_cover_page_paragraph(self, para):
        """判断是否为封面页段落"""
        text = para.text.strip()
        style_rules = self.rules.get('styles', {})
        cover_rules = style_rules.get('cover_title', {})
        if cover_rules.get('check_type') == 'content_match':
            for pattern in cover_rules.get('content_patterns', []):
                if pattern in text:
                    return True
        return False

    def fix_run_fonts(self):
        """修复段落中 Run 级别的字体和字号"""
        style_rules = self.rules.get('styles', {})
        fix_count = 0

        for _i, para in enumerate(self.doc.paragraphs):
            text = para.text.strip()
            if not text:
                continue

            style_name = (para.style.name or "None") if para.style else "None"
            if style_name.lower().startswith('toc ') or style_name == '说明文字':
                continue
            # 跳过封面段落
            if self._is_cover_page_paragraph(para):
                continue

            rules = style_rules.get(style_name)
            if not rules:
                continue

            char_rules = rules.get('character', {})
            if not char_rules:
                continue

            for run in para.runs:
                if not run.text or not run.text.strip():
                    continue

                fixed_this_run = False

                # 字号修复
                if run.font.size is not None and 'font_size_pt' in char_rules:
                    expected_pt = char_rules['font_size_pt']
                    actual_pt = run.font.size / 12700
                    if abs(actual_pt - expected_pt) > 0.5:
                        if not self.dry_run:
                            run.font.size = Pt(expected_pt)
                        fixed_this_run = True

                # 英文字体修复
                if run.font.name is not None and 'font_ascii' in char_rules:
                    expected = char_rules['font_ascii']
                    if not fonts_match(run.font.name, expected):
                        if not self.dry_run:
                            run.font.name = expected
                        fixed_this_run = True

                # 中文字体修复（eastAsia）
                exp_ea = char_rules.get('font_east_asia')
                if exp_ea:
                    rPr = run._element.find('.//w:rPr', NSMAP)
                    if rPr is not None:
                        rFonts = rPr.find('w:rFonts', NSMAP)
                        if rFonts is not None:
                            ea = rFonts.get(f'{{{W}}}eastAsia')
                            if ea and not fonts_match(ea, exp_ea):
                                if not self.dry_run:
                                    rFonts.set(f'{{{W}}}eastAsia', exp_ea)
                                fixed_this_run = True

                if fixed_this_run:
                    fix_count += 1

        if fix_count > 0:
            self.log_fix("段落字体", f"共修复 {fix_count} 个 Run 的字体/字号")
