from typing import TYPE_CHECKING, Callable, Mapping, Any
if TYPE_CHECKING:
    from core.simulation import Simulation
    from core.entities.character import Character


class Event(object):
    def __init__(self, **configs) -> None:
        self.character: 'Character' = None
        self.time: float = -1
        self.desc: str = ''
        self.func: Callable = None
        self.initialize(**configs)

    def initialize(self, **configs) -> None:
        for k, v in configs.items():
            self.__setattr__(k, v)

    def __lt__(self, other) -> bool: 
        return self.time < other.time

    @property
    def time_str(self) -> str:
        return format(self.time, '0.2f')

    def execute(self, simulation: 'Simulation', *args):
        print(f'\t[{self.time_str}s]:[Event]:[desc]:[ {self.desc} ]')
        if self.func:
            self.func(simulation, self)
