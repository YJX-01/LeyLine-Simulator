from typing import TYPE_CHECKING
from core.entities.creation import *
from core.rules.alltypes import *
from core.rules.skill import Skill
from core.rules.icd import ICD
from core.simulation.constraint import *
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class JeanElemburst(Skill):
    def __init__(self, jean: 'Character'):
        super().__init__(
            type=SkillType.ELEM_BURST,
            source=jean,
            sourcename=jean.name,
            LV=jean.attribute.elemburst_lv,
            elem_type=ElementType.ANEMO,
            action_type=ActionType.ELEM_BURST,
            damage_type=DamageType.ELEM_BURST,
            action_time=jean.action.elemburst_time,
            scaler=jean.action.elemburst_scaler
        )
        self.cd = self.elemburst_cd(-20)
        self.energy = CounterConstraint(0, 1000, 80)
        self.creations: Creation = None

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        # check action collision
        if simulation.uni_action_constraint and not simulation.uni_action_constraint.test(event):
            self.reject_event(simulation, event, reason='action collision')
            return
        # check cd
        elif self.cd and not self.cd.test(event):
            self.reject_event(simulation, event, reason='cd')
            return
        # check energy
        elif not self.energy.full:
            if self.energy.capacity - self.energy.count <= simulation.energy_tolerance:
                simulation.output_log.append(
                    f'[WARNING]:[{self.sourcename} force activate, energy: {self.energy.count}]')
            else:
                self.reject_event(simulation, event, reason='energy')
                return

        # check finish, clear energy, reset cd (cd has begin delay)
        delay_time = event.time+self.action_time[0]/60
        self.cd = self.elemburst_cd(delay_time)
        clear_event = EnergyEvent(time=delay_time, sourcename=self.sourcename,
                                  num=-self.energy.capacity, receiver=[self.sourcename])
        simulation.event_queue.put(clear_event)

        # fetch mode and other information
        mode = event.mode
        act_t: float = self.action_time[1]/60  # frame delay

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                cd=self.cd.end,
                                desc='Jean.elem_burst')
        simulation.event_queue.put(action_event)
        
        self.elemburst_creation_event(simulation, event)
        
        skill_lv = str(self.source.talent[2])
        health_event = HealthEvent()
        health_event.initialize(time=event.time,
                                subtype=HealthType.HEAL,
                                source=self,
                                sourcename=self.sourcename,
                                depend='ATK',
                                scaler=[self.scaler[skill_lv][2], self.scaler[skill_lv][3]],
                                target=list(simulation.shortcut.values()),
                                desc='Jean.elem_burst')
        simulation.event_queue.put(health_event)

        # damage event
        if mode == '0':
            return
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=self.scaler[skill_lv][0],
                                mode=mode,
                                icd=ICD('', '',
                                        event.time+act_t, 2),
                                desc='Jean.elem_burst')
        simulation.event_queue.put(damage_event)

    @staticmethod
    def reject_event(sim, ev: 'Event', reason):
        sim.output_log.append(
            f'[REJECT]:[{ev.time}s: {ev.desc}; reason: {reason}]')

    @staticmethod
    def elemburst_cd(start):
        def f(ev: Event):
            return ev.type == EventType.COMMAND and ev.desc == 'CMD.Jean.Q'
        cd_counter = DurationConstraint(start, 18, func=f, refresh=True)
        return cd_counter

    def elemburst_creation_event(self, simulation: 'Simulation', event: 'CommandEvent'):
        self.creations = DandelionField(self)
        self.creations.activate(simulation, event)
        creation_space = CreationSpace()
        creation_space.insert(self.creations)


class DandelionField(IndependentCreation):
    def __init__(self, skill: JeanElemburst):
        super().__init__(
            source=skill,
            sourcename='Jean',
            name='Dandelion Field',
            start=0,
            duration=10,
            exist_num=1,
            scaler=skill.scaler[str(skill.source.talent[2])]
        )
        self.skills = DandelionHeal(self)
    
    def activate(self, simulation: 'Simulation', event: 'Event'):
        self.mode = event.mode
        self.start = event.time
        creation_event = CreationEvent()
        creation_event.initialize(time=event.time,
                                  subtype='creation',
                                  source=self,
                                  sourcename=self.sourcename,
                                  desc='Jean.dandelion_field')
        simulation.event_queue.put(creation_event)
        self.selfexcite_func(simulation, event)

    def selfexcite_func(self, simulation: 'Simulation', event: 'Event'):
        creation_event = CreationEvent()
        creation_event.initialize(time=event.time+1,
                                  subtype='selfexcite',
                                  source=self,
                                  sourcename=self.sourcename,
                                  desc='Jean.dandelion_field')
        simulation.event_queue.put(creation_event)

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if isinstance(event.source, DandelionField) and event.subtype == 'selfexcite' and event.time <= self.end:
            self.skills(simulation, event)
            self.selfexcite_func(simulation, event)

class DandelionHeal(Skill):
    def __init__(self, field: DandelionField):
        super().__init__(
            type=SkillType.CREATION_TRIG,
            source=field,
            sourcename='Jean',
            action_type=ActionType.ELEM_SKILL,
            scaler=field.scaler
        )
    
    def __call__(self, simulation: 'Simulation', event: 'Event'):
        health_event = HealthEvent()
        health_event.initialize(time=event.time,
                                subtype=HealthType.HEAL,
                                source=self,
                                sourcename=self.sourcename,
                                depend='ATK',
                                scaler=[self.scaler[4], self.scaler[5]],
                                target=list(simulation.shortcut.values()),
                                desc='Jean.dandelion_field')
        simulation.event_queue.put(health_event)
