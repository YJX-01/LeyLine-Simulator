import json
from collections import Counter
from itertools import combinations_with_replacement, combinations
from typing import Callable, Mapping, Sequence, Dict, List, Any, Tuple, Union
from unittest import result
from core.entities.artifact import Artifact, ArtifactPiece
from core.entities.weapon import Weapon
from core.rules import DNode
from core.simulation.event import Event
from data.characters.albedo.albedo_draft import *


class Character(object):
    def __init__(self) -> None:
        self.base: CharacterBase = CharacterBase()
        self.attribute: CharacterAttribute = CharacterAttribute()
        self.action: CharacterAction = CharacterAction()
        self.artifact: Artifact = Artifact()
        self.weapon: Weapon = Weapon()

    def initialize(self, **configs) -> None:
        if 'name' in configs.keys():
            self.base.choose(configs['name'])
            self.action.attach_skill(configs['name'])
        if 'lv' in configs.keys() and 'asc' in configs.keys() and self.base.name:
            self.base.set_lv(configs['lv'], configs['asc'])
        return

    def equip(self, *items) -> None:
        for item in items:
            if not item:
                continue
            elif isinstance(item, Weapon):
                self.weapon = item
            elif isinstance(item, Artifact):
                self.artifact = item
            else:
                self.artifact.equip(item)
        self.update()

    def update(self) -> None:
        self.attribute.update_base(self.base)
        self.attribute.update_weapon(self.weapon)
        self.attribute.update_artifact(self.artifact)

    def virtual_artifact(self, panel: Dict[str, Any]):
        '''
        panel: Dict[str, Any] = 
        {
            'main' : ['main_stat'...] # 'SANDS', 'GOBLET', 'CIRCLET'
            'sub_stat': sub_stat_value
            'sub_stat_const': ATK_CONST, HP_CONST, DEF_CONST
        }
        WARNING: only for +20 5-star artifacts
        '''
        def deduce_stat(stat, panel: Dict[str, Any]) -> int:
            main_v = panel['main'].count(stat) * \
                ArtifactPiece.art_data['main_stat']['5'][stat][-1]
            flat_v = ArtifactPiece.art_data['sub_stat']['5'][stat][-1] / 10
            val = round((panel[stat]-main_v)/flat_v)
            return val

        def deduce_stat_special(stat, panel: Dict[str, Any]) -> List[Tuple]:
            tmp_stat: List[str] = ['ATK_CONST', 'HP_CONST'] + panel['main']
            main_v = tmp_stat.count(f'{stat}_PER') *\
                (getattr(self.base, stat) + getattr(self.weapon.base, stat, 0)) *\
                ArtifactPiece.art_data['main_stat']['5'][f'{stat}_PER'][-1]/100
            if f'{stat}_CONST' in tmp_stat:
                main_v += ArtifactPiece.art_data['main_stat']['5'][f'{stat}_CONST'][-1]

            flat_v = ArtifactPiece.art_data['sub_stat']['5'][f'{stat}_CONST'][-1]/10

            per_v = (getattr(self.base, stat) + getattr(self.weapon.base, stat, 0)
                     ) * ArtifactPiece.art_data['sub_stat']['5'][f'{stat}_PER'][-1]/1000

            n_flat = round(panel.get(f'{stat}_CONST', 0)/flat_v)
            n_per = round((panel[stat]-main_v-n_flat*flat_v)/per_v)
            if round(main_v+n_flat*flat_v+n_per*per_v) != panel[stat]:
                print('WARNING: not precise')
            return n_per, n_flat

        # deduce true stat values
        panel_main = ['ATK', 'DEF', 'HP', 'EM', 'ER', 'CRIT_RATE', 'CRIT_DMG']
        sub_stat_value = dict.fromkeys(Artifact.subs, 0)
        for stat in panel_main:
            if stat in ['ATK', 'DEF', 'HP']:
                choice_stat = deduce_stat_special(stat, panel)
                sub_stat_value[f'{stat}_PER'] = choice_stat[0]
                sub_stat_value[f'{stat}_CONST'] = choice_stat[1]
            else:
                sub_stat_value[stat] = deduce_stat(stat, panel)

        # list possible combinations
        def upgrade_combination(n, limitation=[]):
            upgrade_result: List[List[int]] = []
            for sep in combinations_with_replacement(range(n+1), 3):
                upgrade_result_one = [sep[0], sep[1]-sep[0],
                                      sep[2]-sep[1], n-sep[2]]
                if not limitation or all([limitation[i] >= upgrade_result_one[i] for i in range(3)]):
                    upgrade_result.append(upgrade_result_one)
            return upgrade_result

        def value_combination():
            result: List[List[int]] = []
            for init_num in [8, 9]:
                for up_result in upgrade_combination(init_num-4):
                    stat_num = [1+up_result[i] for i in range(4)]
                    for n in range(3*init_num+1):
                        for up_value_result in upgrade_combination(n, [3*k for k in stat_num]):
                            stat_value = [stat_num[i]*7+up_value_result[i]
                                          for i in range(4)]
                            result.append(stat_value)
            return result

        value_comb = value_combination()

        # solve a pseudo-sudoku problem
        def sudoku_like(virtual_artifact: List[Union[None, ArtifactPiece]] = [None, None, None, None, None], limitation={}):
            if all(virtual_artifact):
                return virtual_artifact
            # find next empty position
            result: List[Union[None, ArtifactPiece]] = [
                None, None, None, None, None
            ]
            init_cnt = Counter()
            pos_index = 0
            for i, a in enumerate(virtual_artifact):
                if not a:
                    pos_index = i
                    break
                else:
                    result[i] = virtual_artifact[i]
                    init_cnt += Counter(virtual_artifact[i].sub_stat)
            # list all possibilities
            tmp_stat: List[str] = ['ATK_CONST', 'HP_CONST'] + panel['main']
            remain_cnt = Counter(limitation) - init_cnt
            for stat_choice in combinations([s for s in Artifact.subs
                                             if s != tmp_stat[pos_index] and remain_cnt[StatType[s]] >= 7], 4):
                failure_time = 0
                failure_max = len(value_comb)
                for i, val in enumerate(value_comb):
                    init_dict = {}
                    # check validity
                    init_dict['sub_stat'] = dict(
                        zip(map(lambda x: StatType[x], stat_choice), val))
                    cnt = Counter(init_dict['sub_stat']) + init_cnt
                    if all([cnt[k] <= v for k, v in limitation.items()]):
                        init_dict['artifact_type'] = ArtifactType(pos_index+1)
                        init_dict['main_stat'] = StatType[tmp_stat[pos_index]]
                        a = ArtifactPiece(init_dict)
                        print('find one', a)
                        result[pos_index] = a
                        tmp_result = sudoku_like(result, limitation)
                        tmp_cnt = sum([Counter(t_a.sub_stat)
                                      for t_a in tmp_result])
                        if all(tmp_result) and all([tmp_cnt[k] == v for k, v in limitation.items()]):
                            result = tmp_result
                            break
                        else:
                            print('try once')
                    else:
                        failure_time_tmp = round(i*10/failure_max)
                        if failure_time_tmp > failure_time:
                            failure_time = failure_time_tmp
                            print(pos_index, f'{failure_time}0%')
            return result

        limit = dict([(StatType[k], v) for k, v in sub_stat_value.items()])
        result = sudoku_like(limitation=limit)
        return result


class CharacterBase(object):
    with open('./docs/constant/CharacterLevelMultiplier.json', 'r') as f:
        __lv_curve = json.load(f)
    with open('./docs/constant/CharacterConfig.json', 'r') as f:
        __char_info = json.load(f)

    def __init__(self, **configs):
        self.name: str = ''
        self.rarity: str = ''
        self.weapon: int = 0
        self.element: int = 0
        self.region: int = 0
        self.lv: int = 0
        self.asc: int = 0
        self.asc_info: Mapping[str, List[float]] = {}
        self.HP_BASE: float = 0
        self.ATK_BASE: float = 0
        self.DEF_BASE: float = 0
        self.HP: float = 0
        self.ATK: float = 0
        self.DEF: float = 0
        self.EXTRA: Sequence[str, float] = ['', 0]
        self.initialize(**configs)

    def initialize(self, **configs) -> None:
        if 'name' in configs.keys():
            self.choose(configs['name'])
        if 'lv' in configs.keys() and 'asc' in configs.keys() and self.name:
            self.set_lv(configs['lv'], configs['asc'])

    def choose(self, name: str) -> None:
        self.name = name
        for c in self.__char_info:
            if c['name'] == name:
                self.rarity = str(c['rarity'])
                self.weapon = c['weapon']
                self.element = c['element']
                self.region = c['region']
                self.HP_BASE = c['HP_BASE']
                self.ATK_BASE = c['ATK_BASE']
                self.DEF_BASE = c['DEF_BASE']
                self.asc_info = c['asc']
                return

    def set_lv(self, lv: int, asc: bool) -> None:
        if not self.name:
            return
        self.lv = lv
        self.asc = self.set_asc(lv, asc)
        lv_list = self.__lv_curve[self.rarity]
        self.HP = self.HP_BASE * lv_list[self.lv]
        self.ATK = self.ATK_BASE * lv_list[self.lv]
        self.DEF = self.DEF_BASE * lv_list[self.lv]
        if self.asc:
            self.HP += self.asc_info['HP_BASE'][self.asc-1]
            self.ATK += self.asc_info['ATK_BASE'][self.asc-1]
            self.DEF += self.asc_info['DEF_BASE'][self.asc-1]
            for k in self.asc_info.keys():
                if 'BASE' not in k:
                    self.EXTRA[0] = k
                    self.EXTRA[1] = self.asc_info[k][self.asc-1]
                    break

    @staticmethod
    def set_asc(lv: int, asc: bool) -> int:
        if lv <= 20:
            return (lv + int(asc))//21
        elif (20 < lv < 40):
            return lv // 20
        elif (lv % 10 != 0):
            return lv // 10 - 2
        else:
            return min(lv // 10 - 3 + int(asc), 6)

    def show(self) -> None:
        print('Name:{}\nLv:{}\nHP:{:.3f} / ATK:{:.3f} / DEF:{:.3f} / {}:{:.3f}'.format(
            self.name, self.lv,
            self.HP, self.ATK, self.DEF, self.EXTRA[0], self.EXTRA[1]))


class CharacterAction(object):
    def __init__(self) -> None:
        '''
        属性:
        \tNORMAL_ATK_count: 普通攻击计数\n
        \tELEM_SKILL_count: 元素战技计数\n
        \tELEM_BURST_count: 元素爆发计数\n
        '''
        # battle action
        self.NORMAL_ATK_count: int = 1
        self.ELEM_SKILL_count: int = 1
        self.ELEM_BURST_count: int = 1
        self.NORMAL_ATK: Callable = None
        self.ELEM_SKILL: Callable = None
        self.ELEM_BURST: Callable = None
        self.PASSIVE: Callable = None
        self.CX: Callable = None
        # numeric action
        self.use_artifact: Callable = None
        self.use_weapon: Callable = None

    # TODO: 附加技能

    def attach_skill(self, name=''):
        if name == 'Albedo':
            self.NORMAL_ATK = Albedo_NORMAL_ATK
            self.ELEM_SKILL = Albedo_ELEM_SKILL


class CharacterAttribute(object):
    def __init__(self) -> None:
        '''
        include panel attributes:\n
        \tATK | DEF | HP | EM | ER | CRIT_RATE | CRIT_DMG\n
        \tHEAL_BONUS | HEAL_INCOME | SHIELD_STRENGTH | CD_REDUCTION\n
        \tELEM_DMG... | ELEM_RES...\n
        and other character attributes:\n
        \tENERGY | STAMINA | STAMINA_CONSUMPTION\n
        \tATK_SPD | MOVE_SPD | INTERRUPT_RES | DMG_REDUCTION\n
        '''
        # panel attributes
        self.ATK: DNode = self.tree_expr('ATK')
        self.DEF: DNode = self.tree_expr('DEF')
        self.HP: DNode = self.tree_expr('HP')
        self.EM = DNode('Total EM', '+')
        self.ER = DNode('Total ER', '+')
        self.CRIT_RATE = DNode('Total CRIT_RATE', '+')
        self.CRIT_DMG = DNode('Total CRIT_DMG', '+')
        self.HEAL_BONUS = DNode('Total HEAL_BONUS', '+')
        self.HEAL_INCOME = DNode('Total HEAL_INCOME', '+')
        self.SHIELD_STRENGTH = DNode('Total SHIELD_STRENGTH', '+')
        self.CD_REDUCTION = DNode('Total CD_REDUCTION', '+')
        self.ANEMO_DMG = DNode('Total ANEMO_DMG', '+')
        self.GEO_DMG = DNode('Total GEO_DMG', '+')
        self.ELECTRO_DMG = DNode('Total ELECTRO_DMG', '+')
        self.HYDRO_DMG = DNode('Total HYDRO_DMG', '+')
        self.PYRO_DMG = DNode('Total PYRO_DMG', '+')
        self.CRYO_DMG = DNode('Total CRYO_DMG', '+')
        self.DENDRO_DMG = DNode('Total DENDRO_DMG', '+')
        self.PHYSICAL_DMG = DNode('Total PHYSICAL_DMG', '+')
        # other attributes
        self.ENERGY: float = 0
        self.STAMINA: float = 0
        self.STAMINA_CONSUMPTION: float = 0
        self.ATK_SPD: float = 0
        self.MOVE_SPD: float = 0
        self.INTERRUPT_RES: float = 0
        self.DMG_REDUCTION: float = 0

    def tree_expr(self, stat: str) -> DNode:
        root = DNode(f'Total {stat}', '+')
        root.extend([
            DNode(f'Scaled {stat}', '*').extend([
                DNode(f'{stat} Base', '+').extend([
                    DNode(f'Charater {stat} Base'),
                    DNode(f'Weapon {stat} Base')
                ]),
                DNode(f'{stat} Scalers', '+').extend([
                    DNode('Artifact Scalers', '+').extend([
                        DNode('Main Stat Scaler', '+'),
                        DNode('Sub Stat Scaler', '+')
                    ]),
                    DNode('Bonus Scalers', '+'),
                    DNode('Weapon Scaler', '%'),
                    DNode('Ascension Scaler', '%')
                ])
            ]),
            DNode(f'Flat {stat}', '+').extend([
                DNode('Artifact Flat', '+'),
                DNode('Bonus Flat', '+')
            ]),
            DNode(f'Bonus {stat}', '+').extend([
                DNode(f'Skill Transform {stat}', '*').extend([
                    DNode('Skill Transform Stat'),
                    DNode('Skill Transform Scaler', '%')
                ]),
                DNode(f'Weapon Transform {stat}', '*').extend([
                    DNode('Weapon Transform Stat'),
                    DNode('Weapon Transform Scaler', '%')
                ])
            ])
        ])
        return root

    def update_base(self, base: CharacterBase):
        for k in ['ATK', 'DEF', 'HP']:
            self.__dict__[k].modify(
                'Charater {} Base'.format(k), num=base.__dict__[k])

    def update_weapon(self, weapon: Weapon):
        self.ATK.modify('Weapon ATK Base', num=weapon.base.ATK)

    def update_artifact(self, artifact: Artifact) -> None:
        for s in ['ATK', 'DEF', 'HP', 'EM', 'ER', 'CRIT_RATE', 'CRIT_DMG', 'HEAL_BONUS',
                  'ANEMO_DMG', 'GEO_DMG', 'ELECTRO_DMG', 'HYDRO_DMG', 'PYRO_DMG', 'CRYO_DMG',
                  'PHYSICAL_DMG']:
            que: List[DNode] = []
            que.append(self.__dict__[s])
            while(que):
                p = que.pop(0)
                if not p.leaf:
                    for i, c in enumerate(p.child):
                        for k in ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET']:
                            if k in c.key:
                                del p.child[i]
                    que.extend(p.child)

        for pos_index, art_piece in enumerate(artifact.artifacts):
            if not art_piece:
                continue
            val = art_piece.value_data()

            main_name = art_piece.main_stat.name
            main_key = 'Main {} {}'.format(
                art_piece.artifact_type.name, main_name)
            main_value = val[art_piece.main_stat.name]
            if 'CONST' in main_name or 'PER' in main_name:
                main_name = main_name.split('_')[0]
            if 'PER' in art_piece.main_stat.name:
                self.__dict__[main_name].find('Main Stat Scaler').insert(
                    DNode(main_key, '%', main_value))
            elif 'CONST' in art_piece.main_stat.name:
                self.__dict__[main_name].find('Artifact Flat').insert(
                    DNode(main_key, '', main_value))
            elif main_name == 'EM':
                self.__dict__[main_name].insert(
                    DNode(main_key, '', main_value))
            else:
                self.__dict__[main_name].insert(
                    DNode(main_key, '%', main_value))

            for sub, sub_num in val.items():
                if sub == art_piece.main_stat.name:
                    continue
                sub_key = 'Sub {} {}'.format(art_piece.artifact_type.name, sub)
                if 'PER' in sub:
                    self.__dict__[sub.split('_')[0]].find('Sub Stat Scaler').insert(
                        DNode(sub_key, '%', sub_num))
                elif 'CONST' in sub:
                    self.__dict__[sub.split('_')[0]].find('Artifact Flat').insert(
                        DNode(sub_key, '', sub_num))
                elif sub == 'EM':
                    self.__dict__[sub].insert(
                        DNode(sub_key, '', sub_num))
                else:
                    self.__dict__[sub].insert(
                        DNode(sub_key, '%', sub_num))


# def visualize(a) -> None:
#     que: List = []
#     que.append((a, 0))
#     while (que):
#         c, n = que.pop(0)
#         print('\t'*n+'->', f'[{c.key}][{c.func}][ {c.num} ]')
#         if not c.leaf:
#             for i in range(len(c.child)):
#                 que.insert(i, (c.child[i], n+1))

# d = CharacterAttribute()
# visualize(d.DEF)
