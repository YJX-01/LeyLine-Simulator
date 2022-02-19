from typing import Callable, Sequence, Union, Any
from core.simulation.event import Event


class Constraint(object):
    '''表示约束条件的基类'''

    def __init__(self, func: Callable = None):
        self.func: Callable = func


class DurationConstraint(Constraint):
    '''
    约束任意一个有持续时间的实体的类\n
    防止在持续时间内冲突 拒绝冲突动作
    '''

    def __init__(self, start, duration=0, func: Callable[[Any], bool] = None):
        '''
        func是筛选目标类型的函数
        '''
        super().__init__(func)
        self.start = start
        self.duration = duration
        self.refreshable = False

    def refresh(self, flag=True):
        self.refreshable = flag

    def reduce(self, t):
        self.duration -= t

    def test(self, event: Event) -> bool:
        if self.func(event) and event.time > self.start+self.duration:
            if self.refreshable:
                self.start = event.time
            return True
        return False


class CounterConstraint(Constraint):
    '''
    计数器类\n
    支持循环与上下限\n
    默认从零计数
    '''

    def __init__(self, start=0, end=0, capacity=0, func: Callable[[Any], Union[float, int]] = None):
        '''
        设定\n
        ## start, end, capacity, func\n
        func是对目标类型进行计数判断的函数
        '''
        super().__init__(func)
        self.start = start
        self.end = end
        self.count = 0
        self.capacity = capacity
        self.circulative = False

    def set(self, start=0, end=0, capacity=0):
        self.start = start
        self.end = end
        self.capacity = capacity

    def circulate(self, flag=True):
        self.circulative = flag

    def receive(self, cnt):
        self.count += cnt
        self.count = max(0, self.count)
        if self.circulative:
            self.count %= self.capacity
        self.count = min(self.capacity, self.count)

    def clear(self):
        self.count = 0

    @property
    def full(self) -> bool:
        return self.count == self.capacity

    def test(self, log: Sequence[Event]) -> float:
        states = [self.func(ev) for ev in log
                  if self.start < ev.time < self.end]
        self.clear()
        for cnt in states:
            self.receive(cnt)
        return self.count
