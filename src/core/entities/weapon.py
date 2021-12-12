from enum import Enum


class WeaponType(Enum):
    SWORD = 1
    CLAYMORE = 2
    BOW = 3
    POLEARM = 4
    CATALYST = 5


class Weapon:
    name = 'INITIAL WEAPON'
    weapon_type = WeaponType.SWORD
    description = None
    quality = 1  # Star
    ATK = 23
    # TODO second attr
    skills = []
