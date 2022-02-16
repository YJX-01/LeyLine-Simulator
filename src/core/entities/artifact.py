import json
from collections import Counter
from typing import Any, List, Dict, Sequence, Union
from core.rules.alltypes import ArtpositionType, StatType, SetType


class Artifact(object):
    subs = ['ATK_PER', 'ATK_CONST',
            'DEF_PER', 'DEF_CONST',
            'HP_PER', 'HP_CONST',
            'EM', 'ER', 'CRIT_RATE', 'CRIT_DMG']

    positions = ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET']

    def __init__(self) -> None:
        self.artifacts: List[Union[ArtifactPiece, None]] = \
            [None, None, None, None, None]
        # ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET']
        self.piece_active: List[Union[SetType, None]] = \
            [None, None, None]
        # [2piece, 2piece, 4piece]
        self.total_sub: Dict[StatType, int] = {}
        self.active = True

    def update(self) -> None:
        self.total_sub = dict.fromkeys([StatType(i) for i in range(1, 11)], 0)
        for a in self.artifacts:
            if not a:
                continue
            for k, v in a.sub_stat.items():
                self.total_sub[k] += v

        cnt = Counter([a.set_type for a in self.artifacts if a]).most_common(3)
        for set_name, set_cnt in cnt:
            if set_cnt >= 4:
                self.piece_active[2] = set_name
                self.piece_active[0] = set_name
                break
            elif 4 > set_cnt >= 2 and not self.piece_active[0]:
                self.piece_active[0] = set_name
            elif 4 > set_cnt >= 2 and not self.piece_active[1]:
                self.piece_active[1] = set_name

    def equip(self, *artifacts):
        for artifact in artifacts:
            if isinstance(artifact, Sequence):
                for a in artifact:
                    if isinstance(a, ArtifactPiece):
                        self.artifacts[a.pos_type.value-1] = a
            elif isinstance(artifact, ArtifactPiece):
                self.artifacts[artifact.pos_type.value-1] = artifact


class ArtifactPiece(object):
    with open(r'.\docs\constant\ArtifactStat.json', 'r') as d:
        art_data: Dict[str, Any] = json.load(d)

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

    def __init__(self, configs: Union[dict, str], mode: str = 'lls') -> None:
        self.rarity: int = 5
        self.level: int = 20
        self.set_type: SetType = SetType(1)
        self.pos_type: ArtpositionType = ArtpositionType(1)
        self.main_stat: StatType = StatType(1)
        self.sub_stat: Dict[StatType, int] = {}
        self.initialize(configs, mode)

    def initialize(self, configs: Union[dict, str], mode: str) -> None:
        if not configs:
            return

        if mode == 'lls' and isinstance(configs, dict):
            for k, v in configs.items():
                self.__setattr__(k, v)

        elif mode == 'lls' and isinstance(configs, str):
            item_list = configs.strip(';').split('@')
            self.set_type = SetType[item_list[0]]
            self.pos_type = ArtpositionType[item_list[1]]
            self.main_stat = StatType[item_list[2].strip('[]')]
            for sub in item_list[3].strip('[],').split(','):
                sub_name, sub_value = tuple(sub.split(':'))
                self.sub_stat[StatType[sub_name]] = int(sub_value)
            self.level = int(item_list[4].strip('LV'))
            self.rarity = int(item_list[5][-1])

        elif mode == 'mona':
            self.rarity = configs['star']
            self.level = configs['level']
            sub_stat_reference = self.art_data['sub_stat'][str(self.rarity)]
            name_pats = [(s_type.name.split('_'), s_type.value)
                         for s_type in SetType]
            for name in name_pats:
                pat: List[str] = name[0]
                if sum([n.rstrip('S') in configs['setName'].upper() for n in pat]) >= 2:
                    self.set_type = SetType(name[1])
                    break
            self.pos_type = ArtpositionType(
                self.__translation_mona[configs['position']])
            self.main_stat = StatType[
                self.__translation_mona[configs['mainTag']['name']]]
            for sub in configs['normalTags']:
                n = self.__translation_mona[sub['name']]
                if n in ['ATK_CONST', 'DEF_CONST', 'HP_CONST', 'EM']:
                    self.sub_stat[StatType[n]] = round(
                        sub['value']/(sub_stat_reference[n][-1]/10))
                else:
                    self.sub_stat[StatType[n]] = round(
                        100*sub['value']/(sub_stat_reference[n][-1]/10))

    def value_data(self):
        val = {}
        val[self.main_stat.name] = self.art_data['main_stat'][str(
            self.rarity)][self.main_stat.name][self.level]
        for sub, num in self.sub_stat.items():
            val[sub.name] = num * \
                self.art_data['sub_stat'][str(self.rarity)][sub.name][-1]/10
        return val

    def __repr__(self) -> str:
        nickname = dict([(member.name, name)
                         for name, member in SetType.__members__.items() if member.name != name])
        n = nickname[self.set_type.name]
        s1 = '{}@{}@[{}]@['.format(
            n, self.pos_type.name, self.main_stat.name)
        s2 = ''.join(['{}:{},'.format(k.name, v)
                     for k, v in self.sub_stat.items()])
        s3 = ']@LV{}@STAR{};'.format(self.level, self.rarity)
        return s1+s2+s3
