"""
跨子包共享常量

NSMAP、W、FONT_ALIASES、fonts_match、Color 在 checker / fixer /
rule_extractor / text_convention 四个子包中完全重复，此处统一定义。
"""

# ===== XML 命名空间 =====
NSMAP = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

# ===== 中文字体名 ↔ 系统内部名 映射（等价关系） =====
FONT_ALIASES = {
    'SimHei': '黑体', '黑体': '黑体',
    'SimSun': '宋体', '宋体': '宋体',
    'STXinwei': '华文新魏', '华文新魏': '华文新魏',
    'STKaiti': '华文楷体', '华文楷体': '华文楷体',
    'STSong': '华文宋体', '华文宋体': '华文宋体',
    'STFangsong': '华文仿宋', '华文仿宋': '华文仿宋',
    'KaiTi': '楷体', '楷体': '楷体',
    'FangSong': '仿宋', '仿宋': '仿宋',
    'Microsoft YaHei': '微软雅黑', '微软雅黑': '微软雅黑',
}


def fonts_match(actual, expected):
    """比较两个字体名是否等价（考虑中英文别名）"""
    if actual == expected:
        return True
    return FONT_ALIASES.get(actual, actual) == FONT_ALIASES.get(expected, expected)


# ===== 颜色输出 =====
class Color:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    END = '\033[0m'
