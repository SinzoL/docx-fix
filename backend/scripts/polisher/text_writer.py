"""
TextWriter — 润色文本回写器

精确修改 Run 文本，保留原格式属性。支持三种回写策略：
1. 单 Run → 直接替换 text
2. 多 Run 同格式 → 合并到第一个 Run
3. 多 Run 不同格式 → 字符偏移量对齐
"""

from __future__ import annotations

import os
import shutil
import logging
from typing import TYPE_CHECKING

from docx import Document

from scripts.polisher.diff_calculator import DiffCalculator

if TYPE_CHECKING:
    from scripts.polisher.text_extractor import ParagraphSnapshot, RunInfo
    from scripts.polisher.polish_engine import PolishSuggestion

logger = logging.getLogger(__name__)


class TextWriter:
    """润色文本回写器 — 精确修改 Run 文本，保留格式"""

    def __init__(self, doc: Document) -> None:
        """
        Args:
            doc: python-docx Document 对象
        """
        self._doc = doc

    def apply_suggestions(
        self,
        suggestions: list["PolishSuggestion"],
        snapshots: list["ParagraphSnapshot"],
    ) -> int:
        """应用润色建议到文档

        Args:
            suggestions: 要应用的润色建议列表（仅用户接受的）
            snapshots: 段落快照列表（用于 Run 映射）

        Returns:
            成功应用的修改数量
        """
        applied = 0
        # 按段落索引创建快照查找表
        snapshot_map = {s.index: s for s in snapshots}

        for suggestion in suggestions:
            para_idx = suggestion.paragraph_index
            snapshot = snapshot_map.get(para_idx)
            if not snapshot:
                logger.warning(f"段落索引 {para_idx} 未找到对应快照，跳过")
                continue

            paragraph = self._doc.paragraphs[para_idx]
            success = self._write_paragraph(
                paragraph,
                suggestion.original_text,
                suggestion.polished_text,
                snapshot.runs,
            )
            if success:
                applied += 1
                logger.debug(f"段落 {para_idx} 回写成功")
            else:
                logger.warning(f"段落 {para_idx} 回写失败")

        logger.info(f"回写完成：{applied}/{len(suggestions)} 条修改成功应用")
        return applied

    def save(self, output_path: str, backup_suffix: str = ".polish.bak") -> str:
        """保存修改后的文档

        自动创建备份文件。

        Args:
            output_path: 输出文件路径
            backup_suffix: 备份文件后缀

        Returns:
            保存的文件路径
        """
        # 自动备份原文件（如果存在）
        if os.path.exists(output_path):
            backup_path = output_path + backup_suffix
            shutil.copy2(output_path, backup_path)
            logger.info(f"已备份原文件到 {backup_path}")

        self._doc.save(output_path)
        logger.info(f"润色后文档已保存到 {output_path}")
        return output_path

    def _write_paragraph(
        self,
        paragraph,
        original_text: str,
        polished_text: str,
        runs_info: list["RunInfo"],
    ) -> bool:
        """回写单个段落

        分层策略：
        1. 单 Run → 直接替换 text
        2. 多 Run 同格式 → 合并到第一个 Run
        3. 多 Run 不同格式 → 字符偏移量对齐

        Returns:
            是否成功回写
        """
        try:
            runs = paragraph.runs
            if not runs:
                return False

            # 策略 1: 单个 Run
            if len(runs) == 1:
                runs[0].text = polished_text
                return True

            # 策略 2: 所有 Run 格式相同
            if DiffCalculator._all_runs_same_format(runs_info):
                runs[0].text = polished_text
                for r in runs[1:]:
                    r.text = ""
                return True

            # 策略 3: 不同格式 — 使用 Run 映射
            modifications = DiffCalculator.compute_run_mapping(
                runs_info, original_text, polished_text
            )

            if not modifications:
                # 没有计算出映射，降级为策略 2（合并到第一个 Run）
                runs[0].text = polished_text
                for r in runs[1:]:
                    r.text = ""
                return True

            for mod in modifications:
                if mod.run_index < len(runs):
                    if mod.clear:
                        runs[mod.run_index].text = ""
                    else:
                        runs[mod.run_index].text = mod.new_text

            return True

        except Exception as e:
            logger.error(f"回写段落失败: {e}")
            return False

    @staticmethod
    def _all_runs_same_format(runs) -> bool:
        """检查段落中所有 Run 的格式是否相同（基于 python-docx Run 对象）

        这是对 DiffCalculator._all_runs_same_format 的补充，
        直接操作 python-docx Run 对象而非 RunInfo 快照。
        """
        if len(runs) <= 1:
            return True

        first = runs[0]
        for run in runs[1:]:
            f1, f2 = first.font, run.font
            if (
                f1.name != f2.name
                or f1.bold != f2.bold
                or f1.italic != f2.italic
                or f1.size != f2.size
            ):
                return False
        return True
