from typing import TYPE_CHECKING
from core.entities.buff import Buff
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, BuffType, EventType, DamageType
from core.rules.skill import Skill
from core.simulation.event import Event
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.artifact import Artifact


class WANDERERS_TROUPE_Piece2(Skill):
    def __init__(self, art: 'Artifact'):
        super().__init__(
            type=SkillType.ARTIFACT,
            source=art,
            sourcename=art.owner
        )
        self.buff = None

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.buff = Buff(
                type=BuffType.ATTR,
                name=f'{self.sourcename}: Wanderers Troupe Piece2',
                sourcename=self.sourcename,
                target_path=[[self.sourcename], 'EM']
            )
            self.buff.add_buff(
                'Total EM', 'Wanderers Troupe Piece2', 80)
            controller = NumericController()
            controller.insert_to(self.buff, 'ca', simulation)


class WANDERERS_TROUPE_Piece4(Skill):
    def __init__(self, art: 'Artifact'):
        super().__init__(
            type=SkillType.ARTIFACT,
            source=art,
            sourcename=art.owner
        )
        self.buff = None

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.build_buff(simulation)

    def build_buff(self, simulation: 'Simulation'):
        self.buff = Buff(
            type=BuffType.DMG,
            name=f'{self.sourcename}: Wanderers Troupe Piece4',
            sourcename=self.sourcename,
            target_path=[self.sourcename]
        )
        if simulation.characters[self.sourcename].base.weapon in [4, 5]:
            self.buff.add_buff('Charged Attack Bonus',
                               'Wanderers Troupe Piece4', 0.35)
        controller = NumericController()
        controller.insert_to(self.buff, 'cd', simulation)
