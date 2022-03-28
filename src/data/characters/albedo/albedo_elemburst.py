from typing import TYPE_CHECKING
from core.entities.creation import CreationSpace, TriggerableCreation
from core.rules.alltypes import *
from core.rules.skill import Skill
from core.rules.icd import ICD
from core.simulation.constraint import *
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class AlbedoElemburst(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.ELEM_BURST,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.elemburst_lv,
            elem_type=ElementType.GEO,
            action_type=ActionType.ELEM_BURST,
            damage_type=DamageType.ELEM_BURST,
            action_time=albedo.action.elemburst_time,
            scaler=albedo.action.elemburst_scaler
        )
        self.cd = self.elemburst_cd(-12)
        self.energy = CounterConstraint(0, 1000, 40)

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
        self.energy.clear()
        self.cd = self.elemburst_cd(event.time+self.action_time[0]/60)

        # fetch mode and other information
        mode = event.mode
        act_t: float = self.action_time[1]/60

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc='Albedo.elem_burst')
        simulation.event_queue.put(action_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[2])
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=self.scaler[skill_lv][0],
                                mode=mode,
                                icd=ICD('', '',
                                        event.time+act_t, 1),
                                desc='Albedo.elem_burst')
        simulation.event_queue.put(damage_event)

        self.trigger_fatal_blossom(simulation, event)

    @staticmethod
    def reject_event(sim, ev: 'Event', reason):
        sim.output_log.append(
            f'[REJECT]:[{ev.time}s: {ev.desc}; reason: {reason}]')

    @staticmethod
    def elemburst_cd(start):
        def f(ev: Event):
            return ev.type == EventType.COMMAND and ev.desc == 'CMD.Albedo.Q'
        cd_counter = DurationConstraint(start, 12, func=f, refresh=True)
        return cd_counter

    def trigger_fatal_blossom(self, simulation: 'Simulation', event: 'Event'):
        creation_space = CreationSpace()
        for c in creation_space.creations:
            if c.name == 'Solar Isotoma' and c.end > event.time:
                skill = FatalBlossom(c)
                skill.activate(
                    self.scaler[str(self.source.talent[2])], event.mode)
                skill(simulation, event)
                return


class FatalBlossom(Skill):
    def __init__(self, isotoma: 'TriggerableCreation'):
        super().__init__(
            type=SkillType.ELEM_BURST,
            source=isotoma,
            sourcename='Albedo',
            elem_type=ElementType.GEO,
            action_type=ActionType.ELEM_BURST,
            damage_type=DamageType.ELEM_BURST,
            action_time=isotoma.source.source.action.elemburst_time
        )
        self.mode = None

    def activate(self, scaler, mode):
        self.scaler = scaler
        self.mode = mode

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        act_t: float = self.action_time[1]/60
        # damage event
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=self.scaler[1],
                                mode=self.mode,
                                icd=ICD('elem_skill', '',
                                        event.time, 1),
                                desc='Albedo.elem_burst.fatal_blossom')
        for _ in range(7):
            simulation.event_queue.put(damage_event)
