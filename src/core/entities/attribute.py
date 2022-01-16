
from typing import Dict


class Panel:

    __panel_name = [
        'ATK_BASE', 'DEF_BASE', 'HP_BASE',
        'ATK',
        'DEF',
        'HP',
        'EM',
        'ER',
        'CRIT_RATE',
        'CRIT_DMG',
        'HEAL_BONUS',
        'HEAL_INCMOE',
        'SHIELD_STRENGTH',
        'CD_REDUCTION',
        'ANEMO_DMG', 'GEO_DMG', 'ELECTRO_DMG', 'HYDRO_DMG', 'PYRO_DMG', 'CRYO_DMG', 'DENDRO_DMG', 'PHYSICAL_DMG',
        'ANEMO_RES', 'GEO_RES', 'ELECTRO_RES', 'HYDRO_RES', 'PYRO_RES', 'CRYO_RES', 'DENDRO_RES', 'PHYSICAL_RES'
    ]

    def __init__(self, configs: Dict[str, float]) -> None:
        for name in self.__panel_name:
            if name in configs:
                setattr(self, name, configs.get(name, 0))

    def __getattr__(self, name: str) -> float:
        return getattr(self, name, 0)

    def __delattr__(self, name: str) -> None:
        return delattr(self, name)
