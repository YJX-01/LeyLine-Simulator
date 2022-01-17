from typing import Callable, Dict, List
from core.rules.alltypes import NationType, ElementType, WeaponType, PanelType
from core.rules import Event
import json


class Character():
    def __init__(self, configs: dict) -> None:
        self.name: str = configs.get('name', '')
        self.level: int = configs.get('level', 0)
        self.asc: int = configs.get('asc', 0)  # asc is abbr for ascension
        self.cx: int = configs.get('cx', 0)  # cx is abbr for constellation
        self.element_type = None
        self.nationality = None
        self.weapon_type = None
        self.rarity: int = None
        self.HP_BASE: float = None
        self.ATK_BASE: float = None
        self.DEF_BASE: float = None
        self.talents: Dict[str, Callable[[Dict]]] = {}
        self.skills: Dict[str, Callable[[Dict]]] = {}
        self.constellations: Dict[str, Callable[[Dict]]] = {}
        self.initialize()

    def initialize(self):
        if not self.name:
            return
        info = dict()
        with open('.\docs\constant\CharacterConfig.json', 'r') as d:
            data: list = json.load(d)
            for c in data:
                if self.name == c['name']:
                    info = c.copy()
                    break
        self.element_type = ElementType(info['element'])
        self.nationality = NationType(info['region'])
        self.weapon_type = WeaponType(info['weapon'])
        self.rarity = info['rarity']
        self.HP_BASE = info['HP_BASE']
        self.ATK_BASE = info['ATK_BASE']
        self.DEF_BASE = info['DEF_BASE']

    def set_talents(self, talents):
        self.talents = talents

    def set_skills(self, skills):
        self.skills = skills

    def set_constellations(self, constellations):
        self.constellations = constellations

    def __call__(self, *args):
        # TODO 可能要使用 importlib 动态导入模块， 先写死
        for arg in args:
            if isinstance(arg, str):
                command_type: str = arg.split('.')[0]
                commands: List[str] = arg.split('.')[1:]
            elif isinstance(arg, dict):
                if 'time' in arg.keys():
                    time = arg.get('time')
            else:
                pass
        if command_type == 'skill':
            events: List[Event] = []
            for cmd in commands:
                f = self.skills[cmd]
                events.extend(f(time))
            return events
        elif command_type == 'talent':
            return [Event({'time': time+0.2, 'event_type': 2})]
        else:
            return [Event()]

    # for testing
    def demo_output(self):
        print(self.name, self.level, self.asc,
              self.element_type, self.nationality, self.weapon_type, self.rarity,
              self.HP_BASE, self.ATK_BASE, self.DEF_BASE)


class CharacterBase:
    with open('./docs/constant/LevelMultiplier.json', 'r') as f:
        __lv_curve = json.load(f)
    with open('./docs/constant/CharacterConfig.json', 'r') as f:
        __char_info = json.load(f)

    def __init__(self, **kwargs):
        self.name: str = ''
        self.rarity: str = ''
        self.weapon: int = 0
        self.element: int = 0
        self.region: int = 0
        self.lv: int = 0
        self.asc: int = 0
        self.asc_info: dict = {}
        self.HP_BASE: int = 0
        self.ATK_BASE: int = 0
        self.DEF_BASE: int = 0
        self.HP: int = 0
        self.ATK: int = 0
        self.DEF: int = 0
        self.EXTRA: list = ['', 0]
        if 'name' in kwargs.keys():
            self.choose(kwargs['name'])
        if 'lv' in kwargs.keys() and 'asc' in kwargs.keys() and self.name:
            self.setLv(kwargs['lv'], kwargs['asc'])

    def setLv(self, lv: int, asc: bool) -> None:
        if not self.name:
            return
        self.lv = lv
        self.asc = self.set_asc(self.lv, asc)
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

    def choose(self, name: str):
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
                break

    @staticmethod
    def set_asc(lv: int, asc: bool):
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


class CharacterAttribute:
    def __init__(self) -> None:
        for t in PanelType:
            pass
