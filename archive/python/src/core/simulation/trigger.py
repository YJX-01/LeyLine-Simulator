from ast import Call
from multiprocessing.sharedctypes import Value
from typing import Callable, List, Dict


class Trigger(object):
    '''
    Trigger 触发器 单例。
    实现了消息机制。
    提供了消息注册和触发方法。
    可以用来实现一些需要收到通知才能被动触发的逻辑。
    如，行秋雨帘剑，阿贝多阳华。
    
    最下面有单元测试 和 基础用法。
    '''
    instance = None
    
    def __init__(self):
        if not self.trigger_dict:
            self.trigger_dict = {}
    
    def __new__(cls, *args, **kwargs):
        if not cls.instance:
            cls.instance = object.__new__(cls, *args, **kwargs)
        return cls.instance
    
    trigger_dict: Dict[str, List[Callable]] = {}
    
    def notify(self, name: str, *args, **kwargs):
        if not name in self.trigger_dict \
            or self.trigger_dict[name].count == 0:
            print (f'\t\t\tNO TRIGGER NAMED: {name}')
            return
        triggers: List[Callable] = self.trigger_dict[name]
        for callback in triggers:
            callback(*args, **kwargs)
        
    def register(self, name: str, callback: Callable):
        if not name in self.trigger_dict:
            self.trigger_dict[name] = [callback]
            return
        triggers: List[Callable] = self.trigger_dict[name]
        try:
            triggers.remove(callback)
        except ValueError:
            pass
        else:
            print('\t\t\tRepalce an exist callback')
        finally:
            triggers.append(callback)
    
    def unregister(self, name: str, callback: Callable):
        if not name in self.trigger_dict:
            return
        triggers: List[Callable] = self.trigger_dict[name]
        try:
            triggers.remove(callback)
        finally:
            pass
    


# 单元测试 & 用法
# a = Trigger()

# def func1(x, y, z):
#     print(x, y, z)
    
# def func2(x, y, z):
#     print(x + 1, y + 1, z + 1)
    
# a.register('testfunc1', func1)
# a.register('testfunc1', func1)
# a.register('testfunc1', func2)
# a.register('testfunc2', func2)

# a.notify('testfunc0')
# a.notify('testfunc1', 1, 2, 3)
# a.notify('testfunc2', 1, 2, 3)
# print()

# a.unregister('testfunc1', func1)
# a.notify('testfunc1', 1, 2, 3)
# a.unregister('testfunc1', func2)
# a.notify('testfunc1', 1, 2, 3)
# print()

