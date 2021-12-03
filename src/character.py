import allogenes
from buff import Buff
from skill import Skill

class Character():
    '''
    定义单个角色的类\n
    '''
    
    def __init__(self, name: str, weapon, artifacts) -> None:
        self.__name = name
        self.__allogene = None
        self.__weapon = weapon
        self.__artifacts = artifacts
        self.__panel = Panel()
        self.__skills = {}
        self.__buffs = []
    
    def useSkill(self, skill: Skill, time: float) -> None:
        for buff in self.__buffs:
            buff.settle(time)
        skill.use(time)

class Panel():
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
        self.__atk_base = 0
        self.__def_base = 0
        self.__hp_base = 0

        self.__atk = 0
        self.__def = 0
        self.__hp = 0

        self.__EM = 0
        self.__ER = 0

        self.__crit_rate = 0
        self.__crit_damage = 0

        self.__heal_bonus = 0
        self.__heal_income = 0

        self.__shield_strength = 0
        self.__cd_reduction = 0

        self.__anemo_bonus = 0
        self.__geo_bonus = 0
        self.__electro_bonus = 0
        self.__hydro_bonus = 0
        self.__pyro_bonus = 0
        self.__cryo_bonus = 0
        self.__physical_bonus = 0

        self.__anemo_res = 0
        self.__geo_res = 0
        self.__electro_res = 0
        self.__hydro_res = 0
        self.__pyro_res = 0
        self.__cryo_res = 0
        self.__physical_res = 0
        
    @property
    def atk_base(self):
        return self.__atk_base
    
    @atk_base.setter
    def atk_base(self, atk_base):
        self.__atk_base = atk_base











