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
