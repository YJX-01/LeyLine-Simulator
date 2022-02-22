from typing import TYPE_CHECKING
from core.rules.alltypes import ActionType
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.simulation.operation import Operation


def Albedo_controller(operation: 'Operation', simulation: 'Simulation'):
    character = simulation.characters[operation.source]
    if operation.action == 'A' or operation.action == 'Z':
        cmd_event = CommandEvent().fromcommand(operation)
        cmd_event.initialize(func=character.action.NORMAL_ATK)
        simulation.event_queue.put(cmd_event)
    elif operation.action == 'E':
        cmd_event = CommandEvent().fromcommand(operation)
        cmd_event.initialize(func=character.action.ELEM_SKILL)
        simulation.event_queue.put(cmd_event)
    elif operation.action == 'Q':
        cmd_event = CommandEvent().fromcommand(operation)
        cmd_event.initialize(func=character.action.ELEM_BURST)
        simulation.event_queue.put(cmd_event)
    elif operation.action == 'S':
        action_event = ActionEvent(time=operation.time,
                                   subtype=ActionType.SPRINT,
                                   sourcename='User',
                                   desc=f'{operation.source}.sprint')
        simulation.event_queue.put(action_event)
    elif operation.action == 'J':
        action_event = ActionEvent(time=operation.time,
                                   subtype=ActionType.JUMP,
                                   sourcename='User',
                                   desc=f'{operation.source}.jump')
        simulation.event_queue.put(action_event)
