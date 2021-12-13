from enum import Enum


class ElementType(Enum):
    ANEMO = 1  # 风
    GEO = 2  # 岩
    ELECTRO = 3  # 雷
    HYDRO = 4  # 水
    PYRO = 5  # 火
    CRYO = 6  # 冰
    DENDRO = 7  # 草
    PHYSICAL = 8  # 物理
    NONE = 9  # 无


# class ElementalResonance(Enum):
#     ANEMO = 1
#     GEO = 2
#     ELECTRO = 3
#     HYDRO = 4
#     PYRO = 5
#     CRYO = 6
#     DENDRO = 7
#     CANOPY = 8

class ElementalReactionType(Enum):
    SWIRL = 1  # 扩散
    CRYSTALLIZE = 2  # 结晶
    ELECTRO_CHARGED = 3  # 感电
    OVERLOADED = 4  # 超载
    SUPERCONDUCT = 5  # 超导
    SHATTERED = 6  # 碎冰
    FROZEN = 7  # 冻结
    VAPORIZE = 8  # 蒸发
    MELT = 9  # 融化
    BURNING = 10  # 燃烧
    # unknown
    DENDRO_HYDRO = 11
    DENDRO_CRYO = 12
    DENDRO_ELECTRO = 13
    DENDRO_GEO = 14
    DENDRO_ANEMON = 15
