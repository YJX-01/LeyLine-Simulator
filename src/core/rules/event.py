from typing import TYPE_CHECKING
from enum import Enum
if TYPE_CHECKING:
    from core.simulation import Simulation


class Event:
    time = 0
    priority = 500
    description = ''

    # 随便加的初始化后期再讨论修改
    def __init__(self):
        self.time = 0
        self.priority: int = 0
        self.desc: str = ''
        self.event_type: EventType = None

    def execute(self, simulation: 'Simulation'):
        print(f'[{self.get_time_str()}s]:[event] some event happened')

    def get_event_priorities(self):
        return (self.time, self.priority)

    def get_time_str(self):
        return format(self.time, '0.2f')


class EventType(Enum):
    ACTION = 1
    BUFF = 2
    RESTRICTION = 3
    NUMERIC = 4
