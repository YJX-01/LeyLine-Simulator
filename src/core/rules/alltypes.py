from enum import Enum


class ElementType(Enum):
    '''元素类型'''
    NONE = 0 # 无
    ANEMO = 1  # 风
    GEO = 2  # 岩
    ELECTRO = 3  # 雷
    HYDRO = 4  # 水
    PYRO = 5  # 火
    CRYO = 6  # 冰
    DENDRO = 7  # 草
    PHYSICAL = 8  # 物理


class ElementalReactionType(Enum):
    '''元素反应类型'''
    NONE = 0
    # 已知
    SWIRL = 10
    # 扩散 风->元
    CRYSTALLIZE = 20
    # 结晶 岩->元
    ELECTRO_CHARGED = 34
    # 感电 水<->雷
    OVERLOADED = 35
    # 超载 火<->雷
    SUPERCONDUCT = 36
    # 超导 冰<->雷
    SHATTERED = 86
    # 碎冰 无->冻
    FROZEN = 46
    # 冻结 水<->冰
    VAPORIZE = 45
    # 蒸发 水->火
    VAPORIZE_REVERSE = 54
    # 蒸发弱 火->水
    MELT = 56
    # 融化 火->冰
    MELT_REVERSE = 65
    # 融化弱 冰->火
    BURNING = 57
    # 燃烧 火<->草
    # 未知
    DENDRO_HYDRO = 47
    DENDRO_CRYO = 67
    DENDRO_ELECTRO = 37
    DENDRO_GEO = 27
    DENDRO_ANEMON = 17


class WeaponType(Enum):
    '''武器类型'''
    SWORD = 1  # 单手剑
    CLAYMORE = 2  # 双手剑
    POLEARM = 3  # 长柄武器
    CATALYST = 4  # 法器
    BOW = 5  # 弓


class NationType(Enum):
    '''人物所属地区类型'''
    MONDSTADT = 1  # 蒙德
    LIYUE = 2  # 璃月
    INAZUMA = 3  # 稻妻
    SUMERU = 4  # 须弥
    FONTAINE = 5  # 枫丹
    NATLAN = 6  # 纳塔
    SNEZHNAYA = 7  # 至冬
    KHAENRIAH = 8  # 坎瑞亚
    OTHER = 9  # 异世界/其他


class ArtpositionType(Enum):
    '''圣遗物位置类型'''
    FLOWER = 1  # 生之花
    PLUME = 2  # 死之羽
    SANDS = 3  # 时之沙
    GOBLET = 4  # 空之杯
    CIRCLET = 5  # 理之冠


class StatType(Enum):
    ATK_PER = 1
    ATK_CONST = 2
    DEF_PER = 3
    DEF_CONST = 4
    HP_PER = 5
    HP_CONST = 6
    EM = 7
    ER = 8
    CRIT_RATE = 9
    CRIT_DMG = 10
    HEAL_BONUS = 11
    ANEMO_DMG = 12
    GEO_DMG = 13
    ELECTRO_DMG = 14
    HYDRO_DMG = 15
    PYRO_DMG = 16
    CRYO_DMG = 17
    DENDRO_DMG = 18
    PHYSICAL_DMG = 19


class SetType(Enum):
    '''圣遗物套装类型'''
    NONE = 0
    GLADIATORS_FINALE = 1  # 角斗士的终幕礼
    JUE_DOU_SHI = 1
    WANDERERS_TROUPE = 2  # 流浪大地的乐团
    YUE_TUAN = 2
    BLOODSTAINED_CHIVALRY = 3  # 染血的骑士道
    RAN_XUE = 3
    NOBLESSE_OBLIGE = 4  # 昔日宗室之仪
    ZONG_SHI = 4
    VIRIDESCENT_VENERER = 5  # 翠绿之影
    FENG_TAO = 5
    MAIDEN_BELOVED = 6  # 被怜爱的少女
    SHAO_NV = 6
    THUNDERSOOTHER = 7  # 平息鸣雷的尊者
    PING_LEI = 7
    THUNDERING_FURY = 8  # 如雷的盛怒
    RU_LEI = 8
    LAVAWALKER = 9  # 渡过烈火的贤人
    DU_HUO = 9
    CRIMSON_WITCH_OF_FLAMES = 10  # 炽烈的炎之魔女
    MO_NV = 10
    ARCHAIC_PETRA = 11  # 悠古的磐岩
    YAN_TAO = 11
    RETRACING_BOLIDE = 12  # 逆飞的流星
    NI_FEI = 12
    BLIZZARD_STRAYER = 13  # 冰风迷途的勇士
    BING_TAO = 13
    HEART_OF_DEPTH = 14  # 沉沦之心
    SHUI_TAO = 14
    TENACITY_OF_THE_MILLELITH = 15  # 千岩牢固
    QIAN_YAN = 15
    PALE_FLAME = 16  # 苍白之火
    CANG_BAI = 16
    SHIMENAWAS_REMINISCENCE = 17  # 追忆之注连
    ZHUI_YI = 17
    EMBLEM_OF_SEVERED_FATE = 18  # 绝缘之旗印
    JUE_YUAN = 18
    OCEANHUED_CLAM = 19  # 海染砗磲
    HAI_RAN = 19
    HUSK_OF_OPULENT_DREAMS = 20  # 华馆梦醒形骸记
    HUA_GUAN = 20
    # from 21 - 40 are reserved for 4 star artifacts


class PanelType(Enum):
    HP = 1
    ATK = 2
    DEF = 3
    EM = 7
    ER = 8
    CRIT_RATE = 9
    CRIT_DMG = 10
    HEAL_BONUS = 11
    HEAL_INCOME = 12
    SHIELD_STRENGTH = 13
    CD_REDUCTION = 14
    ANEMO_DMG = 15
    ANEMO_RES = 16
    GEO_DMG = 17
    GEO_RES = 18
    ELECTRO_DMG = 19
    ELECTRO_RES = 20
    HYDRO_DMG = 21
    HYDRO_RES = 22
    PYRO_DMG = 23
    PYRO_RES = 24
    CRYO_DMG = 25
    CRYO_RES = 26
    DENDRO_DMG = 27
    DENDRO_RES = 28
    PHYSICAL_DMG = 29
    PHYSICAL_RES = 30


class EventType(Enum):
    '''事件类型'''
    NONE = 0
    COMMAND = 1
    SWITCH = 2
    ACTION = 3
    DAMAGE = 4
    ENERGY = 5
    ELEMENT = 6
    TRY = 7
    CREATION = 8
    BUFF = 9
    NUMERIC = 10
    HEALTH = 11
    SHIELD = 12
    
class SkillType(Enum):
    '''技能类型'''
    NONE = 0
    NORMAL_ATK = 1
    ELEM_SKILL = 2
    ELEM_BURST = 3
    PASSIVE = 4
    CX = 5
    CREATION_TRIG = 6
    CREATION_IND = 7
    WEAPON = 8
    ARTIFACT = 9


class DamageType(Enum):
    '''造成的伤害类型'''
    NONE = 0
    NORMAL_ATK = 1
    CHARGED_ATK = 2
    PLUNGING_ATK = 3
    ELEM_SKILL = 4
    ELEM_BURST = 5


class ActionType(Enum):
    '''动作类型'''
    NONE = 0
    NORMAL_ATK = 1
    NORMAL_ATK_CHARGE = 2
    NORMAL_ATK_PLUNGE = 3
    ELEM_SKILL = 4
    ELEM_SKILL_HOLD = 5
    ELEM_BURST = 6

    JUMP = 10
    SPRINT = 11

class NumericType(Enum):
    '''数值事件的类型'''
    NONE = 0
    DAMAGE = 1
    HEALTH = 2
    SHIELD = 3

class BuffType(Enum):
    '''buff的类型'''
    NONE = 0
    ATTR = 1
    DMG = 2
    ENEMY = 3
    INFUSE = 4
    TRANS = 5
    OTHER = 6
    
class HealthType(Enum):
    '''关于血量变化的类型'''
    NONE = 0
    HEAL = 1
    LOSS = 2