from typing import TYPE_CHECKING
from core.simulation.event import *
from core.simulation.constraint import *
from data.characters import *
if TYPE_CHECKING:
    from core.simulation import Simulation


class Operation(object):
    def __init__(self, command: str) -> None:
        '''
        格式:\n
        ### 角色.命令(附加条件)@时间\n
        ### format: character.command(condition)@time
        角色可以是名字或队伍位置\n
        附加条件:\n
        \- : 默认/期望伤害(不加符号)\n
        \$ : 实际模拟\n
        \! : 必定暴击\n
        \? : 必定不暴击\n
        0 : 空挥 0伤害
        '''
        self.command: str = command
        self.source: str = ''
        self.time: float = 0
        self.action: str = ''
        self.condition: str = ''
        self.parse(command)

    def __lt__(self, other) -> bool:
        return self.time < other.time

    def parse(self, command: str):
        self.source, cmd_action = tuple(command.split('.', 1))
        cmd_action, cmd_time = tuple(cmd_action.split('@', 1))
        if cmd_action[-1].isalpha():
            self.action = cmd_action.upper()
        else:
            self.action = cmd_action[:-1].upper()
            self.condition = cmd_action[-1]
        self.time = float(cmd_time)

    def execute(self, simulation: 'Simulation'):
        if self.source.isnumeric():
            self.source = simulation.shortcut[int(self.source)]
        if self.action == 'C':
            switch_event = SwitchEvent(time=self.time,
                                       source=self.source,
                                       desc=f'CMD.{self.source}.{self.action}')
            simulation.event_queue.put(switch_event)
        else:
            self.controller = None
            exec(f'self.controller = {self.source}_controller')
            if not self.controller:
                raise Exception('controller not defined')
            self.controller(self, simulation)
