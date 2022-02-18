from typing import TYPE_CHECKING, Sequence, Union
from core.rules.alltypes import EventType
from .event import Event
from .constraint import *
if TYPE_CHECKING:
    from core.simulation import Simulation


class Operation(object):
    def __init__(self, command: str) -> None:
        '''command format: Charchar.skill@time'''
        self.command: str = command
        self.source: str = ''
        self.time: float = 0
        self.action: str = ''
        self.parse(command)
        self.desc: str = ''
        self.active: bool = False
        self.events: Sequence[Event] = []
        self.constraints: Sequence[Constraint] = []

    def __lt__(self, other) -> bool:
        return self.time < other.time if self.time != other.time else self.desc < other.desc

    def parse(self, command: str):
        self.source, cmd_action = tuple(command.split('.', 1))
        cmd_action, cmd_time = tuple(cmd_action.split('@', 1))
        self.action = cmd_action
        self.time = float(cmd_time)

    def work(self, simulation: 'Simulation') -> None:
        if self.source.isnumeric():
            self.source = simulation.char_shortcut[int(self.source)]
        character = simulation.characters[self.source]
        if self.action == 'A':
            print('\tCALL CHARACTER ACTION: A')
            cmd_event = Event(time=self.time,
                              source='User',
                              type=EventType.COMMAND,
                              func=character.action.NORMAL_ATK,
                              desc=f'cmd.{self.source}.{self.action}')
            self.events.append(cmd_event)
        elif self.action == 'E':
            print('\tCALL CHARACTER ACTION: E')
            cmd_event = Event(time=self.time,
                              source='User',
                              type=EventType.COMMAND,
                              func=character.action.ELEM_SKILL,
                              desc=f'cmd.{self.source}.{self.action}')
            self.events.append(cmd_event)
        elif self.action == 'Q':
            print('\tCALL CHARACTER ACTION: Q')
            cmd_event = Event(time=self.time,
                              source='User',
                              type=EventType.COMMAND,
                              func=character.action.ELEM_BURST,
                              desc=f'cmd.{self.source}.{self.action}')
            self.events.append(cmd_event)
        elif self.action == 'C':
            def switch_char(simulation: 'Simulation', event: 'Event'):
                for c in simulation.active_constraint:
                    if isinstance(c, DurationConstraint) and not c(event):
                        return
                print('\t\tswitch character')
                simulation.onstage = self.source

            print('\tCALL SWITCH CHARACTER ACTION: C')
            switch_event = Event(time=self.time,
                                 source='User',
                                 type=EventType.SWITCH,
                                 func=switch_char,
                                 desc=f'cmd.{self.source}.{self.action}')
            self.events.append(switch_event)
        print('\tCHARACTER ACTION GENERTATE EVENTS')

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

    def check(self, simulation: 'Simulation') -> None:
        '''
        check whether the operation is active\n
        refer to the constraints given
        '''
        self.active = True
        return

    def execute(self, simulation: 'Simulation') -> None:
        self.impose(simulation.active_constraint)
        self.check(simulation)
        if not self.active:
            return
        self.work(simulation)
        list(map(lambda ev: simulation.event_queue.put(ev), self.events))
