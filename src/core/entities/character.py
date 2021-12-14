from enum import Enum
from typing import TYPE_CHECKING, Callable, Dict, List

from .character import Panel
from .weapon import WeaponType
from core.rules.element import ElementType
from core.rules import Event
import json


class Character(Panel):
    def __init__(self, configs: dict) -> None:
        super().__init__(configs)
        self.name: str = configs.get('name', '')
        self.level: int = configs.get('level', 0)
        self.asc: int = configs.get('asc', 0)  # asc is abbr for ascension
        self.cx: int = configs.get('cx', 0)  # cx is abbr for constellation
        self.element_type = None
        self.nationality = None
        self.weapon_type = None
        self.rarity: int = None
        self.HP_base: float = None
        self.ATK_base: float = None
        self.DEF_base: float = None
        self.talents: Dict[str, Callable[[Dict]]] = []
        self.skills: Dict[str, Callable[[Dict]]] = []
        self.constellations: Dict[str, Callable[[Dict]]] = []
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
        self.nationality = Nationality(info['nationality'])
        self.weapon_type = WeaponType(info['weapon_type'])
        self.rarity = info['rarity']
        self.HP_base = info['HP_base']
        self.ATK_base = info['ATK_base']
        self.DEF_base = info['DEF_base']

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
            return [Event({'time': time+0.1, 'event_type': 1})]
        elif command_type == 'talent':
            return [Event({'time': time+0.2, 'event_type': 2})]
        else:
            return [Event()]

    # for testing
    def demo_output(self):
        print(self.name, self.level, self.asc,
              self.element_type, self.nationality, self.weapon_type, self.rarity,
              self.HP_base, self.ATK_base, self.DEF_base)


class Nationality(Enum):
    MONDSTADT = 1
    LIYUE = 2
    INAZUMA = 3
    SUMERU = 4
    FONTAINE = 5
    NATLAN = 6
    SNEZHNAYA = 7
    KHAENRIAH = 8
    OTHER = 9
