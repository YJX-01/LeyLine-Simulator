from typing import TYPE_CHECKING
from core.entities.buff import *
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, EventType, ActionType
from core.rules.skill import Skill
from core.simulation.constraint import Constraint
from core.simulation.event import Event, TryEvent, BuffEvent
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
        self.buff = None

    def __call__(self, simulation: 'Simulation', event: 'TryEvent'):
        if event.type == EventType.TRY and event.subtype == 'init':
            controller = NumericController()
            if self.build_buff(controller.enemy.hp_percentage):
                controller.insert_to(self.buff, 'cd', simulation)
        else:
            return

    def build_buff(self, percentage: tuple):
        if percentage[0] > percentage[1]/2:
            return False

        def trigger(simulation, event):
            return isinstance(event.source, TransientBlossom)
        self.buff = Buff(
            type=BuffType.DMG,
            name='Albedo: Calcite Might(PA1)',
            sourcename='Albedo',
            trigger=trigger,
            target_path=['Albedo'],
        )
        self.buff.add_buff('Other Bonus', 'Albedo Passive1 Bonus', 0.25)
        return True


class AlbedoPassive2(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.PASSIVE,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.passive_lv
        )
        self.buff = None

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.ACTION and event.sourcename == 'Albedo' and event.subtype == ActionType.ELEM_BURST:
            self.build_buff(event.time)
            controller = NumericController()
            controller.insert_to(self.buff, 'da', simulation)
            simulation.event_queue.put(BuffEvent().frombuff(self.buff))
        else:
            return

    def build_buff(self, time):
        self.buff = Buff(
            type=BuffType.ATTR,
            name='Albedo: Homuncular Nature(PA2)',
            sourcename='Albedo',
            constraint=Constraint(time, 10),
            target_path=[None, 'EM']
        )
        self.buff.add_buff('Total EM', 'Albedo Passive2 EM', 125)
