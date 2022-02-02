from functools import wraps

from core.simulation.trigger import Trigger
from .alltypes import *

# TODO: 考虑附魔 buff 等改变元素类型的情况
# TODO: 考虑雷神大招 buff 等改变伤害类型的情况
def damage(
    simulation=None,
    time=0.0,
    elem=ElementType.PHYSICAL,
    type=DamageType.NONE):
    '''
    造成伤害
    '''
    def decorate(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            trigger = Trigger()
            print(f"\t\tTRIGGER BEFORE DAMAGE [ELEM:{elem}] [TYPE:{type}]")
            result = func(*args, **kwargs)
            print(f"\t\tTRIGGER AFTER DAMAGE [ELEM:{elem}] [TYPE:{type}]")
            trigger.notify('damage_trigger', args[0], args[1], args[2])
            return result
        return wrapper
    return decorate

    