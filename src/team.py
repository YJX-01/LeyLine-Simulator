import allogenes

class Character():
    '''
    定义单个角色的类\n
    '''
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

    def __init__(self, name: str, weapon, artifacts) -> None:
        self.__name = name
        self.__allogene = None
        self.__weapon = weapon
        self.__artifacts = artifacts
        self.__panel = {}


class Creation():
    def __init__(self, data: dict) -> None:
        self.__panel = None
        self.__func = None
        self.initialize(data)

    def initialize(self, data):
        self.__panel = data.get('panel', {})


class Weapon:
    '''
    定义武器的类\n
    '''

    def __init__(self, name: str, level: int, bonuses, effects) -> None:
        self.__name = name
        self.__level = level
        self.__bonuses = bonuses
        self.__effects = effects


class Team():
    '''
    定义队伍的类\n
    '''

    def __init__(self) -> None:
        self.position1 = Character()
        self.position2 = Character()
        self.position3 = Character()
        self.position4 = Character()
