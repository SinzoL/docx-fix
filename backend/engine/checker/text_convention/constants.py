"""
文本排版检查 — 常量定义

包含所有正则表达式、字符集、映射表等常量。
"""

import re

from engine.shared_constants import NSMAP, W  # noqa: F401

# ===== CJK 字符正则 =====
# 覆盖主要中日韩统一表意文字区段
CJK_RE = re.compile(
    r'[\u4e00-\u9fff'       # CJK Unified Ideographs
    r'\u3400-\u4dbf'        # CJK Unified Ideographs Extension A
    r'\u2e80-\u2eff'        # CJK Radicals Supplement
    r'\u3000-\u303f'        # CJK Symbols and Punctuation
    r'\uf900-\ufaff'        # CJK Compatibility Ideographs
    r'\ufe30-\ufe4f'        # CJK Compatibility Forms
    r'\U00020000-\U0002a6df'  # CJK Unified Ideographs Extension B
    r']'
)

# CJK 基本表意文字（用于占比判断，不含符号）
CJK_IDEO_RE = re.compile(
    r'[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\U00020000-\U0002a6df]'
)

# ===== 标点字符集 =====
CN_PUNCT = set('，。、；：！？""''（）【】《》〈〉『』「」〔〕…—～·')
EN_PUNCT_IN_CN = set(',.;:!?()')

# ===== 括号配对 =====
BRACKET_PAIRS = {
    '（': '）', '）': '（',
    '(': ')', ')': '(',
    '【': '】', '】': '【',
    '[': ']', ']': '[',
    '｛': '｝', '｝': '｛',
    '{': '}', '}': '{',
    '《': '》', '》': '《',
    '〈': '〉', '〉': '〈',
}

OPEN_BRACKETS = {'（', '(', '【', '[', '｛', '{', '《', '〈'}
CLOSE_BRACKETS = {'）', ')', '】', ']', '｝', '}', '》', '〉'}

# ===== 引号配对 =====
OPEN_QUOTES = {'\u201c', '\u2018'}   # " '
CLOSE_QUOTES = {'\u201d', '\u2019'}  # " '

# ===== 正则模式 =====
# 连续标点（排除 ！！、？？、……）
DUPLICATE_PUNCT_RE = re.compile(
    r'([。，、；：])\1+'  # 中文标点连续
    r'|'
    r'(?<!\.)\.\.(?!\.)'  # 英文两个连续点（非省略号上下文）
)

# 中文之间多余空格
CJK_SPACE_CJK_RE = re.compile(
    r'([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])'
    r'(\s+)'
    r'([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])'
)

# 连续多个空格
MULTI_SPACE_RE = re.compile(r'[ ]{2,}')

# 全角空格
FULLWIDTH_SPACE = '\u3000'

# URL / 邮箱
URL_RE = re.compile(r'https?://\S+|www\.\S+|\S+@\S+\.\S+', re.IGNORECASE)

# 代码样式关键字
CODE_STYLE_KEYWORDS = {'code', '代码'}
