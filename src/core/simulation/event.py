from typing import Callable
from core.rules.dnode import DNode
from core.rules.skill import Skill
from core.rules.alltypes import ElementType, EventType


class Event(object):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function
        '''
        self.type: EventType = EventType(0)
        self.subtype = None
        self.source: object = None
        self.sourcename: str = ''
        self.time: float = 0
        self.desc: str = ''
        self.func: Callable = None
        self.initialize(**configs)

    def initialize(self, **configs):
        for k, v in configs.items():
            self.__setattr__(k, v)

    def __lt__(self, other: object) -> bool:
        if self.time != other.time:
            return self.time < other.time
        elif self.type != other.type:
            return self.type.value < other.type.value
        elif self.desc != other.desc:
            return self.desc < other.desc

    @property
    def time_str(self) -> str:
        return format(self.time, '0.2f')

    @property
    def prefix_info(self) -> str:
        title = f'\t[{self.time_str}s]:[type   ]:[ {self.type.name} ]'
        subtitle = f'\t\t[subtype]:[ {self.subtype} ]'
        sourcename = f'\t\t[source ]:[ {self.sourcename} ]'
        desc = f'\t\t[desc   ]:[ {self.desc} ]'
        return '\n'.join([title, subtitle, sourcename, desc])

    def execute(self, simulation):
        if self.func:
            self.func(simulation, self)
        simulation.output_log.append(self.prefix_info)


class CommandEvent(Event):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function | cmd, condition
        '''
        super().__init__(type=EventType.COMMAND, sourcename='User')
        self.cmd: str = ''
        self.condition: str = ''
        self.initialize(**configs)

    def fromcommand(self, operation):
        '''
        after this function you need to set:\n
        ### func
        '''
        self.time = operation.time
        self.cmd = operation.action
        self.mode = operation.condition
        self.desc = f'CMD.{operation.source}.{operation.action}'
        return self

    @property
    def prefix_info(self) -> str:
        return super().prefix_info+f'\n\t\t[mode   ]:[ {self.mode} ]'


class SwitchEvent(Event):
    def __init__(self, **configs):
        super().__init__(type=EventType.SWITCH, sourcename='User')
        self.initialize(**configs)

    def execute(self, simulation):
        super().execute(simulation)
        simulation.output_log.append(self.prefix_info)


class ActionEvent(Event):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function
        '''
        super().__init__(type=EventType.ACTION)
        self.initialize(**configs)

    def fromskill(self, skill: Skill):
        '''
        after this function you need to set:\n
        ### time, desc, func
        '''
        if not isinstance(skill, Skill):
            raise TypeError('should be a skill object')
        self.subtype = skill.action_type
        self.source = skill
        self.sourcename = skill.sourcename
        return self


class DamageEvent(Event):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function | elem, depend, scaler, mode
        '''
        super().__init__(type=EventType.DAMAGE)
        self.elem = ElementType(0)
        self.depend = 'ATK'
        self.scaler = 0
        self.mode = ''
        self.initialize(**configs)

    def fromskill(self, skill: Skill):
        '''
        after this function you need to set:\n
        ### time, desc, func, depend, scaler, mode
        '''
        if not isinstance(skill, Skill):
            raise TypeError('should be a skill object')
        self.subtype = skill.damage_type
        self.source = skill
        self.sourcename = skill.sourcename
        self.elem = skill.elem_type
        return self

    @property
    def prefix_info(self) -> str:
        return super().prefix_info +\
            f'\n\t\t[info   ]:[ {self.elem}; {self.scaler}; {self.depend}; {self.mode} ]'


class EnergyEvent(Event):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function | elem, base, num
        '''
        super().__init__(type=EventType.ENERGY)
        self.elem: ElementEvent = ElementType(0)
        self.base: int = 0
        self.num: float = 0
        self.initialize(**configs)
    
    @property
    def prefix_info(self) -> str:
        return super().prefix_info+\
            f'\n\t\t[info   ]:[ {self.elem}; {self.base}; {self.num} ]'


class ElementEvent(Event):
    def __init__(self, **configs):
        super().__init__(type=EventType.ELEMENT)
        self.initialize(**configs)


class TryEvent(Event):
    def __init__(self, **configs):
        super().__init__(type=EventType.TRY)
        self.initialize(**configs)


class CreationEvent(Event):
    def __init__(self, **configs):
        super().__init__(type=EventType.CREATION)
        self.initialize(**configs)


class BuffEvent(Event):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function | duration
        '''
        super().__init__(type=EventType.BUFF)
        self.duration = None
        self.initialize(**configs)


class NumericEvent(Event):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function | obj
        '''
        super().__init__(type=EventType.NUMERIC)
        self.obj: DNode = None
        self.initialize(**configs)

    @property
    def prefix_info(self) -> str:
        return super().prefix_info+'\n\t\t[number ]:[ {:.2f} ]'.format(self.obj.value)
