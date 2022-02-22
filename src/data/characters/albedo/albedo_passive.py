from typing import TYPE_CHECKING
from core.rules.alltypes import SkillType
from core.rules.skill import Skill
from core.simulation.constraint import *
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class AlbedoPassive(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.PASSIVE,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.passive_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'TryEvent'):
        if not (event.type == EventType.TRY and event.subtype == 'init'):
            return
        
        if self.LV >= 1:
            pass
        if self.LV >= 2:
            pass