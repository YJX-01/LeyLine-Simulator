import json
from typing import List, Tuple
from core.rules.alltypes import ArtifactType, StatType, SetType


class Artifact:
    def __init__(self):
        self.artifacts: List[ArtifactPiece] = []
        self.active = True


class ArtifactPiece:
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

    def __init__(self, configs: dict = {}, mode: str = 'lls') -> None:
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
