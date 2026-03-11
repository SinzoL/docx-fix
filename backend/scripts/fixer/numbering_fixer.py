"""
编号系统修复混入类

包含：标题编号恢复、lvlText 格式、numId 统一、编号隔离、编号缩进等修复逻辑。
"""

from lxml import etree  # type: ignore[attr-defined]

from .constants import NSMAP, W


class NumberingFixerMixin:
    """编号系统相关修复方法的混入类"""

    # ========================================
    # 6. 修复被禁用的标题编号（numId=0 覆盖）
    # ========================================
    def fix_disabled_heading_numbering(self):
        """修复标题段落中 numId=0 导致编号被禁用的问题。

        当段落级 numPr 中 numId=0 时，它会覆盖样式定义中的编号，
        导致标题不显示自动编号（如 3.1、4.1 等）。
        修复方式：移除段落级的 numPr，让编号继承自样式定义。
        """
        style_rules = self.rules.get('styles', {})
        fix_count = 0

        for i, para in enumerate(self.doc.paragraphs):
            text = para.text.strip()
            if not text:
                continue
            style_name = (para.style.name or "None") if para.style else "None"
            if style_name.lower().startswith('toc ') or style_name == '说明文字':
                continue

            rules = style_rules.get(style_name)
            if not rules:
                continue
            if rules.get('paragraph', {}).get('outline_level') is None:
                continue

            # 获取样式定义中的编号信息
            style_numId = None
            if para.style and para.style.element is not None:
                s_pPr = para.style.element.find('.//w:pPr', NSMAP)
                if s_pPr is not None:
                    s_numPr = s_pPr.find('w:numPr', NSMAP)
                    if s_numPr is not None:
                        s_numId_el = s_numPr.find('w:numId', NSMAP)
                        if s_numId_el is not None:
                            style_numId = s_numId_el.get(f'{{{W}}}val')

            if not style_numId or style_numId == '0':
                continue

            # 检查段落级 numId=0
            pPr = para._element.find('w:pPr', NSMAP)
            if pPr is not None:
                numPr = pPr.find('w:numPr', NSMAP)
                if numPr is not None:
                    numId_el = numPr.find('w:numId', NSMAP)
                    if numId_el is not None and numId_el.get(f'{{{W}}}val') == '0':
                        self.log_fix("编号恢复",
                                     f"段落{i} \"{text[:30]}\" 移除 numId=0 覆盖，恢复样式编号")
                        if not self.dry_run:
                            pPr.remove(numPr)
                        fix_count += 1

        if fix_count > 0:
            self.log_fix("编号恢复", f"共恢复 {fix_count} 个标题段落的自动编号")

    # ========================================
    # 7. numbering.xml 辅助方法 + lvlText 修复
    # ========================================
    def _get_numbering_part(self):
        """安全获取 numbering part，不存在则返回 None"""
        try:
            return self.doc.part.numbering_part._element
        except Exception:
            return None

    def _get_heading_abstract_num_id(self):
        """找到标题样式绑定的 numId 对应的 abstractNumId"""
        numbering_el = self._get_numbering_part()
        if numbering_el is None:
            return None, None, None

        # 从样式中获取 Heading 1 的 numId
        heading_numId = None
        for style in self.doc.styles:
            if style.name == 'Heading 1' or (hasattr(style, 'element') and
                    style.element.get(f'{{{W}}}styleId') == '1'):
                s_pPr = style.element.find('.//w:pPr', NSMAP)
                if s_pPr is not None:
                    s_numPr = s_pPr.find('w:numPr', NSMAP)
                    if s_numPr is not None:
                        s_numId_el = s_numPr.find('w:numId', NSMAP)
                        if s_numId_el is not None:
                            heading_numId = s_numId_el.get(f'{{{W}}}val')
                break

        if not heading_numId:
            return numbering_el, None, None

        # 找 numId -> abstractNumId
        for num_el in numbering_el.findall('w:num', NSMAP):
            if num_el.get(f'{{{W}}}numId') == heading_numId:
                abs_ref = num_el.find('w:abstractNumId', NSMAP)
                if abs_ref is not None:
                    return numbering_el, heading_numId, abs_ref.get(f'{{{W}}}val')
        return numbering_el, heading_numId, None

    def fix_heading_lvl_text(self):
        """修复 numbering.xml 中标题编号的 lvlText 格式。

        python-docx 保存文档后，abstractNum 的 lvlText 可能变成错误格式
        如 '%1.'、'%2.'、'%3.' 而非正确的多级编号格式 '%1'、'%1.%2'、'%1.%2.%3'。
        """
        numbering_el, _heading_numId, abs_id = self._get_heading_abstract_num_id()
        if numbering_el is None or abs_id is None:
            return

        expected_lvl_texts = {
            '0': '%1',
            '1': '%1.%2',
            '2': '%1.%2.%3',
        }

        for abs_num in numbering_el.findall('w:abstractNum', NSMAP):
            if abs_num.get(f'{{{W}}}abstractNumId') != abs_id:
                continue
            for lvl in abs_num.findall('w:lvl', NSMAP):
                ilvl = lvl.get(f'{{{W}}}ilvl')
                if ilvl not in expected_lvl_texts:
                    continue
                pstyle_el = lvl.find('w:pStyle', NSMAP)
                if pstyle_el is None:
                    continue

                text_el = lvl.find('w:lvlText', NSMAP)
                if text_el is None:
                    continue
                actual = text_el.get(f'{{{W}}}val')
                expected = expected_lvl_texts[ilvl]
                if actual != expected:
                    self.log_fix("编号格式",
                                 f"abstractNum={abs_id} ilvl={ilvl} lvlText \"{actual}\" → \"{expected}\"")
                    if not self.dry_run:
                        text_el.set(f'{{{W}}}val', expected)

    # ========================================
    # 8. 修复标题段落级 numId 覆盖（统一编号链）
    # ========================================
    def fix_heading_numid_override(self):
        """修复标题段落级别的 numId 覆盖问题。

        当 Heading 1 段落级有独立的 numId 覆盖，而样式定义中的 numId 是
        与子标题共享的编号链，段落级覆盖会导致编号不连贯。
        修复方式：移除段落级 numPr，让标题继承样式定义的编号。
        """
        style_rules = self.rules.get('styles', {})
        fix_count = 0

        for i, para in enumerate(self.doc.paragraphs):
            text = para.text.strip()
            if not text:
                continue
            style_name = (para.style.name or "None") if para.style else "None"
            if style_name.lower().startswith('toc ') or style_name == '说明文字':
                continue

            rules = style_rules.get(style_name)
            if not rules:
                continue
            if rules.get('paragraph', {}).get('outline_level') is None:
                continue

            # 获取样式定义中的编号信息
            style_numId = None
            if para.style and para.style.element is not None:
                s_pPr = para.style.element.find('.//w:pPr', NSMAP)
                if s_pPr is not None:
                    s_numPr = s_pPr.find('w:numPr', NSMAP)
                    if s_numPr is not None:
                        s_numId_el = s_numPr.find('w:numId', NSMAP)
                        if s_numId_el is not None:
                            style_numId = s_numId_el.get(f'{{{W}}}val')

            if not style_numId or style_numId == '0':
                continue

            # 检查段落级 numId 是否与样式定义不同
            pPr = para._element.find('w:pPr', NSMAP)
            if pPr is not None:
                numPr = pPr.find('w:numPr', NSMAP)
                if numPr is not None:
                    numId_el = numPr.find('w:numId', NSMAP)
                    if numId_el is not None:
                        para_numId = numId_el.get(f'{{{W}}}val')
                        if para_numId != '0' and para_numId != style_numId:
                            self.log_fix("编号统一",
                                         f"段落{i} \"{text[:30]}\" 移除段落级 numId={para_numId} 覆盖"
                                         f"（样式 numId={style_numId}）")
                            if not self.dry_run:
                                pPr.remove(numPr)
                            fix_count += 1

        if fix_count > 0:
            self.log_fix("编号统一", f"共统一 {fix_count} 个标题段落到样式编号链")

    # ========================================
    # 9. 修复共享 abstractNum 导致编号计数器污染
    # ========================================
    def fix_shared_abstract_num(self):
        """修复多个 numId 共享标题 abstractNum 导致编号计数器污染的问题。"""
        numbering_el, _heading_numId, heading_abs_id = self._get_heading_abstract_num_id()
        if numbering_el is None or heading_abs_id is None:
            return

        # 收集所有标题样式使用的 numId
        heading_numIds = set()
        style_rules = self.rules.get('styles', {})
        for style in self.doc.styles:
            rules = style_rules.get(style.name)
            if not rules:
                continue
            if rules.get('paragraph', {}).get('outline_level') is None:
                continue
            s_pPr = style.element.find('.//w:pPr', NSMAP)
            if s_pPr is not None:
                s_numPr = s_pPr.find('w:numPr', NSMAP)
                if s_numPr is not None:
                    s_numId_el = s_numPr.find('w:numId', NSMAP)
                    if s_numId_el is not None:
                        heading_numIds.add(s_numId_el.get(f'{{{W}}}val'))

        # 找所有引用同一 abstractNumId 但不是标题使用的 numId
        polluting_numIds = []
        for num_el in numbering_el.findall('w:num', NSMAP):
            num_id = num_el.get(f'{{{W}}}numId')
            abs_ref = num_el.find('w:abstractNumId', NSMAP)
            if abs_ref is None:
                continue
            abs_id = abs_ref.get(f'{{{W}}}val')
            if abs_id == heading_abs_id and num_id not in heading_numIds:
                polluting_numIds.append((num_id, num_el))

        if not polluting_numIds:
            return

        # 检查这些 numId 是否实际被文档段落使用
        body = self.doc.element.body
        used_polluting = set()
        for p_el in body.findall('w:p', NSMAP):
            pPr = p_el.find('w:pPr', NSMAP)
            if pPr is not None:
                numPr = pPr.find('w:numPr', NSMAP)
                if numPr is not None:
                    ne = numPr.find('w:numId', NSMAP)
                    if ne is not None:
                        nid = ne.get(f'{{{W}}}val')
                        if nid in {pid for pid, _ in polluting_numIds}:
                            used_polluting.add(nid)

        if not used_polluting:
            return

        # 创建独立的简单列表 abstractNum
        max_abs_id = 0
        for abs_num in numbering_el.findall('w:abstractNum', NSMAP):
            aid = int(abs_num.get(f'{{{W}}}abstractNumId'))
            if aid > max_abs_id:
                max_abs_id = aid

        new_abs_id = max_abs_id + 1

        new_abs_xml = (
            f'<w:abstractNum w:abstractNumId="{new_abs_id}" '
            f'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f'<w:multiLevelType w:val="hybridMultilevel"/>'
        )
        lvl_formats = [
            ('decimal', '%1.'), ('lowerLetter', '%2.'), ('lowerRoman', '%3.'),
            ('decimal', '%4.'), ('lowerLetter', '%5.'), ('lowerRoman', '%6.'),
            ('decimal', '%7.'), ('lowerLetter', '%8.'), ('lowerRoman', '%9.'),
        ]
        for i, (fmt, txt) in enumerate(lvl_formats):
            new_abs_xml += (
                f'<w:lvl w:ilvl="{i}">'
                f'<w:start w:val="1"/>'
                f'<w:numFmt w:val="{fmt}"/>'
                f'<w:lvlText w:val="{txt}"/>'
                f'<w:lvlJc w:val="left"/>'
                f'</w:lvl>'
            )
        new_abs_xml += '</w:abstractNum>'

        new_abs_el = etree.fromstring(new_abs_xml)

        last_abs = numbering_el.findall('w:abstractNum', NSMAP)[-1]
        last_abs.addnext(new_abs_el)

        for num_id, num_el in polluting_numIds:
            if num_id in used_polluting:
                abs_ref = num_el.find('w:abstractNumId', NSMAP)
                abs_ref.set(f'{{{W}}}val', str(new_abs_id))
                self.log_fix("编号隔离",
                             f"numId={num_id} 从共享 abstractNum={heading_abs_id} "
                             f"改为独立 abstractNum={new_abs_id}")

        self.log_fix("编号隔离",
                     f"共隔离 {len(used_polluting)} 个非标题列表编号，"
                     f"防止计数器污染标题编号")

    # ========================================
    # 13. 修复标题编号缩进（numbering.xml）
    # ========================================
    def fix_heading_numbering_indent(self):
        """修复 numbering.xml 中标题编号级别的缩进、suff 和 tabs。"""
        numbering_el, _heading_numId, abs_id = self._get_heading_abstract_num_id()
        if numbering_el is None or abs_id is None:
            return

        num_rules = self.rules.get('numbering', {}).get('heading_numbering', {})
        levels = num_rules.get('levels', {})

        for abs_num in numbering_el.findall('w:abstractNum', NSMAP):
            if abs_num.get(f'{{{W}}}abstractNumId') != abs_id:
                continue
            for lvl in abs_num.findall('w:lvl', NSMAP):
                ilvl = lvl.get(f'{{{W}}}ilvl')
                ilvl_int = int(ilvl) if ilvl else -1

                lvl_rule = levels.get(ilvl_int, {})

                # --- 修复 suff ---
                expected_suff = lvl_rule.get('suff')
                if expected_suff:
                    suff_el = lvl.find('w:suff', NSMAP)
                    actual_suff = suff_el.get(f'{{{W}}}val') if suff_el is not None else 'tab'
                    if actual_suff != expected_suff:
                        self.log_fix("编号后缀",
                                     f"abstractNum={abs_id} ilvl={ilvl} "
                                     f"suff \"{actual_suff}\" → \"{expected_suff}\"")
                        if not self.dry_run:
                            if suff_el is None:
                                suff_el = etree.SubElement(lvl, f'{{{W}}}suff')
                            suff_el.set(f'{{{W}}}val', expected_suff)

                # --- 修复 tabs ---
                expected_tab_pos = lvl_rule.get('tab_pos')
                pPr = lvl.find('w:pPr', NSMAP)
                if pPr is None:
                    pPr = etree.SubElement(lvl, f'{{{W}}}pPr')

                if expected_suff == 'space':
                    tabs = pPr.find('w:tabs', NSMAP)
                    if tabs is not None:
                        old_tabs = []
                        for tab in tabs.findall('w:tab', NSMAP):
                            old_tabs.append(f"val={tab.get(f'{{{W}}}val')} pos={tab.get(f'{{{W}}}pos')}")
                        if old_tabs:
                            self.log_fix("编号制表位",
                                         f"abstractNum={abs_id} ilvl={ilvl} "
                                         f"移除 tabs [{'; '.join(old_tabs)}]（suff=space 不需要制表位）")
                        if not self.dry_run:
                            pPr.remove(tabs)
                elif expected_tab_pos is not None:
                    tabs = pPr.find('w:tabs', NSMAP)
                    expected_pos_str = str(expected_tab_pos)

                    needs_tab_fix = False
                    old_tab_info = 'none'
                    if tabs is not None:
                        tab_els = tabs.findall('w:tab', NSMAP)
                        if len(tab_els) == 1:
                            t = tab_els[0]
                            old_val = t.get(f'{{{W}}}val', '')
                            old_pos = t.get(f'{{{W}}}pos', '')
                            old_tab_info = f"val={old_val} pos={old_pos}"
                            if old_pos != expected_pos_str or old_val == 'num':
                                needs_tab_fix = True
                        else:
                            old_tab_info = f"{len(tab_els)} tabs"
                            needs_tab_fix = True
                    else:
                        needs_tab_fix = True

                    if needs_tab_fix:
                        self.log_fix("编号制表位",
                                     f"abstractNum={abs_id} ilvl={ilvl} "
                                     f"tabs [{old_tab_info}] → [val=left pos={expected_pos_str}]")
                        if not self.dry_run:
                            if tabs is not None:
                                pPr.remove(tabs)
                            tabs = etree.SubElement(pPr, f'{{{W}}}tabs')
                            tab = etree.SubElement(tabs, f'{{{W}}}tab')
                            tab.set(f'{{{W}}}val', 'left')
                            tab.set(f'{{{W}}}pos', expected_pos_str)

                # --- 修复 indent ---
                expected_left = lvl_rule.get('ind_left')
                expected_fl = lvl_rule.get('ind_firstLine')
                if expected_left is not None:
                    ind = pPr.find('w:ind', NSMAP)
                    if ind is None:
                        ind = etree.SubElement(pPr, f'{{{W}}}ind')

                    old_left = ind.get(f'{{{W}}}left', '0')
                    old_hanging = ind.get(f'{{{W}}}hanging', 'N/A')
                    old_fl = ind.get(f'{{{W}}}firstLine', 'N/A')
                    exp_left_str = str(expected_left)
                    exp_fl_str = str(expected_fl) if expected_fl is not None else '0'

                    needs_fix = (old_left != exp_left_str or old_hanging != 'N/A' or old_fl != exp_fl_str)
                    if needs_fix:
                        self.log_fix("编号缩进",
                                     f"abstractNum={abs_id} ilvl={ilvl} "
                                     f"left={old_left},hanging={old_hanging},firstLine={old_fl} "
                                     f"→ left={exp_left_str},firstLine={exp_fl_str}")
                        if not self.dry_run:
                            ind.set(f'{{{W}}}left', exp_left_str)
                            ind.set(f'{{{W}}}firstLine', exp_fl_str)
                            if f'{{{W}}}hanging' in ind.attrib:
                                del ind.attrib[f'{{{W}}}hanging']

                # --- 修复 lvlText ---
                expected_text = lvl_rule.get('lvlText')
                if expected_text:
                    text_el = lvl.find('w:lvlText', NSMAP)
                    if text_el is not None:
                        actual = text_el.get(f'{{{W}}}val')
                        if actual != expected_text:
                            self.log_fix("编号格式",
                                         f"abstractNum={abs_id} ilvl={ilvl} "
                                         f"lvlText \"{actual}\" → \"{expected_text}\"")
                            if not self.dry_run:
                                text_el.set(f'{{{W}}}val', expected_text)

    # ========================================
    # 15. 修复异常编号
    # ========================================
    def fix_abnormal_numbering(self):
        """修复标题段落的异常编号"""
        style_rules = self.rules.get('styles', {})
        heading_styles = set()
        for name, rules in style_rules.items():
            if rules.get('paragraph', {}).get('outline_level') is not None:
                heading_styles.add(name)

        for i, para in enumerate(self.doc.paragraphs):
            text = para.text.strip()
            if not text:
                continue
            style_name = (para.style.name or "None") if para.style else "None"

            if style_name not in heading_styles:
                continue

            pPr = para._element.find('w:pPr', NSMAP)
            if pPr is None:
                continue
            numPr = pPr.find('w:numPr', NSMAP)
            if numPr is None:
                continue

            numId_elem = numPr.find('w:numId', NSMAP)
            ilvl_elem = numPr.find('w:ilvl', NSMAP)
            numId = numId_elem.get(f'{{{W}}}val') if numId_elem is not None else None
            ilvl = ilvl_elem.get(f'{{{W}}}val') if ilvl_elem is not None else None

            if numId and numId != '0' and ilvl and ilvl != '0':
                same_style_non_zero = 0
                same_style_total = 0
                for p in self.doc.paragraphs:
                    if p.style and p.style.name == style_name and p.text.strip():
                        same_style_total += 1
                        pp = p._element.find('w:pPr', NSMAP)
                        if pp is not None:
                            np = pp.find('w:numPr', NSMAP)
                            if np is not None:
                                ni = np.find('w:numId', NSMAP)
                                il = np.find('w:ilvl', NSMAP)
                                if ni is not None and il is not None:
                                    if ni.get(f'{{{W}}}val') == numId and il.get(f'{{{W}}}val') == ilvl:
                                        same_style_non_zero += 1

                if same_style_non_zero <= same_style_total // 2:
                    self.log_fix("编号修复", f"段落{i} \"{text[:30]}\" 移除异常编号 numId={numId} ilvl={ilvl}")
                    if not self.dry_run:
                        pPr.remove(numPr)
