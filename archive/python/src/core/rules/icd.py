from typing import TYPE_CHECKING
from core.rules.alltypes import *
from core.simulation.constraint import CounterConstraint


class ICD(object):
    '''
    a patch of internal cooldown and gauge unit\n
    attr:
    #### tag, group, counter, GU
    '''
    __group_reference = {
        'default': (2.5, 3),
        'polearm': (0.5, 3),
        'amber': (1, 3),
        'venti': (1, 3),
        'fischl': (5, 4),
        'diluc': (5, 5),
        'xiao': (0.1, 1)
    }
    # attenuation group: (time, hit)

    def __init__(self, tag: str = '', group: str = '', time: float = 0, gu: int = 0):
        self.tag: str = ''
        self.group: str = ''
        self.counter: CounterConstraint = None
        self.GU: int = 0
        self.initialize(tag, group, time, gu)

    def initialize(self, tag: str, group: str, time: float, gu: int):
        self.tag = tag
        self.group = group if group else 'default'
        self.GU = int(gu)
        self.counter = CounterConstraint(time,
                                         self.__group_reference[self.group][0],
                                         self.__group_reference[self.group][1],
                                         cir=True)

    def __eq__(self, other: 'ICD') -> bool:
        return self.tag == self.tag and self.group == other.group

    def __ne__(self, other: 'ICD') -> bool:
        return self.tag != self.tag or self.group != other.group

    def __iadd__(self, other: 'ICD'):
        if self.tag != other.tag:
            raise TypeError('Not same ICD')

        if self.counter.start < other.counter.start < self.counter.end:
            self.counter.receive(1)
            self.GU = other.GU
        elif other.counter.start >= self.counter.end:
            self.counter = other.counter
            self.GU = other.GU
        return self

    @property
    def active(self) -> bool:
        return self.counter.count == 0
