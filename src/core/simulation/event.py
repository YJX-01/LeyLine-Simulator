from typing import Callable, Mapping, Any


class Event(object):
    def __init__(self, configs: Mapping[str, Any] = {}) -> None:
        self.time: float = -1
        self.desc: str = ''
        self.func: Callable = None
        self.initialize(configs)

    def initialize(self, configs: Mapping[str, Any]) -> None:
        self.time = configs.get('time', 0)
        self.desc = configs.get('desc', '')
        self.func = configs.get('func', None)

    def __lt__(self, other) -> bool: return self.time < other.time

    @property
    def time_str(self) -> str:
        return format(self.time, '0.2f')

    def execute(self, simulation: object, *args):
        if self.func:
            self.func(simulation, *args)
        print(f'[{self.time_str}s]:[Event]:[desc]:[ {self.desc} ]')
