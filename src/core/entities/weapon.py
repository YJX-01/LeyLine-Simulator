from core.rules.alltypes import WeaponType


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
        self.ATK_BASE: float = 0
        self.main_stat = None
        self.skills = []
