from enum import Enum
from .weapon import WeaponType
from core.rules.element import ElementalType
import json


class Character:
    def __init__(self, config: dict) -> None:
        self.name: str = config['name']
        self.level = config['level']
        self.asc = config['asc']
        self.elemental_type = None
        self.nationality = None
        self.weapon_type = None
        self.rarity: int = None
        self.HP_base: float = None
        self.ATK_base: float = None
        self.DEF_base: float = None
        self.initialize()

    def initialize(self):
        info = dict()
        info_map = {}
        with open('.\docs\constant\CharacterMapping.json', 'r') as m:
            info_map = json.load(m)
        with open('.\docs\constant\AvatarExcelConfigData.json', 'r') as d:
            data: list = json.load(d)
            for c in data:
                if self.name in c.get('IconName', ''):
                    info = c.copy()
                    break
        self.elemental_type = ElementalType(info_map['elem_map'][self.name])
        self.nationality = Nationality(info_map['nation_map'][self.name])
        self.weapon_type = WeaponType(info_map['weapon_map'][info.get('WeaponType')])
        self.rarity = 5 if "QUALITY_ORANGE" == info.get('QualityType') else 4
        self.HP_base = info.get('HpBase')
        self.ATK_base = info.get('AttackBase')
        self.DEF_base = info.get('DefenseBase')


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
