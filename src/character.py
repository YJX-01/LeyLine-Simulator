# import allogenes
from wrapper import Wrapper

class Character():
    '''
    定义单个角色的类\n
    '''
    
    def __init__(self, name: str, weapon, artifacts) -> None:
        self.name = name
        self.allogene = None
        self.weapon = weapon
        self.artifacts = artifacts
        self.panel = Panel()
        self.skills = {}
        self.buffs = []

class Panel(Wrapper):
    """[summary]\n
        角色面板类。Buff 结算时需要返回角色的实时面板，所以单独拿出来
    """
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
    
    def __init__(self) -> None:
        config = dict.fromkeys(self.__panel_name, lambda x: 0)
        super().__init__(config)












