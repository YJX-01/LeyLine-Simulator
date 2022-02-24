from typing import TYPE_CHECKING
from core.entities.creation import *
from core.rules.alltypes import *
from core.rules.skill import Skill
from core.simulation.constraint import *
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class ShogunElemburst(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.ELEM_BURST,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.elemburst_lv,
            elem_type=ElementType.ELECTRO,
            action_type=ActionType.ELEM_BURST,
            damage_type=DamageType.ELEM_BURST,
            scaler=shogun.action.elemburst_scaler
        )
        self.cd = None
        self.energy = CounterConstraint(0, 1000, 90)
        self.creations: Creation = ChakraDesiderata(self)

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
                                desc=f'Shogun.elemburst.action')
        simulation.event_queue.put(action_event)

        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+0.05,
                                scaler=self.scaler[str(self.LV)][0],
                                mode=mode,
                                desc='Shogun.elemburst.damage')
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
            if ev.type == EventType.COMMAND and ev.desc == 'CMD.Shogun.Q':
                return True
            else:
                return False

        cd_counter = DurationConstraint(start, 18, f)
        cd_counter.refresh()
        return cd_counter

    def elemburst_action_event(self, simulation: 'Simulation', event: 'Event'):
        simulation.uni_action_constraint = DurationConstraint(
            event.time, 0.1,
            lambda ev: True if ev.type == EventType.COMMAND else False
        )
        return


class ChakraDesiderata(TriggerableCreation):
    def __init__(self, skill: ShogunElemburst):
        super().__init__()
        self.source = skill
        self.start = 0
        self.duration = 1000
        self.exist_num = 1
        self.scaler = skill.scaler[str(skill.LV)]
        self.skills = ResolveStack(self)
        self.trigger_func = self.desiderata_trigger

        self.stack = CounterConstraint(0, 1000, 60)

    def clear(self):
        self.stack.clear()

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if not self.desiderata_trigger(simulation, event):
            return
        energy_cnt = simulation.characters[event.sourcename].action.ELEM_BURST.energy.capacity
        self.stack.receive(energy_cnt*self.scaler[3])

    def desiderata_trigger(self, simulation: 'Simulation', event: 'Event'):
        # if event.type == EventType.ENERGY and getattr(event, 'base') != 0:
        #     return True
        if event.type == EventType.ACTION and event.subtype == ActionType.ELEM_BURST:
            return True
        else:
            return False


class ResolveStack(Skill):
    def __init__(self, halo: ChakraDesiderata):
        super().__init__(
            type=SkillType.CREATION_TRIG,
            source=halo,
            sourcename=halo.source.sourcename,
            scaler=halo.scaler
        )
