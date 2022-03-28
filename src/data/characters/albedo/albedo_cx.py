from typing import TYPE_CHECKING
from core.entities.buff import *
from core.entities.creation import CreationSpace, TriggerableCreation
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, EventType, ActionType, DamageType
from core.rules.skill import Skill
from core.simulation.constraint import *
from core.simulation.event import Event, EnergyEvent
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class AlbedoCX1(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.cx_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.DAMAGE and event.desc == 'Albedo.transientblossom':
            energy_event = EnergyEvent(time=event.time,
                                       source=self,
                                       sourcename=self.sourcename,
                                       num=1.2,
                                       receiver=['Albedo'],
                                       desc='Albedo.CX1.energy')
            simulation.event_queue.put(energy_event)


class AlbedoCX2(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.cx_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.creations = FatalReckoning(self)
            creation_space = CreationSpace()
            creation_space.insert(self.creations)


class AlbedoCX3(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.cx_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            simulation.characters['Albedo'].attribute.elemskill_bonus_lv += 3


class AlbedoCX4(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.cx_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            def trigger(simulation, event):
                return event.subtype == DamageType.PLUNGING_ATK
            self.buff = Buff(
                type=BuffType.DMG,
                name='Albedo: Descent of Divinity(CX4)',
                sourcename='Albedo',
                trigger=trigger
            )
            self.buff.add_buff('Plunging Attack Bonus', 'Albedo CX4 Bonus', 0.3)
            numeric_controller = NumericController()
            numeric_controller.insert_to(self.buff, 'cd', simulation)


class AlbedoCX5(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.cx_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            simulation.characters['Albedo'].attribute.elemburst_bonus_lv += 3


class AlbedoCX6(Skill):
    # TODO unfinished
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.cx_lv
        )

    def __call__(self, *args):
        return


class FatalReckoning(TriggerableCreation):
    def __init__(self, cx):
        super().__init__(
            source=cx,
            sourcename='Albedo',
            name='Fatal Reckoning',
            start=0,
            duration=1000,
            exist_num=1
        )
        self.stack = CounterConstraint(0, 0, 4)

    def build_buff(self, simulation: 'Simulation', start):
        self.buff = None

        def trigger(simulation, event):
            return event.desc == 'Albedo.elem_burst' or event.desc == 'Albedo.elem_burst.fatal_blossom'
        self.buff = Buff(
            type=BuffType.DMG,
            name='Albedo: Opening of Phanerozoic(CX2)',
            sourcename='Albedo',
            constraint=Constraint(start+1.5, 0.5),
            trigger=trigger,
            target_path=['Albedo']
        )
        self.buff.add_buff('Basic Multiplier', 'Albedo CX2', 0, '*')
        self.buff.add_buff('Albedo CX2', 'CX2 Stat',
                           simulation.characters['Albedo'].attribute.DEF.value)
        self.buff.add_buff('Albedo CX2', 'CX2 Scaler', 0.3*self.stack.count)

        numeric_controller = NumericController()
        numeric_controller.insert_to(self.buff, 'dd', simulation)

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.sourcename == 'Albedo' and event.subtype == ActionType.ELEM_BURST:
            self.build_buff(simulation, event.time)
            self.stack.clear()
        elif event.type == EventType.DAMAGE and event.desc == 'Albedo.transientblossom':
            if self.stack.end < event.time or self.stack.count == 0:
                self.stack = CounterConstraint(event.time, 30, 4)
            else:
                self.stack.start = event.time
            self.stack.receive(1)
