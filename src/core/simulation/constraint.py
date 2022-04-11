from typing import Callable, List, Union, Any


class Constraint(object):
    '''表示约束条件的基类'''

    def __init__(self, start=0, duration=0, func: Callable = None):
        self.start: float = start
        self.duration: float = duration
        self.func: Callable = func

    @property
    def exist_time(self) -> tuple:
        return (self.start, self.start+self.duration)

    @property
    def end(self) -> float:
        return self.start+self.duration

    def test(self, *args):
        if not self.func:
            return True
        else:
            return self.func(*args)


class DurationConstraint(Constraint):
    '''
    约束任意一个有持续时间的实体的类\n
    防止在持续时间内冲突 拒绝冲突动作
    '''

    def __init__(self, start=0, duration=0, func: Callable[[Any], bool] = None, refresh=False):
        '''
        设定\n
        ### start, end, func, refresh\n
        func是筛选目标类型的函数\n
        refresh表示是否刷新
        '''
        super().__init__(start, duration, func)
        self.refreshable = refresh

    def refresh(self, flag=True):
        self.refreshable = flag

    def reduce(self, t):
        self.duration -= t

    def test(self, event) -> bool:
        if event.time >= self.end and (not self.func or self.func(event)):
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

    def __init__(self, start=0, duration=0, capacity=0, func: Callable[[Any], Union[float, int]] = None, cir=False):
        '''
        设定\n
        ### start, end, capacity, func, cir\n
        func是对目标类型进行计数判断的函数\n
        cir表示是否循环
        '''
        super().__init__(start, duration, func)
        self.count = 0
        self.capacity = capacity
        self.circulative = cir

    def circulate(self, flag=True):
        self.circulative = flag

    def receive(self, cnt: float):
        self.count += cnt
        self.count = max(0, self.count)
        if self.circulative:
            self.count %= self.capacity
        self.count = min(self.capacity, self.count)

    def clear(self):
        self.count = 0

    def reduce(self, cnt: float):
        self.count -= cnt
        self.count = max(0, self.count)

    @property
    def full(self) -> bool:
        return self.count == self.capacity

    def test(self, log: List[object]) -> float:
        states = [self.func(ev) for ev in log
                  if self.start < ev.time < self.end]
        self.clear()
        for cnt in states:
            self.receive(cnt)
        return self.count
