from functools import wraps
from core.rules.alltypes import *


def normal_atk(count=1):
    '''
    普通攻击装饰器。
    用于在普攻时，添加一些通用的逻辑。
    如，普攻动作发生时，触发行秋雨帘剑。
    '''
    def decorate(func):
        @wraps(func)
        def wapper(*args, **kwargs):
            print("\t\tTRIGGER BEFORE NORMAL ATK")
            result = func(*args, **kwargs)
            print("\t\tTRIGGER AFTER NORMAL ATK")
            return result
        return wapper
    return decorate


def elem_skill(count=1):
    '''
    元素战技装饰器。同上。
    '''
    def decorate(func):
        @wraps(func)
        def wapper(*args, **kwargs):
            print("\t\tTRIGGER BEFORE ELEM SKILL")
            result = func(*args, **kwargs)
            print("\t\tTRIGGER AFTER ELEM SKILL")
            return result
        return wapper
    return decorate


def elem_burst(count=1):
    '''
    元素爆发装饰器。同上。
    '''
    def decorate(func):
        @wraps(func)
        def wapper(*args, **kwargs):
            print("\t\tTRIGGER BEFORE ELEM BURST")
            result = func(*args, **kwargs)
            print("\t\tTRIGGER AFTER ELEM BURST")
            return result
        return wapper
    return decorate


class Skill(object):
    '''
    表征技能对象的基类\n
    包含:\n
    type: SkillType 技能类型\\
    source: object 源对象\\
    sourcename: str 源对象名字\\
    LV: int 等级\\
    elem_type: ElementType \\
    action_type: ActionType \\
    damage_type: DamageType \\
    action_time: list 动作时长\\
    scaler: dict 倍率\\
    creations: object 召唤物\\
    parallel: object 同级对象\\
    cd: 冷却
    '''

    def __init__(self, **configs):
        self.type: SkillType = None
        self.source: object = None
        self.sourcename: str = None
        self.LV: int = 0
        self.elem_type: ElementType = None
        self.action_type: ActionType = None
        self.damage_type: DamageType = None
        self.action_time: list = None
        self.scaler: dict = None
        self.creations: object = None
        self.parallel: object = None
        self.initialize(**configs)

    def initialize(self, **configs):
        for k, v in configs.items():
            self.__setattr__(k, v)
