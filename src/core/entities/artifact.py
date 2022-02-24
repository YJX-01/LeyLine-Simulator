import json
from collections import Counter, OrderedDict
from typing import TYPE_CHECKING, Any, List, Dict, Sequence, Union
from core.rules.alltypes import ArtpositionType, StatType, SetType
from data.artifacts import *
if TYPE_CHECKING:
    from core.entities.character import Character


class Artifact(object):
    '''
    use equip() to build real-world artifact set\\
    use virtual() / quick() to build virtual artifact set\\
    use done() to confirm and initialize buffs,
    then you can use this artifact set
    '''
    subs = ['ATK_PER', 'ATK_CONST',
            'DEF_PER', 'DEF_CONST',
            'HP_PER', 'HP_CONST',
            'EM', 'ER', 'CRIT_RATE', 'CRIT_DMG']

    positions = ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET']

    def __init__(self):
        self.artifacts: List[Union[ArtifactPiece, None]] = \
            [None, None, None, None, None]
        # ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET']
        self.piece_active: List[Union[SetType, None]] = \
            [None, None, None]
        # [2piece, 2piece, 4piece]
        self.total_sub: Dict[StatType, int] = {}
        self.active: bool = False
        self.owner: str = ''
        self.skill1 = None
        self.skill2 = None

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
        self.update()

    def virtual(self):
        pass

    def quick(self, character: 'Character', **kwargs):
        pass

    def done(self):
        if self.total_sub:
            n = sum([1 for a in self.artifacts if a])
            n += sum([1 for p in self.piece_active if p])
        if n:
            self.active = True
            for i, p in enumerate(self.piece_active):
                piece_n = i*2 if i else 2
                if p and not self.skill1:
                    exec('self.skill1 = {}_Piece{}(self)'.format(p.name, piece_n))
                elif p and not self.skill2:
                    exec('self.skill2 = {}_Piece{}(self)'.format(p.name, piece_n))
        else:
            self.active = False
            raise Exception('this artifact set is invalid')

    def set_owner(self, owner: str):
        try:
            self.owner = owner
            self.done()
        except:
            raise Exception('invalid artifact set can\'t set owner')

    def work(self, simulation: 'Simulation', event: 'Event'):
        if not self.active:
            raise Exception('invalid artifact can\'t work')
        if self.skill1:
            self.skill1(simulation, event)
        if self.skill2:
            self.skill2(simulation, event)


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

    pinyin_input = {
        'set': {
            'juedoushi': 1, 'yuetuan': 2
        },
        'pos': {
            'hua': 1, 'fl': 1,
            'mao': 2, 'yu': 2, 'pl': 2,
            'sha': 3, 'sand': 3,
            'bei': 4, 'gob': 4,
            'guan': 5, 'tou': 5, 'cir': 5
        },
        'stat': {
            'dgj': 1, 'aa': 1,
            'xgj': 2, 'a': 2,
            'dfy': 3, 'dd': 3,
            'xfy': 4, 'd': 4,
            'dsm': 5, 'hh': 5,
            'xsm': 6, 'h': 6,
            'jing': 7, 'em': 7,
            'chong': 8, 'er': 8,
            'bj': 9, 'cr': 9,
            'bs': 10, 'cd': 10,
            'zhi': 11, 'heal': 11,
            'feng': 12, 'anemo': 12,
            'yan': 13, 'geo': 13,
            'lei': 14, 'elec': 14,
            'shui': 15, 'hydro': 15,
            'huo': 16, 'pyro': 16,
            'bing': 17, 'cryo': 17,
            'cao': 18, 'den': 18,
            'wu': 19, 'phy': 19
        }
    }

    def __init__(self, configs: Union[dict, str], mode: str = 'lls') -> None:
        self.rarity: int = 5
        self.level: int = 20
        self.set_type: SetType = SetType(1)
        self.pos_type: ArtpositionType = ArtpositionType(1)
        self.main_stat: StatType = StatType(1)
        self.sub_stat: Dict[StatType, int] = OrderedDict()
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
        main_name = self.main_stat.name
        if 'DMG' in main_name and main_name != 'PHYSICAL_DMG':
            main_name = 'ELEM_DMG'
        val[self.main_stat.name] = self.art_data['main_stat'][str(
            self.rarity)][main_name][self.level]
        for sub, num in self.sub_stat.items():
            val[sub.name] = num * \
                self.art_data['sub_stat'][str(self.rarity)][sub.name][-1]/10
        return val

    def quick(self, **kwargs):
        '''
        快速输入:\\
        默认20级五星圣遗物\n
        支持通过英文简写和拼音输入
        #### 套装(tao/s) 位置(wei/p) 主词条(zhu/m)
        ### 位置:
        花(hua/fl) 羽毛(mao/yu/pl) 沙(sha/sand) 杯(bei/gob) 冠/头(guan/tou/cir)
        ### 主词条规则:
        花羽不用输入
        大攻击(dgj/aa) 大防御(dfy/dd) 大生命(dsm/hh)
        充能(chong/er) 精通(jing/em) 暴击率(bj/cr) 暴击伤害(bs/cd)
        风伤(feng/anemo) 岩伤(yan/geo) 雷伤(lei/elec)
        水伤(shui/hydro) 火伤(huo/pyro) 冰伤(bing/cryo)
        物伤(wu/phy) 治疗加成(zhi/heal)
        ### 副词条规则:
        小攻击(xgj/a) 小防御(xfy/d) 小生命(xsm/h)
        大攻击(dgj/aa) 大防御(dfy/dd) 大生命(dsm/hh)
        充能(chong/er) 精通(jing/em) 暴击率(bj/cr) 暴击伤害(bs/cd)
        ### 套装对照
        角斗士的终幕礼(juedoushi) 流浪大地的乐团(yuetuan)
        '''
        for k, v in kwargs.items():
            if k == 'tao' or k == 's':
                self.set_type = SetType(self.pinyin_input['set'][v])
            elif k == 'wei' or k == 'p':
                self.pos_type = ArtpositionType(self.pinyin_input['pos'][v])
                if self.pinyin_input['pos'][v] == 1:
                    self.main_stat = StatType['HP_CONST']
                elif self.pinyin_input['pos'][v] == 2:
                    self.main_stat = StatType['ATK_CONST']
            elif k == 'zhu' or k == 'm':
                self.main_stat = StatType(self.pinyin_input['stat'][v])
            else:
                stat = StatType(self.pinyin_input['stat'][k])
                unit = self.art_data['sub_stat']['5'][stat.name][-1]/10
                self.sub_stat[stat] = round(v/unit)

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
