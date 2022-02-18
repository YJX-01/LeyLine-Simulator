from typing import Callable, Mapping
from core.rules.alltypes import EventType


class Event(object):
    def __init__(self, **configs) -> None:
        self.type: EventType = EventType(0)
        self.source: object = None
        self.time: float = 0
        self.desc: str = ''
        self.func: Callable = None
        self.info: Mapping = {}
        self.initialize(**configs)

    def initialize(self, **configs) -> None:
        for k, v in configs.items():
            self.__setattr__(k, v)

    def __lt__(self, other) -> bool:
        return self.time < other.time if self.time != other.time else self.desc < other.desc

    @property
    def time_str(self) -> str:
        return format(self.time, '0.2f')

    def execute(self, simulation):
        print(f'\t[{self.time_str}s]:[type]:[ {self.type.name} ]')
        print(f'\t\t[desc]:[ {self.desc} ]')
        if self.func:
            self.func(simulation, self)
