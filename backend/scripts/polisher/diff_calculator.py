"""
DiffCalculator — 字级别 Diff 计算器

基于 difflib.SequenceMatcher 计算原文与润色后文本的字级别差异，
并将差异映射到 Run 边界，用于精确回写。
"""

from __future__ import annotations

import difflib
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from scripts.polisher.text_extractor import RunInfo

logger = logging.getLogger(__name__)


@dataclass
class DiffOperation:
    """字级别差异操作"""
    tag: str        # "equal" | "replace" | "insert" | "delete"
    i1: int         # 原文起始偏移
    i2: int         # 原文结束偏移
    j1: int         # 新文本起始偏移
    j2: int         # 新文本结束偏移


@dataclass
class RunModification:
    """Run 级别的修改操作"""
    run_index: int          # 受影响的 Run 索引
    new_text: str           # Run 的新文本内容
    clear: bool = False     # 是否清空此 Run（跨 Run 合并时非首 Run 被清空）


class DiffCalculator:
    """字级别 Diff 计算器"""

    @staticmethod
    def compute_diff(original: str, polished: str) -> list[DiffOperation]:
        """计算原文与润色后文本的字级别差异

        Args:
            original: 原始文本
            polished: 润色后文本

        Returns:
            差异操作列表（仅包含非 equal 的操作）
        """
        if original == polished:
            return []

        matcher = difflib.SequenceMatcher(None, original, polished)
        ops = []
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag != "equal":
                ops.append(DiffOperation(tag=tag, i1=i1, i2=i2, j1=j1, j2=j2))
        return ops

    @staticmethod
    def compute_run_mapping(
        runs_info: list["RunInfo"],
        original: str,
        polished: str,
    ) -> list[RunModification]:
        """计算 Run 级别的修改映射

        将字符级 diff 映射到 Run 边界，确定每个 Run 需要的修改操作。

        策略：
        1. 如果只有 1 个 Run → 直接替换全部文本
        2. 如果所有 Run 格式相同 → 合并到第一个 Run
        3. 否则 → 逐个 Run 基于字符偏移量重建文本

        Args:
            runs_info: 段落的 Run 信息列表
            original: 原始段落文本
            polished: 润色后段落文本

        Returns:
            Run 修改操作列表
        """
        if not runs_info:
            return []

        if original == polished:
            return []

        # Case 1: 单个 Run
        if len(runs_info) == 1:
            return [RunModification(run_index=0, new_text=polished)]

        # Case 2: 所有 Run 格式相同 → 合并到第一个
        if DiffCalculator._all_runs_same_format(runs_info):
            modifications = [RunModification(run_index=0, new_text=polished)]
            for run in runs_info[1:]:
                modifications.append(
                    RunModification(run_index=run.index, new_text="", clear=True)
                )
            return modifications

        # Case 3: 不同格式 — 基于字符偏移量对齐
        return DiffCalculator._offset_aligned_mapping(runs_info, original, polished)

    @staticmethod
    def _all_runs_same_format(runs_info: list["RunInfo"]) -> bool:
        """检查所有 Run 是否具有相同的格式属性"""
        if len(runs_info) <= 1:
            return True

        first = runs_info[0]
        for run in runs_info[1:]:
            if (
                run.font_name != first.font_name
                or run.font_name_east_asia != first.font_name_east_asia
                or run.font_size_pt != first.font_size_pt
                or run.bold != first.bold
                or run.italic != first.italic
                or run.underline != first.underline
                or run.color_rgb != first.color_rgb
                or run.superscript != first.superscript
                or run.subscript != first.subscript
            ):
                return False
        return True

    @staticmethod
    def _offset_aligned_mapping(
        runs_info: list["RunInfo"],
        original: str,
        polished: str,
    ) -> list[RunModification]:
        """基于字符偏移量对齐的 Run 映射

        使用 SequenceMatcher 计算 equal 块，将润色文本中的修改
        映射到原始 Run 边界。对于修改跨越 Run 边界的情况，
        将修改后文本归入第一个受影响的 Run，后续 Run 清空。
        """
        matcher = difflib.SequenceMatcher(None, original, polished)
        opcodes = matcher.get_opcodes()

        # 构建原文偏移 → 新文本偏移的映射
        # 对于 equal 段: 原文[i1:i2] 对应 新文[j1:j2]
        # 对于 replace/insert/delete: 记录变更区域

        # 为每个 Run 重新计算对应的新文本片段
        modifications: list[RunModification] = []

        for run in runs_info:
            new_run_text = DiffCalculator._compute_new_run_text(
                run, opcodes, original, polished
            )
            if new_run_text != run.text:
                modifications.append(
                    RunModification(run_index=run.index, new_text=new_run_text)
                )

        return modifications

    @staticmethod
    def _compute_new_run_text(
        run: "RunInfo",
        opcodes: list,
        original: str,
        polished: str,
    ) -> str:
        """计算单个 Run 在润色后对应的新文本

        遍历 opcodes，对于落在此 Run 范围内的操作，
        构建新的文本内容。
        """
        run_start = run.start_offset
        run_end = run.end_offset
        result_parts: list[str] = []

        for tag, i1, i2, j1, j2 in opcodes:
            # 计算此 opcode 与当前 Run 的交集
            overlap_start = max(i1, run_start)
            overlap_end = min(i2, run_end)

            if overlap_start >= overlap_end and tag != "insert":
                # 无交集（insert 特殊处理）
                if tag == "insert" and i1 >= run_start and i1 <= run_end:
                    # insert 发生在此 Run 范围内
                    pass
                else:
                    continue

            if tag == "equal":
                # equal 段：保留对应的原文
                if overlap_start < overlap_end:
                    result_parts.append(original[overlap_start:overlap_end])

            elif tag == "replace":
                if overlap_start < overlap_end:
                    # 计算替换文本中对应的部分
                    # 按比例分配新文本（简化：如果修改完全在此 Run 内，取完整替换文本）
                    if i1 >= run_start and i2 <= run_end:
                        # 修改完全在此 Run 内
                        result_parts.append(polished[j1:j2])
                    elif i1 >= run_start:
                        # 修改起始于此 Run，跨越到后续 Run
                        result_parts.append(polished[j1:j2])
                    elif i2 <= run_end:
                        # 修改起始于前面的 Run，结束在此 Run
                        # 前面的 Run 已处理了替换文本，此处不再添加
                        pass
                    else:
                        # 修改横跨此 Run（整个 Run 在修改范围内）
                        # 由第一个受影响的 Run 处理
                        pass

            elif tag == "delete":
                # 删除段：不输出任何文本
                pass

            elif tag == "insert":
                # 插入段：在插入点添加新文本
                if i1 >= run_start and i1 <= run_end:
                    # 只在第一个匹配的 Run 中插入
                    if i1 == run_start or (i1 > run_start and i1 < run_end):
                        result_parts.append(polished[j1:j2])
                    elif i1 == run_end and run.index == len(run.text) - 1:
                        # Run 末尾插入（仅最后一个 Run）
                        result_parts.append(polished[j1:j2])

        return "".join(result_parts)
