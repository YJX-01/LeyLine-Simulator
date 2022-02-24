from typing import TYPE_CHECKING
from core.entities.buff import *
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, EventType, ActionType
from core.rules.skill import Skill
from core.simulation.constraint import DurationConstraint
from core.simulation.event import Event
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class ShogunPassive1(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.PASSIVE,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.passive_lv
        )
        self.cd = DurationConstraint(-3, 3)

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type != EventType.ENERGY:
            return
        if not self.cd.test(event):
            return
        simulation.characters['Shogun'].action.ELEM_BURST.creations.stack.receive(2)


class ShogunPassive2(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.PASSIVE,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.passive_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        return
