import json
from typing import List, Tuple
from enum import Enum


class Artifact:
    def __init__(self):
        self.artifacts: List[ArtifactPiece] = []
        self.active = True


class ArtifactPiece:
    __data = dict()
    with open(r'.\docs\constant\ArtifactStat.json', 'r') as d:
        __data = json.load(d)

    __translation_mona = {
        "critical": "CRIT_RATE",
        "criticalDamage": "CRIT_DMG",
        "lifePercentage": "HP_PER",
        "lifeStatic": "HP_CONST",
        "attackPercentage": "ATK_PER",
        "attackStatic": "ATK_CONST",
        "defendPercentage": "DEF_PER",
        "defendStatic": "DEF_CONST",
        "elementalMastery": "EM",
        "recharge": "ER",
        'windBonus': 'ANEMO_DMG',
        'rockBonus': 'GEO_DMG',
        'thunderBonus': 'ELECTRO_DMG',
        'waterBonus': 'HYDRO_DMG',
        'fireBonus': 'PYRO_DMG',
        'iceBonus': 'CRYO_DMG',
        'physicalBonus': 'PHYSICAL_DMG',
        'cureEffect': 'HEAL_BONUS',
        'flower': 1,
        'feather': 2,
        'sand': 3,
        'cup': 4,
        'head': 5
    }

    def __init__(self, configs: dict, mode: str) -> None:
        self.rarity: int = 5
        self.level: int = 20
        self.set_type: SetType = SetType(1)
        self.artifact_type: ArtifactType = ArtifactType(1)
        self.main_stat: StatType = StatType(1)
        self.sub_stat: List[Tuple[StatType, int]] = []
        self.initialize(configs, mode)

    def initialize(self, configs: dict, mode: str) -> None:
        if mode == 'lls':
            for k, v in configs.items():
                self.__setattr__(k, v)
        elif mode == 'mona':
            self.rarity = configs['star']
            self.level = configs['level']
            sub_stat_reference = self.__data['sub_stat'][str(self.rarity)]
            name_pats = [(s_type.name.split('_'), s_type.value)
                         for s_type in SetType]
            for name in name_pats:
                pat: List[str] = name[0]
                if sum([n.rstrip('S') in configs['setName'].upper() for n in pat]) >= 2:
                    self.set_type = SetType(name[1])
                    break
            self.artifact_type = ArtifactType(
                self.__translation_mona[configs['position']])
            self.main_stat = StatType[
                self.__translation_mona[configs['mainTag']['name']]]
            for sub in configs['normalTags']:
                n = self.__translation_mona[sub['name']]
                if n in ['ATK_CONST', 'DEF_CONST', 'HP_CONST', 'EM']:
                    self.sub_stat.append((
                        StatType[n],
                        round(sub['value']/(sub_stat_reference[n][-1]/10))
                    ))
                else:
                    self.sub_stat.append((
                        StatType[n],
                        round(100*sub['value']/(sub_stat_reference[n][-1]/10))
                    ))

    def __repr__(self) -> str:
        nickname = dict([(member.name, name)
                         for name, member in SetType.__members__.items() if member.name != name])
        n = nickname[self.set_type.name]
        s1 = '{}@{}@[{}]@['.format(
            n, self.artifact_type.name, self.main_stat.name)
        s2 = ''.join(['{}:{},'.format(sub[0].name, sub[1])
                     for sub in self.sub_stat])
        s3 = ']@LV{}@{}STAR;'.format(self.level, self.rarity)
        return s1 + s2 + s3


class ArtifactType(Enum):
    FLOWER = 1
    PLUME = 2
    SANDS = 3
    GOBLET = 4
    CIRCLET = 5


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

