from enum import Enum
from .weapon import WeaponType
from core.rules.element import ElementalType
import json


class Character:
    def __init__(self, config: dict) -> None:
        self.name: str = config.get('name', '')
        self.level = config.get('level', 0)
        self.asc = config.get('asc', 0)
        self.element_type = None
        self.nationality = None
        self.weapon_type = None
        self.rarity: int = None
        self.HP_base: float = None
        self.ATK_base: float = None
        self.DEF_base: float = None
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
        self.element_type = ElementalType(info['element'])
        self.nationality = Nationality(info['nationality'])
        self.weapon_type = WeaponType(info['weapon_type'])
        self.rarity = info['rarity']
        self.HP_base = info['HP_base']
        self.ATK_base = info['ATK_base']
        self.DEF_base = info['DEF_base']


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
