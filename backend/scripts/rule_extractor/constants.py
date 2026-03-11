"""
规则提取器 — 常量与工具定义

包含 XML 命名空间、字体映射、字号映射、对齐映射、
YAML 有序输出支持和终端颜色输出工具。
"""

from collections import OrderedDict
import yaml

# ===== XML 命名空间 =====
NSMAP = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

# ===== 中文字体名 ↔ 系统内部名 映射 =====
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

# ===== 半磅值 → 常见中文字号名映射 =====
HALF_PT_TO_CN_SIZE = {
    84: '初号 (42pt)',
    72: '小初 (36pt)',
    52: '一号 (26pt)',
    48: '小一 (24pt)',
    44: '二号 (22pt)',
    36: '小二 (18pt)',
    32: '三号 (16pt)',
    30: '小三 (15pt)',
    28: '四号 (14pt)',
    24: '小四 (12pt)',
    21: '五号 (10.5pt)',
    18: '小五 (9pt)',
    15: '六号 (7.5pt)',
    12: '小六 (6.5pt)',
}

# ===== Word 对齐方式映射 =====
ALIGNMENT_MAP = {
    'left': '左对齐',
    'center': '居中',
    'right': '右对齐',
    'both': '两端对齐',
    'distribute': '分散对齐',
}


# ===== YAML 有序输出支持 =====
class OrderedDumper(yaml.Dumper):
    """保持字典键顺序的 YAML Dumper"""
    pass


def _dict_representer(dumper, data):
    return dumper.represent_mapping(
        yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
        data.items()
    )


OrderedDumper.add_representer(OrderedDict, _dict_representer)


# ===== 颜色输出 =====
class Color:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    END = '\033[0m'
