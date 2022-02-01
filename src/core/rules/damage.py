from functools import wraps
from .alltypes import *

    
def damage(elem=ElementType.PHYSICAL, type=DamageType.NONE):
    '''
    造成伤害
    '''
    def decorate(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            print(f"\t\tTRIGGER BEFORE DAMAGE [ELEM:{elem}] [TYPE:{type}]")
            result = func(*args, **kwargs)
            print(f"\t\tTRIGGER AFTER DAMAGE [ELEM:{elem}] [TYPE:{type}]")
            return result
        return wrapper
    return decorate

    