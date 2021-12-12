
from condition import *
from character import Character, Panel

class Bonus():
    def __init__(self, name: str, bonus: dict = {}, condition: Condition = None) -> None:
        self.name = name
        self.bonus = bonus  # {target: stat}
        self.condition = condition
        self.flag = False

    @property
    def dependencies(self) -> list:
        return self.condition.dependencies
    
    @property
    def response(self) -> dict:
        return self.condition.response

    @property
    def active(self) -> bool:
        self.verify()
        return self.flag

    def verify(self) -> None:
        self.flag = self.condition()

    def activate(self) -> dict:
        return self.bonus if self.flag else {}

    def __del__(self) -> None:
        self.bonus.clear()
        del self.condition


class Effect():
    def __init__(self, name: str, args: list = [], effect: function = None, condition: Condition = None) -> None:
        self.name = name
        self.args = args
        self.effect = effect  # return {target: stat}
        self.condition = condition
        self.flag = False

    @property
    def dependencies(self) -> list:
        return self.condition.dependencies
    
    @property
    def response(self) -> dict:
        return self.condition.response

    @property
    def active(self) -> bool:
        self.verify()
        return self.flag

    def verify(self) -> None:
        self.flag = self.condition()

    @property
    def args(self) -> list:
        return self.args

    def activate(self, arg: dict) -> dict:
        return self.effect(arg) if self.flag else {}

    def __del__(self) -> None:
        self.args.clear()
        self.effect = None
        del self.condition
        
class Buff():
    """Buff 作用于角色或者怪物，可以对角色或怪物的所有属性造成影响，包括技能倍率。
    
        在技能产生效果时，先结算 Buff 的影响，再结算技能效果。
    """
    def __init__(self) -> None:
        self.source = Character()
        self.target = Character()
        self.start_time = 0
        self.duration = 0
        self.effects = []

    def settle(self, base_panel: Panel, time: float) -> Panel:
        """
        
        Returns:
            Panel: [description]
        """
        panel = Panel()
        for effect in self.effects:
            panel.atk_base = base_panel.atk_base
            pass
        return panel


