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
        self.energy_restore = None
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

    def attacked_by(self, damage: 'DamageEvent', **kwargs):
        '''return List[(time, reaction_type, **info)], apply_flag'''
        # judge whether apply element
        apply_flag: bool = True
        if damage.icd and damage.icd.tag:
            icd_map: Dict[str, ICD] = self.icd.setdefault(damage.sourcename, {})
            if damage.icd.tag not in icd_map:
                icd_map[damage.icd.tag] = damage.icd
            else:
                icd_map[damage.icd.tag] += damage.icd
            apply_flag = icd_map[damage.icd.tag].active
        # input the element into element system
        blunt_flag = self.is_blunt(damage)
        # TODO hit system
        info = dict(**kwargs, blunt=blunt_flag)
        in_elem = damage.elem if apply_flag else ElementType.NONE
        in_gu = damage.icd.GU if apply_flag else 0
        result = self.elem_sys.input(in_elem, in_gu, damage.time, **info)
        return result, apply_flag

    def hurt(self, damage: float):
        self.hp_now -= damage
        
    def is_blunt(self, damage: 'DamageEvent') -> bool:
        return False
