"""
polisher 子包入口

提供内容润色功能的核心模块：
- TextExtractor: 段落文本提取（保留 Run 结构信息）
- PolishEngine: LLM 润色引擎（分批 + 重试 + 审核）
- DiffCalculator: 字级别 Diff 计算
- TextWriter: 润色文本回写（保留原格式）
"""

from engine.polisher.text_extractor import TextExtractor, ParagraphSnapshot, RunInfo
from engine.polisher.polish_engine import PolishEngine, PolishSuggestion, ChangeDetail
from engine.polisher.diff_calculator import DiffCalculator
from engine.polisher.text_writer import TextWriter
from engine.polisher.rule_scanner import RuleScanner

__all__ = [
    'TextExtractor', 'ParagraphSnapshot', 'RunInfo',
    'PolishEngine', 'PolishSuggestion', 'ChangeDetail',
    'DiffCalculator',
    'TextWriter',
    'RuleScanner',
]
