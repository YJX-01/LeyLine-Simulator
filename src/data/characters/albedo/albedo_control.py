from typing import TYPE_CHECKING
from core.rules.alltypes import ActionType
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.simulation.operation import Operation
    

def Albedo_controller(operation: 'Operation', simulation: 'Simulation'):
    character = simulation.characters[operation.source]
    if operation.action == 'A':
        cmd_event = CommandEvent().fromcommand(operation)
        cmd_event.initialize(func=character.action.NORMAL_ATK)
        simulation.output_log.append(cmd_event.prefix_info)
        simulation.event_queue.put(cmd_event)
    elif operation.action == 'E':
        cmd_event = CommandEvent().fromcommand(operation)
        cmd_event.initialize(func=character.action.ELEM_SKILL)
        simulation.output_log.append(cmd_event.prefix_info)
        simulation.event_queue.put(cmd_event)
    elif operation.action == 'Q':
        cmd_event = CommandEvent().fromcommand(operation)
        cmd_event.initialize(func=character.action.ELEM_BURST)
        simulation.output_log.append(cmd_event.prefix_info)
        simulation.event_queue.put(cmd_event)
    elif operation.action == 'Z':
        pass
    elif operation.action == 'P':
        pass
    elif operation.action == 'S':
        action_event = ActionEvent(time=operation.time,
                                   subtype=ActionType.SPRINT,
                                   func=lambda *args: None,
                                   desc=f'{operation.source}.sprint')
        simulation.output_log.append(action_event.prefix_info)
        simulation.event_queue.put(action_event)
    elif operation.action == 'J':
        pass
