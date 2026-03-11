#!/usr/bin/env python3
"""
Word 文档格式自动修复引擎 — 基类

根据 YAML 规则配置文件，自动修复文档的格式问题。
仅修复格式，不改动文档内容。

用法：
    python -m scripts.fixer <docx文件路径> [--rules <yaml规则文件>] [--dry-run]
"""

import sys
import os
import shutil
import yaml
from docx import Document
from lxml import etree  # type: ignore[attr-defined]
from docx.oxml.ns import qn

from .constants import NSMAP, W, FONT_ALIASES, fonts_match  # noqa: F401
from .style_fixer import StyleFixerMixin
from .numbering_fixer import NumberingFixerMixin
from .heading_fixer import HeadingFixerMixin


class DocxFixer(StyleFixerMixin, NumberingFixerMixin, HeadingFixerMixin):
    """文档格式修复器

    通过混入类组合所有修复功能：
    - StyleFixerMixin: 页面设置、样式定义、段落字体修复
    - NumberingFixerMixin: 编号系统修复
    - HeadingFixerMixin: 标题样式、段落大纲、TOC、图注修复
    """

    def __init__(self, filepath, rules_path=None):
        self.filepath = filepath
        self.doc = Document(filepath)
        self.fixes = []
        self.dry_run = False

        if rules_path is None:
            rules_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "rules", "default.yaml")
        with open(rules_path, 'r', encoding='utf-8') as f:
            self.rules = yaml.safe_load(f)

    def log_fix(self, category, description):
        self.fixes.append((category, description))
        prefix = "[DRY RUN] " if self.dry_run else ""
        print(f"  {prefix}🔧 [{category}] {description}")

    # ========================================
    # 16. 设置更新域标志（最后执行）
    # ========================================
    def set_update_fields(self):
        """设置文档打开时自动更新域"""
        settings = self.doc.settings.element
        updateFields = settings.find(qn('w:updateFields'))
        if updateFields is None:
            updateFields = etree.SubElement(settings, qn('w:updateFields'))
        updateFields.set(qn('w:val'), 'true')
        self.log_fix("域更新", "设置文档打开时自动更新域")

    # ========================================
    # 运行所有修复
    # ========================================
    def run_all_fixes(self, dry_run=False):
        """执行所有修复"""
        self.dry_run = dry_run
        self.fixes = []

        print(f"\n{'=' * 60}")
        print(f"  格式修复: {os.path.basename(self.filepath)}")
        print(f"  模式: {'DRY RUN (仅检测)' if dry_run else '实际修复'}")
        print(f"{'=' * 60}\n")

        self.fix_heading_style_and_manual_numbering()
        self.fix_wrong_caption_style()
        self.fix_figure_caption_style()
        self.fix_page_setup()
        self.fix_style_definitions()
        self.fix_paragraph_outline_levels()
        self.fix_toc()
        self.fix_run_fonts()
        self.fix_disabled_heading_numbering()
        self.fix_heading_lvl_text()
        self.fix_heading_numid_override()
        self.fix_shared_abstract_num()
        self.fix_heading_numbering_indent()
        self.fix_heading_paragraph_indent()
        self.fix_abnormal_numbering()

        if not dry_run and self.fixes:
            self.set_update_fields()

        # 保存
        if not dry_run and self.fixes:
            bak_path = self.filepath + ".bak"
            if not os.path.exists(bak_path):
                shutil.copy2(self.filepath, bak_path)
                print(f"\n  已备份原文件: {bak_path}")

            self.doc.save(self.filepath)
            print(f"  已保存: {self.filepath}")

        print(f"\n  {'─' * 50}")
        print(f"  共 {len(self.fixes)} 项{'需要' if dry_run else '已'}修复")
        if dry_run and self.fixes:
            print("  去掉 --dry-run 参数执行实际修复")
        print()

        return self.fixes


def main():
    if len(sys.argv) < 2:
        print("用法: python -m scripts.fixer <docx文件路径> [--rules <yaml规则文件>] [--dry-run]")
        sys.exit(1)

    filepath = sys.argv[1]
    dry_run = "--dry-run" in sys.argv

    rules_path = None
    if "--rules" in sys.argv:
        idx = sys.argv.index("--rules")
        if idx + 1 < len(sys.argv):
            rules_path = sys.argv[idx + 1]

    fixer = DocxFixer(filepath, rules_path)
    fixer.run_all_fixes(dry_run=dry_run)


if __name__ == "__main__":
    main()
