# import allogenes

from character import *


class Creation():
    '''
    定义召唤物的类\n
    '''
    def __init__(self, data: dict) -> None:
        self.panel = None
        self.func = None


class Weapon:
    '''
    定义武器的类\n
    '''

    def __init__(self, name: str, level: int, bonuses, effects) -> None:
        self.name = name
        self.level = level
        self.bonuses = bonuses
        self.effects = effects


class Team():
    '''
    定义队伍的类\n
    '''

    def __init__(self) -> None:
        self.position1 = Character()
        self.position2 = Character()
        self.position3 = Character()
        self.position4 = Character()
