from typing import TYPE_CHECKING, Callable, Sequence, Any
from core.entities.character import Character


class Constraint(object):
    def __init__(self, func: Callable = None):
        self.func: Callable = func


class DurationConstraint(Constraint):
    '''
    约束任意一个有持续时间的实体的类
    防止在持续时间内冲突 拒绝冲突动作
    '''

    def __init__(self, start, duration=0, func: Callable = None):
        super().__init__(func)
        self.start = start
        self.duration = duration

    def __call__(self, log: Sequence) -> bool:
        interest = [self.func(ev) for ev in log]
        for ev in interest:
            if self.start <= ev.time < self.start+self.duration:
                return False
        return True

    def reduce(self, t):
        self.duration -= t


class CounterConstraint(Constraint):
    def __init__(self, func: Callable = None):
        super().__init__(func)
        self.start = 0
        self.end = 0
        self.count = 0
        self.capacity = 0
        self.circulative = False

    def set(self, start=0, end=0, count=0, capacity=0):
        self.start = start
        self.end = end
        self.count = count
        self.capacity = capacity

    def circulate(self, flag=True):
        self.circulative = flag

    def __call__(self, log: Sequence):
        states = [self.func(ev) for ev in log]
        for s in states:
            self.count += s
            if self.circulative:
                self.count %= self.capacity
            self.count = min(self.capacity, self.count)
        return self.count
