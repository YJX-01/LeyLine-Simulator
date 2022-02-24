import json
from typing import Tuple, List
from core.rules.alltypes import WeaponType, StatType
from core.simulation.event import Event
from data.weapons import *


class Weapon(object):
    def __init__(self):
        self.base: WeaponBase = WeaponBase()
        self.action: WeaponAction = WeaponAction()
        self.owner: str = ''

    def initialize(self, name: str, lv: int, asc=False, refine: int = 1):
        self.base.initialize(name=name, lv=lv, asc=asc)
        self.action.choose(self, refine)
    
    def set_owner(self, owner: str):
        self.owner = owner
        r = self.action.refine
        self.action.choose(self, refine=r)

    @property
    def name(self) -> str:
        return self.base.name

    @property
    def ATK(self) -> float:
        return self.base.ATK

    @property
    def sub_stat(self) -> Tuple[str, float]:
        return (self.base.sub_stat.name, self.base.stat_value)

    @property
    def bonus_stat(self) -> Tuple[str, float]:
        return tuple(self.action.EXTRA)
    
    def work(self, simulation, event: 'Event'):
        self.action.skill(simulation, event)


class WeaponBase(object):
    with open('.\docs\constant\WeaponLevelMultiplier.json', 'r') as f:
        __lv_curve = json.load(f)

    with open('.\docs\constant\WeaponConfig.json', 'r') as f:
        __weapon_info = json.load(f)

    __asc_info = {
        3: [19.5, 38.9, 58.4, 77.8, 97.3, 116.7],
        4: [25.9, 51.9, 77.8, 103.7, 129.7, 155.6],
        5: [31.1, 62.2, 93.4, 124.5, 155.6, 186.7]
    }

    def __init__(self, **configs) -> None:
        self.name: str = ''
        self.rarity: int = 5
        self.weapon_type: WeaponType = WeaponType(1)
        self.lv: int = 0
        self.asc: int = 0
        self.ATK_BASE: float = 0
        self.ATK: float = 0
        self.atk_curve: str = ''
        self.sub_stat: StatType = StatType(1)
        self.stat_base: float = 0
        self.stat_value: float = 0
        self.stat_curve: str = ''
        self.initialize(**configs)

    def initialize(self, **configs) -> None:
        if 'name' in configs.keys():
            self.choose(configs['name'])
        if 'lv' in configs.keys() and 'asc' in configs.keys() and self.name:
            self.set_lv(configs['lv'], configs['asc'])

    def choose(self, name: str) -> None:
        self.name = name
        for w in self.__weapon_info:
            if w['name'] == name:
                self.rarity = w['rarity']
                self.weapon_type = WeaponType(w['weapon_type'])
                self.sub_stat = StatType[w['sub_stat']]
                self.stat_base = w['stat_base']
                self.stat_curve = w['stat_curve']
                self.ATK_BASE = w['ATK_BASE']
                self.atk_curve = w['atk_curve']
                return

    def set_lv(self, lv: int, asc: bool) -> None:
        if not self.name:
            return
        self.lv = lv
        self.asc = self.set_asc(lv, asc)
        atk_curve = self.__lv_curve[self.atk_curve]
        stat_curve = self.__lv_curve[self.stat_curve]
        self.ATK = self.ATK_BASE * atk_curve[self.lv]
        self.stat_value = self.stat_base * stat_curve[self.lv]
        if self.asc:
            self.ATK += self.__asc_info[self.rarity][self.asc-1]

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

    def __repr__(self) -> str:
        return 'Name:{}\nLv:{}\nATK:{}\nStat:{}:{}'.format(
            self.name, self.lv, self.ATK, self.sub_stat, self.stat_value)


class WeaponAction(object):
    with open('.\docs\constant\WeaponConfig.json', 'r') as f:
        __weapon_info = json.load(f)

    def __init__(self) -> None:
        '''
        ### 属性:
        refine\n
        EXTRA\n
        '''
        self.refine: int = 1
        self.EXTRA: List[str, float] = ['', 0]
        self.scaler: List[float] = []
        self.skill: object = None
        self.skillname: str = ''

    def choose(self, weapon: Weapon, refine: int):
        self.refine = refine
        name = weapon.name
        for w in self.__weapon_info:
            if w['name'] == name:
                self.skillname = w['skill']['skill_name']
                self.EXTRA[0] = w['skill']['bonus_stat']
                if self.EXTRA[0]:
                    self.EXTRA[1] = w['skill']['bonus_stat_value'][refine-1]
                self.scaler = w['skill']['param_list'][refine-1]
        exec(f'self.skill = {name}_Skill(weapon)')
