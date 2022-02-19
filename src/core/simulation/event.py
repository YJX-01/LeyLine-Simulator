from typing import Callable
from core.rules.skill import Skill
from core.rules.alltypes import ElementType, EventType


class Event(object):
    def __init__(self, **configs):
        self.type: EventType = EventType(0)
        self.subtype = None
        self.source: object = None
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
        tmp = self.source
        while(not hasattr(tmp, 'name') and not isinstance(tmp, str)):
            tmp = tmp.source
        if hasattr(tmp, 'name'):
            tmp = tmp.name
        sourcename = f'\t\t[source ]:[ {tmp} ]'
        desc = f'\t\t[desc   ]:[ {self.desc} ]'
        return '\n'.join([title, subtitle, sourcename, desc])

    def execute(self, simulation):
        if self.func:
            self.func(simulation, self)


class CommandEvent(Event):
    def __init__(self, **configs):
        super().__init__(type=EventType.COMMAND, source='User')
        self.cmd: str = ''
        self.condition: str = ''
        self.initialize(**configs)

    def fromcommand(self, operation):
        self.time = operation.time
        self.cmd = operation.action
        self.condition = operation.condition
        self.desc = f'CMD.{operation.source}.{operation.action}'
        return self


class SwitchEvent(Event):
    def __init__(self, **configs):
        super().__init__(type=EventType.SWITCH, source='User')
        self.initialize(**configs)


class ActionEvent(Event):
    def __init__(self, **configs):
        super().__init__(type=EventType.ACTION)
        self.initialize(**configs)

    def fromskill(self, skill: Skill):
        if not isinstance(skill, Skill):
            raise TypeError('should be a skill object')
        self.subtype = skill.action_type
        self.source = skill
        return self


class DamageEvent(Event):
    def __init__(self, **configs):
        super().__init__(type=EventType.DAMAGE)
        self.initialize(**configs)

    def fromskill(self, skill: Skill):
        if not isinstance(skill, Skill):
            raise TypeError('should be a skill object')
        self.subtype = skill.damage_type
        self.source = skill
        self.elem = skill.elem_type
        return self


class EnergyEvent(Event):
    def __init__(self, **configs):
        super().__init__(type=EventType.ENERGY)
        self.elem: ElementEvent = ElementType(0)
        self.base: int = 0
        self.num: float = 0
        self.initialize(**configs)


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


class BuffEvents(Event):
    def __init__(self, **configs):
        super().__init__(type=EventType.BUFF)
        self.initialize(**configs)


class NumericEvents(Event):
    def __init__(self, **configs):
        super().__init__(type=EventType.NUMERIC)
        self.initialize(**configs)
