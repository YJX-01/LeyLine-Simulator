from random import random
from typing import TYPE_CHECKING, Sequence
from core.entities.creation import *
from core.rules.alltypes import *
from core.rules.skill import Skill, NormalAttack
from core.simulation.constraint import *
from core.simulation.event import Event
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class AlbedoNormATK(NormalAttack):
    def __init__(self, albedo: 'Character') -> None:
        super().__init__()
        self.type = 'normatk'
        self.source = albedo
        self.LV = 1
        self.elem_type = ElementType.GEO
        self.action_type = ActionType.NORMAL_ATK
        self.damage_type = DamageType.NORMAL_ATK
        self.scaler = albedo.base.ATK

        self.cir_cnt = self.albedo_norm_atk_circulation_counter()

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        for c in simulation.active_constraint:
            if isinstance(c, DurationConstraint) and not c(event):
                return
        act_cnt: int = self.cir_cnt(simulation.event_log)
        print(f'\t\taction circulation counter: {act_cnt}')
        action_event = Event(time=event.time,
                             source=self,
                             type=EventType.ACTION,
                             func=self.normatk_action_event,
                             desc=f'Albedo.normatk.{act_cnt}',
                             info={'type': self.action_type})

        damage_event = Event(time=event.time+0.2,
                             source=self,
                             type=EventType.DAMAGE,
                             func=self.normatk_damage_event,
                             desc='Albedo.damage',
                             info={'type': self.damage_type})

        simulation.event_queue.put(action_event)
        simulation.event_queue.put(damage_event)

        simulation.active_constraint.append(DurationConstraint(
            event.time, 0.1,
            lambda ev: True if ev.type == EventType.COMMAND else False
        ))

    @staticmethod
    def albedo_norm_atk_circulation_counter():
        def f(ev: 'Event'):
            if ev.type == EventType.ACTION and isinstance(ev.source, AlbedoNormATK):
                return 1
            elif ev.type == EventType.ACTION:
                return -10
            else:
                return 0

        circulation_counter = CounterConstraint(0, 1000, 5, f)
        circulation_counter.circulate()
        return circulation_counter

    @staticmethod
    def normatk_action_event(simulation: 'Simulation', event: 'Event'):
        print('\t\talbedo normal atk action event happen')
        print('\t\tapply action duration constraint')

    @staticmethod
    def normatk_damage_event(simulation: 'Simulation', event: 'Event'):
        print('\t\talbedo normal atk damage event happen')

    @staticmethod
    def normatk_energy_event(simulation: 'Simulation', event: 'Event'):
        print('\t\tnormal atk energy restore event')


class AlbedoElemskill(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__()
        self.type = 'elemskill'
        self.source = albedo
        self.elem_type = ElementType.GEO
        self.action_type = ActionType.ELEM_SKILL
        self.damage_type = DamageType.ELEM_SKILL
        self.scaler = albedo.base.ATK
        self.creations = SolarIsotoma(self)

        self.cd = None

    def __call__(self, simulation: 'Simulation', event: 'Event') -> None:
        for c in simulation.active_constraint:
            if isinstance(c, DurationConstraint) and not c(event):
                return
        if self.cd and not self.cd(event):
            return
        self.cd = self.elemskill_cd(event.time)
        action_event = Event(time=event.time,
                             source=self,
                             type=EventType.ACTION,
                             func=self.elemskill_action_event,
                             desc=f'Albedo.elemskill',
                             info={'type': self.action_type})

        creation_event = Event(time=event.time+0.05,
                               source=self,
                               type=EventType.CREATION_ACT,
                               func=self.elemskill_creation_event,
                               desc=f'Albedo.creation',
                               info={'type': 'create'})

        damage_event = Event(time=event.time+0.05,
                             source=self,
                             type=EventType.DAMAGE,
                             func=self.elemskill_damage_event,
                             desc='Albedo.elemskill',
                             info={'type': self.damage_type})

        simulation.event_queue.put(action_event)
        simulation.event_queue.put(creation_event)
        simulation.event_queue.put(damage_event)

        simulation.active_constraint.append(DurationConstraint(
            event.time, 0.1,
            lambda ev: True if ev.type == EventType.COMMAND else False
        ))

    @staticmethod
    def elemskill_cd(start):
        def f(ev: Event):
            if ev.type == EventType.ACTION and isinstance(ev.source, AlbedoElemskill):
                return True
            elif ev.type == EventType.COMMAND and ev.source == 'User':
                return True
            else:
                return False

        cd_counter = DurationConstraint(start, 12, f)
        cd_counter.refresh()
        return cd_counter

    @staticmethod
    def elemskill_action_event(simulation: 'Simulation', event: 'Event'):
        print('\t\talbedo elem skill action event happen')

    def elemskill_creation_event(self, simulation: 'Simulation', event: 'Event'):
        creation_space = CreationSpace()
        self.creations.initialize(event.time)
        creation_space.insert(self.creations)
        print('\t\tcreate solar isotoma')

    @staticmethod
    def elemskill_damage_event(simulation: 'Simulation', event: 'Event'):
        print('\t\talbedo elem skill damage event happen')


class AlbedoElemburst(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__()
        self.type = 'elembrust'
        self.source = albedo
        self.elem_type = ElementType.GEO
        self.action_type = ActionType.ELEM_BURST
        self.damage_type = DamageType.ELEM_BURST
        self.scaler = albedo.base.ATK

        self.cd = None
        self.energy = CounterConstraint(0, 1000, 40)
    
    def __call__(self, simulation: 'Simulation', event: 'Event'):
        for c in simulation.active_constraint:
            if isinstance(c, DurationConstraint) and not c(event):
                return
        if self.cd and not self.cd(event):
            return
        if not self.energy.full:
            print('warning: force activate, energy:', self.energy.count)
        self.energy.clear()
        self.cd = self.elemburst_cd(event.time)
        action_event = Event(time=event.time,
                             source=self,
                             type=EventType.ACTION,
                             func=self.elemburst_action_event,
                             desc=f'Albedo.elemburst',
                             info={'type': self.action_type})

        damage_event = Event(time=event.time+0.05,
                             source=self,
                             type=EventType.DAMAGE,
                             func=self.elemburst_damage_event,
                             desc='Albedo.elemburst',
                             info={'type': self.damage_type})

        simulation.event_queue.put(action_event)
        simulation.event_queue.put(damage_event)

        simulation.active_constraint.append(DurationConstraint(
            event.time, 0.1,
            lambda ev: True if ev.type == EventType.COMMAND else False
        ))

    def receive_energy(self, simulation: 'Simulation', event: 'Event'):
        elem_type: ElementType = event.info.get('elem')
        add_base: int = event.info.get('base')
        add_num: int = event.info.get('num')
        increase = add_base*add_num
        if elem_type.value == self.source.base.element:
            increase*=3
        elif elem_type == ElementType.NONE:
            increase*=2
            
        if simulation.onstage != self.source.name:
            increase *= (1-0.1*len(simulation.characters))

        increase *= simulation.characters[self.source.name].attribute.ER()
        self.energy.receive(increase)
    
    @staticmethod
    def elemburst_cd(start):
        def f(ev: Event):
            if ev.type == EventType.ACTION and isinstance(ev.source, AlbedoElemburst):
                return True
            elif ev.type == EventType.COMMAND and ev.source == 'User':
                return True
            else:
                return False

        cd_counter = DurationConstraint(start, 12, f)
        cd_counter.refresh()
        return cd_counter
    
    @staticmethod
    def elemburst_action_event(simulation: 'Simulation', event: 'Event'):
        print('\t\talbedo elem burst action event happen')

    @staticmethod
    def elemburst_damage_event(simulation: 'Simulation', event: 'Event'):
        print('\t\talbedo elem burst damage event happen')


class SolarIsotoma(TriggerableCreation):
    def __init__(self, skill: AlbedoElemskill):
        super().__init__()
        self.source = skill
        self.start = 0
        self.duration = 30
        self.exist_num = 1
        self.scaler = skill.scaler
        self.skills = TransientBlossom(self)
        self.trigger_func = self.solarisotoma_trigger

    def initialize(self, start):
        self.start = start
        self.skills = TransientBlossom(self)

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if not self.solarisotoma_trigger(simulation, event):
            return
        print('\t\tcall solar istoma object')
        self.skills(simulation, event)

    def solarisotoma_trigger(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.DAMAGE and event.time < self.start+self.duration:
            return True
        else:
            return False


class TransientBlossom(Skill):
    def __init__(self, solar: SolarIsotoma):
        super().__init__()
        self.type = 'elemskill'
        self.source = solar
        self.elem_type = ElementType.GEO
        self.action_type = ActionType.ELEM_SKILL
        self.damage_type = DamageType.ELEM_SKILL
        self.scaler = solar.scaler
        self.cd = self.blossom_cd(solar.start-1)

    def __call__(self, simulation: 'Simulation', event: 'Event') -> None:
        if not self.cd(event):
            return
        self.cd = self.blossom_cd(event.time)
        damage_event = Event(time=event.time+0.05,
                             source=self,
                             type=EventType.DAMAGE,
                             func=self.blossom_damage_event,
                             desc='Albedo.transientblossom',
                             info={'type': self.damage_type})

        extra_ball = int(random() <= 2/3)
        energy_event = Event(time=event.time+0.05,
                             source=self,
                             type=EventType.ENERGY,
                             func=self.elemskill_energy_event,
                             desc='Albedo.give_energy',
                             info={'elem': ElementType.GEO,
                                   'base': 1,
                                   'num': 1+extra_ball})
        simulation.event_queue.put(damage_event)
        simulation.event_queue.put(energy_event)

    @staticmethod
    def blossom_cd(start):
        def f(ev: 'Event'):
            if ev.type == EventType.DAMAGE or isinstance(ev.source, TransientBlossom):
                return True
            else:
                return False
        cd_counter = DurationConstraint(start, 1, f)
        cd_counter.refresh()
        return cd_counter

    @staticmethod
    def blossom_damage_event(simulation: 'Simulation', event: 'Event'):
        print('\t\ttransient blossom damage event happen')

    @staticmethod
    def elemskill_energy_event(simulation: 'Simulation', event: 'Event'):
        print('\t\telem skill create element particles')
        for name, character in simulation.characters.items():
            character.action.ELEM_BURST.receive_energy(simulation, event)
        print('\t\tand characters receive particles')
