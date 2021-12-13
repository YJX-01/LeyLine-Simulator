from typing import List
from enum import Enum
import json


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
    GLADIATORS_FINALE = 1 # 角斗士的终幕礼
    JUEDOUSHI = 1
    WANDERERS_TROUPE = 2 # 流浪大地的乐团
    YUETUAN = 2
    BLOODSTAINED_CHIVALRY = 3 # 染血的骑士道
    RANXUE = 3
    NOBLESSE_OBLIGE = 4 # 昔日宗室之仪
    ZONGSHI = 4
    VIRIDESCENT_VENERER = 5 # 翠绿之影
    FENGTAO = 5
    MAIDEN_BELOVED = 6 # 被怜爱的少女
    SHAONV = 6
    THUNDERSOOTHER = 7 # 平息鸣雷的尊者
    PINGLEI = 7
    THUNDERING_FURY = 8 # 如雷的盛怒
    RULEI = 8
    LAVAWALKER = 9 # 渡过烈火的贤人
    DUHUO = 9
    CRIMSON_WITCH_OF_FLAMES = 10 # 炽烈的炎之魔女
    MONV = 10
    ARCHAIC_PETRA = 11 # 悠古的磐岩
    YANTAO = 11
    RETRACING_BOLIDE = 12 # 逆飞的流星
    NIFEI = 12
    BLIZZARD_STRAYER = 13 # 冰风迷途的勇士
    BINGTAO = 13
    HEART_OF_DEPTH = 14 # 沉沦之心
    SHUITAO = 14
    TENACITY_OF_THE_MILLELITH = 15 # 千岩牢固
    QIANYAN = 15
    PALE_FLAME = 16 # 苍白之火
    CANGBAI = 16
    SHIMENAWAS_REMINISCENCE = 17 # 追忆之注连
    ZHUIYI = 17
    EMBLEM_OF_SEVERED_FATE = 18 # 绝缘之旗印
    JUEYUAN = 18
    OCEANHUED_CLAM = 19 # 海染砗磲
    HAIRAN = 19
    HUSK_OF_OPULENT_DREAMS = 20 # 华馆梦醒形骸记
    HUAGUAN = 20
    # from 21 - 40 are reserved for 4 star artifacts




class Artifact:
    __data = dict()
    with open(r'.\docs\constant\ArtifactStat.json', 'r') as d:
        __data = json.load(d)

    def __init__(self, configs: dict) -> None:
        self.set_type: SetType = SetType(configs['set_type'])
        self.artifact_type: ArtifactType = ArtifactType(
            configs['artifact_type'])
        self.level: int = configs['level']
        self.main_stat: StatType = StatType(configs['main_stat'])
        self.sub_stat: List[StatType] = []
        self.initialize(configs)

    def initialize(self, configs: dict) -> None:
        self.__data
