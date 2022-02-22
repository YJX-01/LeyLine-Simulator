from random import random
from typing import TYPE_CHECKING
from core.entities.creation import *
from core.entities.panel import EntityPanel
from core.rules.alltypes import *
from core.rules.skill import Skill
from core.simulation.constraint import *
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class AlbedoElemskill(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.ELEM_SKILL,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.elemskill_lv,
            elem_type=ElementType.GEO,
            action_type=ActionType.ELEM_SKILL,
            damage_type=DamageType.ELEM_SKILL,
            scaler=albedo.action.elemskill_scaler,
        )
        self.cd = None
        self.creations: Creation = SolarIsotoma(self)

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent') -> None:
        for c in simulation.active_constraint:
            if isinstance(c, DurationConstraint) and not c.test(event):
                return
        if simulation.uni_action_constraint and not simulation.uni_action_constraint.test(event):
            return
        if self.cd and not self.cd.test(event):
                return
        self.cd = self.elemskill_cd(event.time)
        mode = event.mode    
        
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                func=self.elemskill_action_event,
                                desc=f'Albedo.elemskill.action')
        simulation.event_queue.put(action_event)

        self.creations.mode = mode
        creation_event = CreationEvent()
        creation_event.initialize(time=event.time+0.05,
                                  source=self,
                                  sourcename=self.sourcename,
                                  subtype='creation',
                                  func=self.elemskill_creation_event,
                                  desc=f'Albedo.elemskill.creation')
        simulation.event_queue.put(creation_event)

        if mode == '0':
            return
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+0.05,
                                scaler=self.scaler[str(self.LV)][0],
                                mode=mode,
                                desc='Albedo.elemskill.damage')
        simulation.event_queue.put(damage_event)


    @staticmethod
    def elemskill_cd(start):
        def f(ev: Event):
            if ev.type == EventType.COMMAND and ev.desc == 'CMD.Albedo.E':
                return True
            else:
                return False

        cd_counter = DurationConstraint(start, 4, f)
        cd_counter.refresh()
        return cd_counter

    def elemskill_action_event(self, simulation: 'Simulation', event: 'Event'):
        simulation.uni_action_constraint = DurationConstraint(
            event.time, 0.1,
            lambda ev: True if ev.type == EventType.COMMAND else False
        )
        return

    def elemskill_creation_event(self, simulation: 'Simulation', event: 'Event'):
        creation_space = CreationSpace()
        self.creations.initialize(event.time)
        creation_space.insert(self.creations)


class SolarIsotoma(TriggerableCreation):
    def __init__(self, skill: AlbedoElemskill):
        super().__init__()
        self.source = skill
        self.attr_panel = EntityPanel(skill.source)
        self.start = 0
        self.duration = 30
        self.exist_num = 1
        self.scaler = skill.scaler[str(skill.LV)]
        self.skills = TransientBlossom(self)
        self.trigger_func = self.solarisotoma_trigger

    def initialize(self, start):
        self.start = start
        self.skills = TransientBlossom(self)

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if not self.solarisotoma_trigger(simulation, event):
            return
        self.skills(simulation, event)

    def solarisotoma_trigger(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.DAMAGE and event.time < self.start+self.duration:
            return True
        else:
            return False


class TransientBlossom(Skill):
    def __init__(self, solar: SolarIsotoma):
        super().__init__(
            type=SkillType.CREATION_TRIG,
            source=solar,
            sourcename=solar.source.sourcename,
            elem_type=ElementType.GEO,
            action_type=ActionType.ELEM_SKILL,
            damage_type=DamageType.ELEM_SKILL,
            scaler=solar.scaler)
        self.cd = self.blossom_cd(solar.start-2)

    def __call__(self, simulation: 'Simulation', event: 'Event') -> None:
        if not self.cd.test(event):
            return
        mode = self.source.mode
        
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+0.05,
                                scaler=self.scaler[1],
                                mode=mode,
                                desc='Albedo.transientblossom.damage')
        simulation.event_queue.put(damage_event)

        if mode == '$':
            extra_ball = int(random() <= 2/3)
        else:
            extra_ball = 2/3
        energy_event = EnergyEvent()
        energy_event.initialize(time=event.time+1,
                                source=self,
                                sourcename=self.sourcename,
                                func=self.elemskill_energy_event,
                                desc='Albedo.energy',
                                elem=ElementType.GEO,
                                base=1,
                                num=1+extra_ball)
        simulation.event_queue.put(energy_event)


    @staticmethod
    def blossom_cd(start):
        def f(ev: 'Event'):
            if ev.type == EventType.DAMAGE or isinstance(ev.source, TransientBlossom):
                return True
            else:
                return False
            
        cd_counter = DurationConstraint(start, 2, f)
        cd_counter.refresh()
        return cd_counter

    @staticmethod
    def elemskill_energy_event(simulation: 'Simulation', event: 'Event'):
        for name, character in simulation.characters.items():
            character.action.ELEM_BURST.receive_energy(simulation, event)
