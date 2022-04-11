import json
from typing import Dict, List, Tuple
from core.entities.buff import Buff
from core.rules.icd import ICD
from core.rules.element import ElemSys
from core.rules.alltypes import ElementType
from core.rules.alltypes import ElementalReactionType as rt
from core.simulation.event import DamageEvent


class Enemy(object):
    def __init__(self, **configs):
        self.lv: int = 100
        self.name: str = ''
        self.HP: float = 1e9
        self.hp_now: float = self.HP
        self.RES: Dict[ElementType: int] = {
            ElementType.ANEMO: 10,
            ElementType.GEO: 10,
            ElementType.ELECTRO: 10,
            ElementType.HYDRO: 10,
            ElementType.PYRO: 10,
            ElementType.CRYO: 10,
            ElementType.DENDRO: 10,
            ElementType.PHYSICAL: 10
        }
        self.elem_sys = ElemSys()
        self.icd: Dict[Dict[str, ICD]] = {}
        self.debuffs: List[Buff] = []

        self.initialize(**configs)

    def initialize(self, **config):
        for k, v in config.items():
            self.__setattr__(k, v)

    @property
    def hp_percentage(self) -> Tuple[float, float]:
        return (self.hp_now, self.HP)

    def attacked_by(self, damage: 'DamageEvent') -> Tuple[bool, bool, rt, float]:
        '''return apply_flag, amp_flag, react_type, react_multi'''
        # judge whether apply element
        apply_flag: bool = False
        if damage.icd and damage.icd.tag:
            icd_map: Dict[str, ICD] = self.icd.setdefault(
                damage.sourcename, {})
            if damage.icd.tag not in icd_map:
                icd_map[damage.icd.tag] = damage.icd
            else:
                icd_map[damage.icd.tag] += damage.icd
            apply_flag = icd_map[damage.icd.tag].active
        else:
            apply_flag = True

        # judge reaction type
        if not apply_flag:
            react_type = self.elem_sys.insert(ElementType.NONE, 1, damage.time)
        else:
            react_type = self.elem_sys.insert(damage.elem, damage.icd.GU, damage.time)

        # judge amplify or transformative, determine multiplier
        react_multi, amp_flag = self.elem_sys.reaction_multiplier.get(react_type, (0, False))

        return apply_flag, amp_flag, react_type, react_multi

    def hurt(self, damage: float):
        self.hp_now -= damage
