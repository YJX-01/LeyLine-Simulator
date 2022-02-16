from functools import wraps


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

class NormalAttack(object):
    '''
    表征普攻的对象
    包含来源 等级 伤害特点 倍率 动作时长 后续效果
    '''
    def __init__(self) -> None:
        self.type = ''
        self.LV = 1
        self.source = None
        self.elem_type = None
        self.action_type = None
        self.damage_type = None
        self.dmg_occur_num = 0
        self.action_time = None
        self.scaler = None
        self.buffs = None
 


class Skill(object):
    def __init__(self) -> None:
        self.type = ''
        self.LV = 1
        self.source = None
        self.elem_type = None
        self.action_type = None
        self.damage_type = None
        self.dmg_occur_num = 0
        self.action_time = None
        self.scaler = None
        self.buffs = None
        self.creations = None
