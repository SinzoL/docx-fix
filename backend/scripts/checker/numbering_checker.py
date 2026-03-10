"""
编号相关检查方法

从 checker.py 迁移而来，包含标题编号禁用检查、lvlText 格式检查、
numId 覆盖检查、abstractNum 共享污染检查、标题样式错误与手动编号检查、
以及编号缩进检查。

所有函数接收 checker (DocxChecker) 实例作为参数，
通过 checker.add_result() 报告结果。
"""

import re

from scripts.checker.base import NSMAP, W, CheckResult


def _get_numbering_part(checker):
    """安全获取 numbering part"""
    try:
        return checker.doc.part.numbering_part._element
    except Exception:
        return None


def _get_heading_abstract_num_id(checker):
    """找到标题样式绑定的 numId 对应的 abstractNumId"""
    numbering_el = _get_numbering_part(checker)
    if numbering_el is None:
        return None, None, None

    heading_numId = None
    for style in checker.doc.styles:
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

    for num_el in numbering_el.findall('w:num', NSMAP):
        if num_el.get(f'{{{W}}}numId') == heading_numId:
            abs_ref = num_el.find('w:abstractNumId', NSMAP)
            if abs_ref is not None:
                return numbering_el, heading_numId, abs_ref.get(f'{{{W}}}val')
    return numbering_el, heading_numId, None


def check_heading_numbering(checker):
    """检查标题段落的编号是否被意外禁用（numId=0 覆盖样式编号）"""
    style_rules = checker.rules.get('styles', {})

    for i, para in enumerate(checker.doc.paragraphs):
        text = para.text.strip()
        if not text:
            continue
        style_name = para.style.name if para.style else "None"
        if (style_name or "").lower().startswith('toc ') or style_name == '说明文字':
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

        # 只在样式定义有编号时检查
        if not style_numId or style_numId == '0':
            continue

        # 检查段落级是否覆盖为 numId=0（禁用编号）
        pPr = para._element.find('w:pPr', NSMAP)
        if pPr is not None:
            numPr = pPr.find('w:numPr', NSMAP)
            if numPr is not None:
                numId_el = numPr.find('w:numId', NSMAP)
                if numId_el is not None and numId_el.get(f'{{{W}}}val') == '0':
                    checker.add_result("标题编号", f"段落{i} 编号被禁用", CheckResult.FAIL,
                                    f"\"{text[:30]}\" 样式 \"{style_name}\" 的编号被 numId=0 覆盖禁用",
                                    f"段落{i}", fixable=True)


def check_heading_lvl_text(checker):
    """检查标题编号的 lvlText 格式是否正确。"""
    numbering_el, _heading_numId2, abs_id = _get_heading_abstract_num_id(checker)
    if numbering_el is None or abs_id is None:
        return

    expected_lvl_texts = {
        '0': '%1', '1': '%1.%2', '2': '%1.%2.%3',
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
                checker.add_result("编号格式", f"abstractNum={abs_id} ilvl={ilvl} lvlText",
                                CheckResult.FAIL,
                                f"当前=\"{actual}\", 要求=\"{expected}\"",
                                fixable=True)


def check_heading_numid_override(checker):
    """检查标题段落是否有段落级 numId 覆盖导致脱离样式编号链。"""
    style_rules = checker.rules.get('styles', {})

    for i, para in enumerate(checker.doc.paragraphs):
        text = para.text.strip()
        if not text:
            continue
        style_name = para.style.name if para.style else "None"
        if (style_name or "").lower().startswith('toc ') or style_name == '说明文字':
            continue

        rules = style_rules.get(style_name)
        if not rules:
            continue
        if rules.get('paragraph', {}).get('outline_level') is None:
            continue

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

        pPr = para._element.find('w:pPr', NSMAP)
        if pPr is not None:
            numPr = pPr.find('w:numPr', NSMAP)
            if numPr is not None:
                numId_el = numPr.find('w:numId', NSMAP)
                if numId_el is not None:
                    para_numId = numId_el.get(f'{{{W}}}val')
                    if para_numId != '0' and para_numId != style_numId:
                        checker.add_result("编号统一", f"段落{i} numId 覆盖",
                                        CheckResult.FAIL,
                                        f"\"{text[:30]}\" 段落级 numId={para_numId} "
                                        f"覆盖了样式 numId={style_numId}，脱离编号链",
                                        f"段落{i}", fixable=True)


def check_shared_abstract_num(checker):
    """检查是否有非标题列表共享了标题编号的 abstractNum。"""
    numbering_el, _heading_numId, heading_abs_id = _get_heading_abstract_num_id(checker)
    if numbering_el is None or heading_abs_id is None:
        return

    # 收集标题样式使用的 numId
    heading_numIds = set()
    style_rules = checker.rules.get('styles', {})
    for style in checker.doc.styles:
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

    # 找引用同一 abstractNum 但不是标题的 numId
    polluting_numIds = set()
    for num_el in numbering_el.findall('w:num', NSMAP):
        num_id = num_el.get(f'{{{W}}}numId')
        abs_ref = num_el.find('w:abstractNumId', NSMAP)
        if abs_ref is None:
            continue
        abs_id = abs_ref.get(f'{{{W}}}val')
        if abs_id == heading_abs_id and num_id not in heading_numIds:
            polluting_numIds.add(num_id)

    if not polluting_numIds:
        return

    # 检查这些 numId 是否实际被使用
    body = checker.doc.element.body
    used_count = 0
    for p_el in body.findall('w:p', NSMAP):
        pPr = p_el.find('w:pPr', NSMAP)
        if pPr is not None:
            numPr = pPr.find('w:numPr', NSMAP)
            if numPr is not None:
                ne = numPr.find('w:numId', NSMAP)
                if ne is not None and ne.get(f'{{{W}}}val') in polluting_numIds:
                    used_count += 1

    if used_count > 0:
        checker.add_result("编号隔离", "abstractNum 共享污染", CheckResult.FAIL,
                        f"{len(polluting_numIds)} 个非标题列表编号共享了标题的 "
                        f"abstractNum={heading_abs_id}，影响 {used_count} 个段落，"
                        f"会导致标题编号跳跃",
                        fixable=True)


def check_heading_style_and_manual_numbering(checker):
    """检查标题段落是否使用了错误的样式，以及是否包含手动输入的编号前缀。"""
    fix_rules = checker.rules.get('heading_style_fix', {})
    if not fix_rules.get('enabled'):
        return

    style_map = fix_rules.get('style_replacement', {})
    num_patterns = fix_rules.get('manual_numbering_patterns', {})

    if not style_map:
        return

    wrong_style_count = 0
    manual_num_count = 0

    for i, para in enumerate(checker.doc.paragraphs):
        text = para.text.strip()
        if not text:
            continue

        style_name = para.style.name if para.style else "None"
        if (style_name or "").lower().startswith('toc ') or style_name == '说明文字':
            continue

        if style_name not in style_map:
            continue

        new_style_name = style_map[style_name]
        wrong_style_count += 1

        # 检查手动编号
        pattern = num_patterns.get(new_style_name)
        has_manual_num = False
        if pattern:
            m = re.match(pattern, text)
            if m:
                has_manual_num = True
                manual_num_count += 1

        msg = (f"\"{text[:40]}\" 使用了 \"{style_name}\"，"
               f"应使用 \"{new_style_name}\"")
        if has_manual_num and m:
            msg += f"，且包含手动编号 \"{m.group(0).strip()}\""

        checker.add_result("标题样式", f"段落{i} 样式错误", CheckResult.FAIL,
                        msg, f"段落{i}", fixable=True)

    if wrong_style_count == 0:
        # 额外检查：即使样式正确，也检查是否有手动编号残留
        for i, para in enumerate(checker.doc.paragraphs):
            text = para.text.strip()
            if not text:
                continue
            style_name = para.style.name if para.style else "None"
            if (style_name or "").lower().startswith('toc ') or style_name == '说明文字':
                continue

            pattern = num_patterns.get(style_name)
            if pattern:
                m = re.match(pattern, text)
                if m:
                    checker.add_result("标题样式", f"段落{i} 手动编号残留", CheckResult.WARN,
                                    f"\"{text[:40]}\" 样式 \"{style_name}\" 可能包含手动编号 "
                                    f"\"{m.group(0).strip()}\"",
                                    f"段落{i}", fixable=True)


def check_heading_numbering_indent(checker):
    """检查标题编号在 numbering.xml 中的缩进、suff、tabs 是否正确。"""
    numbering_el = None
    try:
        numbering_el = checker.doc.part.numbering_part._element
    except Exception:
        return

    # 从 YAML 获取编号规则
    num_rules = checker.rules.get('numbering', {}).get('heading_numbering', {})
    levels = num_rules.get('levels', {})

    # 找标题 abstractNum
    heading_numId = None
    for style in checker.doc.styles:
        if style.name == 'Heading 1':
            s_pPr = style.element.find('.//w:pPr', NSMAP)
            if s_pPr is not None:
                s_numPr = s_pPr.find('w:numPr', NSMAP)
                if s_numPr is not None:
                    s_numId_el = s_numPr.find('w:numId', NSMAP)
                    if s_numId_el is not None:
                        heading_numId = s_numId_el.get(f'{{{W}}}val')
            break

    if not heading_numId:
        return

    abs_id = None
    for num_el in numbering_el.findall('w:num', NSMAP):
        if num_el.get(f'{{{W}}}numId') == heading_numId:
            abs_ref = num_el.find('w:abstractNumId', NSMAP)
            if abs_ref is not None:
                abs_id = abs_ref.get(f'{{{W}}}val')
            break

    if not abs_id:
        return

    issues = []
    for abs_num in numbering_el.findall('w:abstractNum', NSMAP):
        if abs_num.get(f'{{{W}}}abstractNumId') != abs_id:
            continue
        for lvl in abs_num.findall('w:lvl', NSMAP):
            ilvl = lvl.get(f'{{{W}}}ilvl')
            ilvl_int = int(ilvl) if ilvl else -1
            lvl_rule = levels.get(ilvl_int, {})
            if not lvl_rule:
                continue

            # 检查 suff
            expected_suff = lvl_rule.get('suff')
            if expected_suff:
                suff_el = lvl.find('w:suff', NSMAP)
                actual_suff = suff_el.get(f'{{{W}}}val') if suff_el is not None else 'tab'
                if actual_suff != expected_suff:
                    issues.append(f"ilvl={ilvl} suff={actual_suff}(应为{expected_suff})")

            # 检查 tabs
            expected_tab_pos = lvl_rule.get('tab_pos')
            pPr = lvl.find('w:pPr', NSMAP)
            if expected_suff == 'space' and pPr is not None:
                tabs = pPr.find('w:tabs', NSMAP)
                if tabs is not None and len(tabs.findall('w:tab', NSMAP)) > 0:
                    issues.append(f"ilvl={ilvl} suff=space时不应有tabs")
            elif expected_tab_pos is not None and pPr is not None:
                tabs = pPr.find('w:tabs', NSMAP)
                if tabs is not None:
                    tab_els = tabs.findall('w:tab', NSMAP)
                    if len(tab_els) == 1:
                        pos = tab_els[0].get(f'{{{W}}}pos', '0')
                        if pos != str(expected_tab_pos):
                            issues.append(f"ilvl={ilvl} tab_pos={pos}(应为{expected_tab_pos})")
                else:
                    issues.append(f"ilvl={ilvl} 缺少tab_pos={expected_tab_pos}")

            # 检查 indent
            expected_left = lvl_rule.get('ind_left')
            if expected_left is not None and pPr is not None:
                ind = pPr.find('w:ind', NSMAP)
                if ind is not None:
                    left = ind.get(f'{{{W}}}left', '0')
                    hanging = ind.get(f'{{{W}}}hanging')
                    if left != str(expected_left) or hanging:
                        issues.append(f"ilvl={ilvl} left={left} hanging={hanging or 'N/A'}")

    if issues:
        checker.add_result("编号缩进", "标题编号属性", CheckResult.FAIL,
                        f"标题编号级别配置不正确: {'; '.join(issues)}",
                        fixable=True)
    else:
        checker.add_result("编号缩进", "标题编号属性", CheckResult.PASS,
                        "标题编号级别属性正确 (suff/tabs/indent)")
