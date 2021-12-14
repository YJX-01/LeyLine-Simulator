from typing import TYPE_CHECKING
from enum import Enum
if TYPE_CHECKING:
    from core.simulation import Simulation


class Event:
    __default = {
        'time': 0,
        'desc': '',
        'priority': 999,
        'event_type': 0
    }

    # TODO 随便加的初始化后期再讨论修改
    def __init__(self, configs: dict = __default):
        self.time = configs.get('time', 0)
        self.desc: str = configs.get('desc', '')
        self.priority: int = configs.get('priority', 999)
        self.event_type: EventType = EventType(configs.get('event_type', 0))

    def execute(self, simulation: 'Simulation'):
        print(f'[{self.get_time_str()}s]:[event] {self.event_type} event happened, desc: {self.desc}')

    def get_event_priorities(self):
        return (self.time, self.priority)

    def get_time_str(self):
        return format(self.time, '0.2f')


class EventType(Enum):
    NONE = 0
    # 空事件
    ACTION = 1
    # 角色动作事件 例如 AEQ 跳 冲刺
    BUFF = 2
    # buff事件 例如 莫娜Q 宗室
    RESTRICTION = 3
    # 对操作进行限制的事件 例如 前后摇 CD
    NUMERIC = 4
    # 产出数值的事件 例如 伤害 治疗 护盾
    COUNTER = 5
    # 对记录有需求的事件 例如 海染 雷神环
