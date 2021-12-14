
from typing import Dict

class Panel:
    
    __panel_name = \
        [
            'atk_base', 'def_base', 'hp_base',
            'atk', 'def', 'hp',
            'EM', 'ER',
            'crit_rate', 'crit_damage',
            'heal_bonus', 'heal_income',
            'shield_strength', 'cd_reduction',
            'anemo_bonus', 'geo_bonus', 'electro_bonus', 'hydro_bonus', 'pyro_bonus', 'cryo_bonus', 'physical_bonus',
            'anemo_res', 'geo_res', 'electro_res', 'hydro_res', 'pyro_res', 'cryo_res', 'physical_res'
        ]
    
    def __init__(self, config: Dict[str, float]) -> None:
        for name in self.__panel_name:
            if name in config:
                setattr(self, name, config.pop(name))
    
    def __getattr__(self, __name: str) -> float:
        return 0

