import json
from typing import Dict, Tuple
from core.rules.icd import ICD
from core.rules.element import ElemSys
from core.rules.alltypes import ElementType, ElementalReactionType
from core.simulation.event import DamageEvent


class Enemy(object):
    def __init__(self, **configs):
        self.lv: int = 100
        self.name: str = ''
        self.HP: float = 1e9
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
        self.debuffs = []

        self.initialize(**configs)

    def initialize(self, **config):
        for k, v in config.items():
            self.__setattr__(k, v)

    def attacked_by(self, damage: 'DamageEvent') -> Tuple[bool, ElementalReactionType, float]:
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

        if not apply_flag:
            react_type = self.elem_sys.react_to(ElementType.NONE)
        else:
            react_type = self.elem_sys.react_to(damage.elem)

        if react_type in [ElementalReactionType.MELT, ElementalReactionType.VAPORIZE]:
            react_multi = 2
        elif react_type in [ElementalReactionType.MELT_REVERSE, ElementalReactionType.VAPORIZE_REVERSE]:
            react_multi = 1.5
        else:
            react_multi = 1

        return apply_flag, react_type, react_multi
