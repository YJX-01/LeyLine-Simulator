from enum import Enum


class WeaponType(Enum):
    SWORD = 1
    CLAYMORE = 2
    POLEARM = 3
    CATALYST = 4
    BOW = 5


class Weapon:
    name = 'INITIAL WEAPON'
    weapon_type = WeaponType.SWORD
    description = None
    quality = 1  # Star
    ATK = 23
    # TODO second attr
    skills = []

    def __init__(self, configs: dict) -> None:
        self.name: str = configs.get('name', '')
        self.weapon_type = None
        self.rarity: int = 0
        self.ATK_base: float = 0
        self.main_stat = None
        self.skills = []
