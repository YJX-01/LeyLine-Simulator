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
        if self.LV == 0 or not (event.type == EventType.TRY and event.subtype == 'init'):
            return
        controller = NumericController()
        controller.insert_to(self.calcite_might(), 'cd', simulation)

    @staticmethod
    def calcite_might():
        def trigger(time, event):
            if isinstance(event.source, TransientBlossom) and event.type == EventType.DAMAGE:
                return True
            else:
                return False
        buff = Buff(
            type=BuffType.DMG,
            name='Calcite Might',
            trigger=trigger,
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
        if self.LV <= 1 or not (event.type == EventType.ACTION and event.sourcename == 'Albedo' and event.subtype == ActionType.ELEM_BURST):
            return
        controller = NumericController()
        controller.insert_to(self.homuncular_nature(event.time), 'da', simulation)

    def homuncular_nature(self, time):
        dur = Constraint(time, 10)
        buff = Buff(
            type=BuffType.ATTR,
            name='Homuncular Nature',
            constraint=dur,
            target_path=['Albedo', 'EM']
        )
        buff.add_buff('Total EM', 'Albedo Passive2 EM', 125)
        return buff
