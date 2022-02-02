from typing import TYPE_CHECKING, Sequence, Union
from .event import Event
from .constraint import *
if TYPE_CHECKING:
    from core.simulation import Simulation


class Operation(object):
    def __init__(self, command: str, time: float, *args):
        self.time = time
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
            character = simulation.characters[cmd_source]
            if cmd_t != 'next':
                cmd_time = float(cmd_t)

            if cmd_action == 'A':
                print('\tCALL CHARACTER ACTION')
                append_events = \
                    character.action.NORMAL_ATK(character, cmd_time)
                print('\tCHARACTER ACTION GENERTATE EVENTS')
                self.events.extend(append_events)
            if cmd_action == 'E':
                print('\tCALL CHARACTER ACTION')
                append_events = \
                    character.action.ELEM_SKILL(character, cmd_time)
                print('\tCHARACTER ACTION GENERTATE EVENTS')
                self.events.extend(append_events)
        
        # cmd_source_obj = simulation.characters[cmd_source]
        # cmd_action_obj = cmd_source_obj.action
        # self.events.append(Event({'time': cmd_time, 'priority': 0, 'desc': f'{cmd_action}'}))


    def impose(self, *args: Union[Sequence, Constraint]) -> None:
        '''
        impose a array of constraints to the operation\n
        \t*args: Union[Sequence, Constraint]
        '''
        for arg in args:
            if isinstance(arg, Sequence):
                self.constraints.extend(arg)
            elif isinstance(arg, Constraint):
                self.constraints.append(arg)

        self.active = all([self.check(c) for c in self.constraints]) \
            if self.constraints \
            else True
        return

    def check(self, constraint: Constraint) -> bool:
        '''
        check whether the operation is active\n
        refer to the constraints and objects given
        '''
        if isinstance(constraint, ConstraintFlag):
            print('IMPOSE a flag constraint')
            return True
        elif isinstance(constraint, ConstraintCounter):
            print('IMPOSE a counter')
            return True
        elif isinstance(constraint, ConstraintCooldown):
            print('IMPOSE a cd checker')
            return True
        else:
            return True

    def execute(self, simulation: 'Simulation', *args) -> None:
        self.objects = simulation
        self.impose(simulation.active_constraint)
        if self.active:
            self.command_parser(self.command, simulation)
            list(map(lambda ev: simulation.event_queue.put((ev.time, ev)), self.events))
            # list(map(lambda e: simulation.task_queue.put_nowait(e), self.events))
        return
