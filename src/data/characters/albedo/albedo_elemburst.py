from typing import TYPE_CHECKING
from core.rules.alltypes import *
from core.rules.skill import Skill
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
            scaler=albedo.action.elemburst_scaler
        )
        self.cd = None
        self.energy = CounterConstraint(0, 1000, 40)

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        for c in simulation.active_constraint:
            if isinstance(c, DurationConstraint) and not c.test(event):
                return
        if simulation.uni_action_constraint and not simulation.uni_action_constraint.test(event):
            return
        if self.cd and not self.cd.test(event):
            return
        if not self.energy.full:
            simulation.output_log.append(
                '[WARNING]:[{} force activate, energy: {}]'.format(self.sourcename, self.energy.count))
        self.energy.clear()
        self.cd = self.elemburst_cd(event.time)
        mode = event.mode

        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                func=self.elemburst_action_event,
                                desc=f'Albedo.elemburst.action')
        simulation.event_queue.put(action_event)

        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+0.05,
                                scaler=self.scaler[str(self.LV)][0],
                                mode=mode,
                                desc='Albedo.elemburst.damage')
        simulation.event_queue.put(damage_event)

    def receive_energy(self, simulation: 'Simulation', event: 'Event'):
        if not isinstance(event, EnergyEvent):
            raise TypeError
        increment = event.base*event.num
        if event.elem.value == self.source.base.element:
            increment *= 3
        elif event.elem == ElementType.NONE:
            increment *= 2

        if simulation.onstage != self.source.name:
            increment *= (1-0.1*len(simulation.characters))

        increment *= simulation.characters[self.source.name].attribute.ER()
        self.energy.receive(increment)

    @staticmethod
    def elemburst_cd(start):
        def f(ev: Event):
            if ev.type == EventType.COMMAND and ev.desc == 'CMD.Albedo.Q':
                return True
            else:
                return False

        cd_counter = DurationConstraint(start, 12, f)
        cd_counter.refresh()
        return cd_counter

    def elemburst_action_event(self, simulation: 'Simulation', event: 'Event'):
        simulation.uni_action_constraint = DurationConstraint(
            event.time, 0.1,
            lambda ev: True if ev.type == EventType.COMMAND else False
        )
        return
