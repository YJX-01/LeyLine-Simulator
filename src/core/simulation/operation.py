from typing import TYPE_CHECKING, Sequence
from core.rules import Event
from .constraint import *


class Operation:
    def __init__(self, command: str, *args):
        self.desc: str = ''
        self.active: bool = False
        self.priority = 0
        self.events: Sequence[Event] = []
        self.objects: Sequence[object] = []
        self.constraints: Sequence[Constraint] = []

        for arg in args:
            if isinstance(arg, Sequence):
                self.constraints.extend(arg)
            else:
                self.constraints.append(arg)

        if not len(self.constraints):
            self.active = True
        else:
            for s in self.constraints:
                self.check(s)

        if self.active:
            self.command_parser(command)


    def command_parser(self, command: str) -> None:
        command_list = command.split('.')
        for i, cmd in enumerate(command_list):
            if i == 0:
                print('CALL character constructor')
                self.objects.append(cmd)
            elif i == 1:
                print('CALL character action')
        print('GENERTATE A EVENT')
        self.events.append(Event({'time': 0, 'priority': 0, 'desc': 'a event'}))

    def check(self, constraint: Constraint) -> None:
        tp = constraint.type
        if tp == ConstraintType(1):
            print('IMPOSE a flag constraint')
        elif tp == ConstraintType(2):
            print('IMPOSE a counter')
        elif tp == ConstraintType(3):
            print('IMPOSE a cd checker')
        self.active = True

    def execute(self, simulation: object) -> None:
        if self.active:
            list(map(lambda e: e.execute(simulation), self.events))
        return
