from typing import TYPE_CHECKING, Callable, Union, List
from core.rules.dnode import DNode
from core.rules.skill import Skill
from core.rules.alltypes import ElementType, EventType, ElementalReactionType
from core.simulation.constraint import DurationConstraint
if TYPE_CHECKING:
    from core.entities.buff import Buff
    from core.simulation.simulation import Simulation


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
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function
        - you need to set:\n
        ### time, source(char name), desc
        '''
        super().__init__(type=EventType.SWITCH, sourcename='User')
        self.initialize(**configs)

    def execute(self, simulation: 'Simulation'):
        if simulation.uni_switch_constraint and not simulation.uni_switch_constraint.test(self):
            simulation.output_log.append(
                f'[REJECT]:[{self.time}s: {self.desc}; reason: switch collision]')
            return
        simulation.output_log.append(self.prefix_info)
        simulation.onstage = self.source


class ActionEvent(Event):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function |
        ### dur
        - subtype: ActionType\n
        - desc format: char.skillname.other
        '''
        super().__init__(type=EventType.ACTION)
        self.dur: float = 0
        self.initialize(**configs)

    def fromskill(self, skill: Skill):
        '''
        after this function you need to set:\n
        ### time, dur, desc, (func)
        '''
        if not isinstance(skill, Skill):
            raise TypeError('should be a skill object')
        self.subtype = skill.action_type
        self.source = skill
        self.sourcename = skill.sourcename
        return self

    @property
    def prefix_info(self) -> str:
        return super().prefix_info +\
            f'\n\t\t[duration]:[ {self.dur} ]'

    def execute(self, simulation: 'Simulation'):
        simulation.output_log.append(self.prefix_info)
        simulation.uni_action_constraint = DurationConstraint(
            self.time, self.dur, lambda ev: ev.type == EventType.COMMAND
        )


class DamageEvent(Event):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function | 
        ### elem, depend, scaler, mode, icd
        - subtype: DamageType
        - desc format: obj.damagename.other
        '''
        super().__init__(type=EventType.DAMAGE)
        self.elem: ElementType = ElementType(0)
        self.depend: str = 'ATK'
        self.scaler: float = 0
        self.mode: str = ''
        self.icd: object = None
        self.initialize(**configs)

    def fromskill(self, skill: Skill):
        '''
        after this function you need to set:\n
        ### time, (depend), scaler, mode, icd, desc, (func)
        '''
        if not isinstance(skill, Skill):
            raise TypeError('should be a skill object')
        self.subtype = skill.damage_type
        self.elem = skill.elem_type
        self.source = skill
        self.sourcename = skill.sourcename
        return self

    @property
    def prefix_info(self) -> str:
        return super().prefix_info +\
            f'\n\t\t[info   ]:[ {self.elem}; {self.scaler}; {self.depend}; {self.mode} ]'


class EnergyEvent(Event):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function | 
        ### elem, base, num, receiver(List[name]|None)
        when base is int(1|2|3|6), it is orb or particle\\
        when base is 0, it is constant energy restore\n
        - subtype: particle, orb, const\n
        - you need to set:\n
        ### time, source, sourname, elem, base, num, (receiver) desc, (func)
        - desc format: obj.(skillname).energy
        '''
        super().__init__(type=EventType.ENERGY)
        self.elem: ElementType = ElementType.NONE
        self.base: int = 0
        self.num: float = 0
        self.receiver: Union[List[str], None] = None
        self.initialize(**configs)

    @property
    def prefix_info(self) -> str:
        if self.base:
            self.subtype = 'particle' if self.base <= 2 else 'orb'
        else:
            self.subtype = 'const'
        return super().prefix_info +\
            f'\n\t\t[info   ]:[ {self.elem}; {self.base}; {self.num} ]'

    def execute(self, simulation: 'Simulation'):
        simulation.output_log.append(self.prefix_info)
        if self.base:
            base = self.base*self.num
            for name, character in simulation.characters.items():
                increment = base if name == simulation.onstage \
                    else base * (1-0.1*len(simulation.characters))
                if self.elem.value == character.base.element:
                    increment *= 3
                increment *= character.attribute.ER.value
                character.energy.receive(increment)
        else:
            for name in self.receiver:
                simulation.characters[name].energy.receive(self.num)


class ElementEvent(Event):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function |
        ### elem, num(GU/mul), react
        - subtype: apply, reaction\n
        - you need to set:\n
        ### time, subtype, source, sourcename, elem, num, (react), desc
        '''
        super().__init__(type=EventType.ELEMENT)
        self.elem: ElementType = ElementType.NONE
        self.num: int = 0
        self.react: ElementalReactionType = ElementalReactionType.NONE
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
        ### type, subtype, source, sourcename, time, desc, function | 
        ### duration
        - subtype: BuffType
        '''
        super().__init__(type=EventType.BUFF)
        self.duration: float = 0
        self.initialize(**configs)

    def frombuff(self, buff: 'Buff'):
        self.subtype = buff.type
        self.sourcename = buff.sourcename
        self.time = buff.constraint.start
        self.duration = buff.constraint.duration
        self.desc = buff.name
        return self

    @property
    def prefix_info(self) -> str:
        return super().prefix_info+'\n\t\t[duration]:[ {:.2f}-{:.2f} ]'.format(self.time, self.time+self.duration)


class NumericEvent(Event):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function | 
        ### obj
        - subtype: NumericType
        - you need to set:\n
        ### time, subtype, sourcename, obj, desc
        '''
        super().__init__(type=EventType.NUMERIC)
        self.obj: DNode = None
        self.initialize(**configs)

    @property
    def prefix_info(self) -> str:
        return super().prefix_info+'\n\t\t[number ]:[ {:.1f} ]'.format(self.obj.value)


class HealthEvent(Event):
    def __init__(self, **configs):
        '''
        attributes: \n
        ### type, subtype, source, sourcename, time, desc, function | 
        ### depend, scaler, target
        - subtype: HealthType
        - you need to set:\n
        ### time, subtype, source, sourcename, depend, scaler, target, desc
        '''
        super().__init__(type=EventType.HEALTH)
        self.depend: str = 'HP'
        self.scaler: List[float] = []
        self.target: List[str] = []
        self.initialize(**configs)

    @property
    def prefix_info(self) -> str:
        return super().prefix_info +\
            f'\n\t\t[info   ]:[ {self.scaler}; {self.depend} ]'
