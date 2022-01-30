from typing import TYPE_CHECKING, Sequence
from .event import Event
from .constraint import *
if TYPE_CHECKING:
    from core.simulation import Simulation


class Operation(object):
    def __init__(self, command: str, *args):
        self.command: str = command
        self.priority: tuple = tuple()
        self.desc: str = ''
        self.active: bool = False
        self.events: Sequence[Event] = []
        self.objects: Sequence[object] = []
        self.constraints: Sequence[Constraint] = []

        for arg in args:
            if isinstance(arg, Sequence):
                self.constraints.extend(arg)
            else:
                self.constraints.append(arg)

        self.active = all([self.check(c) for c in self.constraints]) \
            if self.constraints \
            else True

    def command_parser(self, command: str, simulation: 'Simulation') -> None:
        '''
        command type: Charchar.skill@time\n
        \tdefault: time = 'next' | -1
        '''
        cmd_source, cmd_action = tuple(command.split('.', 1))
        cmd_time: float = -1
        if '@' in cmd_action:
            cmd_action, cmd_t = tuple(cmd_action.split('@', 1))
            if cmd_t != 'next':
                cmd_time = float(cmd_t)
        print('CALL CHARACTER')
        cmd_source_obj = simulation.characters[cmd_source]
        print('CALL CHARACTER ACTION')
        cmd_action_obj = cmd_source_obj.action
        print('GENERTATE A EVENT')
        self.events.append(Event({'time': cmd_time, 'priority': 0, 'desc': f'{cmd_action}'}))

    def check(self, constraint: Constraint) -> bool:
        cons_type = constraint.type
        if cons_type == ConstraintType(1):
            print('IMPOSE a flag constraint')
            return True
        elif cons_type == ConstraintType(2):
            print('IMPOSE a counter')
            return True
        elif cons_type == ConstraintType(3):
            print('IMPOSE a cd checker')
            return True
        else:
            return True

    def execute(self, simulation: 'Simulation') -> None:
        if self.active:
            self.command_parser(self.command, simulation)
            list(map(lambda ev: simulation.event_queue.put((ev.time, ev)), self.events))
        return
