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
    伤害装饰器。
    用于在造成伤害时，添加一些通用的逻辑。
    如，伤害会触发阿贝多的阳华。
    另外也可以在这里实现元素附着的逻辑。
    '''
    def decorate(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            trigger = Trigger()
            print(f"\t\tTRIGGER BEFORE DAMAGE [ELEM:{elem}] [TYPE:{type}]")
            result = func(*args, **kwargs)
            print(f"\t\tTRIGGER AFTER DAMAGE [ELEM:{elem}] [TYPE:{type}]")
            trigger.notify('damage_trigger', *args)
            return result
        return wrapper
    return decorate

    