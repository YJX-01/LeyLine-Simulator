from random import random
from typing import TYPE_CHECKING
from core.entities.creation import TriggerableCreation, Creation, CreationSpace
from core.entities.panel import EntityPanel
from core.rules.alltypes import *
from core.rules.skill import Skill
from core.rules.icd import ICD
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
            action_time=albedo.action.elemskill_time,
            scaler=albedo.action.elemskill_scaler,
        )
        self.cd = None
        self.creations: Creation = SolarIsotoma(self)

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent') -> None:
        # check action collision
        if simulation.uni_action_constraint and not simulation.uni_action_constraint.test(event):
            self.reject_event(simulation, event, reason='action collision')
            return
        # check cd
        elif self.cd and not self.cd.test(event):
            self.reject_event(simulation, event, reason='cd')
            return

        # check finish, reset cd (cd has begin delay)
        self.cd = self.elemskill_cd(event.time+self.action_time[0]/60)

        # fetch mode and other information
        mode = event.mode
        act_t: float = self.action_time[1]/60

        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc='Albedo.elem_skill')
        simulation.event_queue.put(action_event)

        # creation event
        self.creations.mode = mode
        creation_event = CreationEvent()
        creation_event.initialize(time=event.time+act_t,
                                  subtype='creation',
                                  source=self,
                                  sourcename=self.sourcename,
                                  func=self.elemskill_creation_event,
                                  desc='Albedo.elem_skill')
        simulation.event_queue.put(creation_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[1])
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=self.scaler[skill_lv][0],
                                mode=mode,
                                icd=ICD('', '',
                                        event.time+act_t, 1),
                                desc='Albedo.elem_skill')
        simulation.event_queue.put(damage_event)

    @staticmethod
    def reject_event(sim, ev: 'Event', reason):
        sim.output_log.append(
            f'[REJECT]:[{ev.time}s: {ev.desc}; reason: {reason}]')

    @staticmethod
    def elemskill_cd(start):
        def f(ev: Event):
            return ev.type == EventType.COMMAND and ev.desc == 'CMD.Albedo.E'
        cd_counter = DurationConstraint(start, 4, func=f, refresh=True)
        return cd_counter

    def elemskill_creation_event(self, simulation: 'Simulation', event: 'Event'):
        creation_space = CreationSpace()
        self.creations.activate(event.time)
        creation_space.insert(self.creations)


class SolarIsotoma(TriggerableCreation):
    def __init__(self, skill: AlbedoElemskill):
        super().__init__(
            source=skill,
            sourcename='Albedo',
            name='Solar Isotoma',
            attr_panel=EntityPanel(skill.source),
            start=0,
            duration=30,
            exist_num=1,
            scaler=skill.scaler[str(skill.source.talent[1])],
        )
        self.skills = TransientBlossom(self)

    def activate(self, start):
        self.start = start
        self.scaler = self.source.scaler[str(
            self.source.source.talent[1])]
        self.attr_panel = EntityPanel(self.source.source)
        self.skills = TransientBlossom(self)

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.DAMAGE and event.time < self.end:
            if event.subtype == DamageType.ELEM_BURST and event.sourcename == 'Albedo':
                return
            self.skills(simulation, event)


class TransientBlossom(Skill):
    def __init__(self, solar: SolarIsotoma):
        super().__init__(
            type=SkillType.CREATION_TRIG,
            source=solar,
            sourcename=solar.source.sourcename,
            elem_type=ElementType.GEO,
            action_type=ActionType.ELEM_SKILL,
            damage_type=DamageType.ELEM_SKILL,
            scaler=solar.scaler
        )
        self.cd = self.blossom_cd(solar.start-2)

    def __call__(self, simulation: 'Simulation', event: 'Event') -> None:
        if not self.cd.test(event):
            return
        mode = self.source.mode

        # damage event
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+0.02,
                                depend='DEF',
                                scaler=self.scaler[1],
                                mode=mode,
                                icd=ICD('elem_skill', '',
                                        event.time, 1),
                                desc='Albedo.transientblossom')
        simulation.event_queue.put(damage_event)

        if mode == '$':
            extra_ball = int(random() <= 2/3)
        else:
            extra_ball = 2/3
        energy_event = EnergyEvent(time=event.time+simulation.energy_delay,
                                   source=self,
                                   sourcename=self.sourcename,
                                   elem=ElementType.GEO,
                                   base=1,
                                   num=1+extra_ball,
                                   desc='Albedo.energy')
        simulation.event_queue.put(energy_event)

    @staticmethod
    def blossom_cd(start):
        def f(ev: 'Event'):
            return ev.type == EventType.DAMAGE and not isinstance(ev.source, TransientBlossom)
        cd_counter = DurationConstraint(start, 2, func=f, refresh=True)
        return cd_counter
