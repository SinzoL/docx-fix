"""
fixer 子包共享常量
"""

NSMAP = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

# 中文字体名 ↔ 系统内部名 映射
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
    """判断两个字体名是否等价"""
    if actual == expected:
        return True
    return FONT_ALIASES.get(actual, actual) == FONT_ALIASES.get(expected, expected)
