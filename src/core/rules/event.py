from typing import TYPE_CHECKING, Mapping, Any
from enum import Enum
if TYPE_CHECKING:
    from core.simulation import Simulation


class Event:
    # TODO 随便加的初始化后期再讨论修改
    def __init__(self, configs: Mapping[str, Any] = {}):
        self.time: float = configs.get('time', 0)
        self.priority: int = configs.get('priority', 0)
        self.desc: str = configs.get('desc', '')

    @property
    def priorities(self):
        return (self.time, self.priority)

    def execute(self, simulation: 'Simulation'):
        print(f'[{self.time_str}s]:[Event]:[desc]:[ {self.desc} ]')

    def get_event_priorities(self):
        return (self.time, self.priority)

    @property
    def time_str(self):
        return format(self.time, '0.2f')


# class EventType(Enum):
#     NONE = 0
#     # 空事件
#     ACTION = 1
#     # 角色动作事件 例如 AEQ 跳 冲刺
#     BUFF = 2
#     # buff事件 例如 莫娜Q 宗室
#     RESTRICTION = 3
#     # 对操作进行限制的事件 例如 前后摇 CD
#     NUMERIC = 4
#     # 产出数值的事件 例如 伤害 治疗 护盾
#     COUNTER = 5
#     # 对记录有需求的事件 例如 海染 雷神环
