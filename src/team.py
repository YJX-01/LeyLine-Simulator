import allogenes

from character import *

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
