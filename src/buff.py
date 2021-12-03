
from condition import *
from character import Character, Panel

class Bonus():
    def __init__(self, name: str, bonus: dict = {}, condition: Condition = None) -> None:
        self.__name = name
        self.__bonus = bonus  # {target: stat}
        self.__condition = condition
        self.__flag = False

    @property
    def dependencies(self) -> list:
        return self.__condition.dependencies
    
    @property
    def response(self) -> dict:
        return self.__condition.response

    @property
    def active(self) -> bool:
        self.verify()
        return self.__flag

    def verify(self) -> None:
        self.__flag = self.__condition()

    def activate(self) -> dict:
        return self.__bonus if self.__flag else {}

    def __del__(self) -> None:
        self.__bonus.clear()
        del self.__condition


class Effect():
    def __init__(self, name: str, args: list = [], effect: function = None, condition: Condition = None) -> None:
        self.__name = name
        self.__args = args
        self.__effect = effect  # return {target: stat}
        self.__condition = condition
        self.__flag = False

    @property
    def dependencies(self) -> list:
        return self.__condition.dependencies
    
    @property
    def response(self) -> dict:
        return self.__condition.response

    @property
    def active(self) -> bool:
        self.verify()
        return self.__flag

    def verify(self) -> None:
        self.__flag = self.__condition()

    @property
    def args(self) -> list:
        return self.__args

    def activate(self, arg: dict) -> dict:
        return self.__effect(arg) if self.__flag else {}

    def __del__(self) -> None:
        self.__args.clear()
        self.__effect = None
        del self.__condition
        
class Buff():
    """Buff 作用于角色或者怪物，可以对角色或怪物的所有属性造成影响，包括技能倍率。
    
        在技能产生效果时，先结算 Buff 的影响，再结算技能效果。
    """
    def __init__(self) -> None:
        self.__source = Character()
        self.__target = Character()
        self.__start_time = 0
        self.__duration = 0
        self.__effects = []

    def settle(self, base_panel: Panel, time: float) -> Panel:
        """
        
        Returns:
            Panel: [description]
        """
        panel = Panel()
        for effect in self.__effects:
            panel.atk_base = base_panel.atk_base
            pass
        return panel


