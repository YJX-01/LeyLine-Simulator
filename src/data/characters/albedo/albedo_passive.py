from typing import TYPE_CHECKING
from core.entities.buff import *
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, EventType, ActionType
from core.rules.skill import Skill
from core.simulation.constraint import Constraint
from core.simulation.event import Event, TryEvent
from .albedo_elemskill import TransientBlossom
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class AlbedoPassive1(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.PASSIVE,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.passive_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'TryEvent'):
        if event.type == EventType.TRY and event.subtype == 'init':
            controller = NumericController()
            controller.insert_to(self.build_buff(), 'cd', simulation)
        else:
            return

    @staticmethod
    def build_buff():
        def trigger(simulation, event):
            if isinstance(event.source, TransientBlossom):
                return True
            else:
                return False
        buff = Buff(
            type=BuffType.DMG,
            name='Albedo: Calcite Might',
            trigger=trigger,
            target_path=['Albedo'],
        )
        buff.add_buff('Other Bonus', 'Albedo Passive1 Bonus', 0.25)
        return buff


class AlbedoPassive2(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.PASSIVE,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.passive_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.ACTION and event.sourcename == 'Albedo' and event.subtype == ActionType.ELEM_BURST:
            controller = NumericController()
            controller.insert_to(self.build_buff(event.time), 'da', simulation)
        else:
            return

    def build_buff(self, time):
        dur = Constraint(time, 10)
        buff = Buff(
            type=BuffType.ATTR,
            name='Albedo: Homuncular Nature',
            constraint=dur,
            target_path=['Albedo', 'EM']
        )
        buff.add_buff('Total EM', 'Albedo Passive2 EM', 125)
        return buff
