from typing import TYPE_CHECKING
from core.entities.buff import Buff
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, BuffType, EventType, DamageType
from core.rules.skill import Skill
from core.simulation.event import Event
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.artifact import Artifact


class GLADIATORS_FINALE_Piece2(Skill):
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
                name=f'{self.sourcename}: Gladiators Finale Piece2',
                sourcename=self.sourcename,
                target_path=[[self.sourcename], 'ATK']
            )
            self.buff.add_buff(
                'Bonus Scalers', 'Gladiators Finale Piece2', 0.18)
            controller = NumericController()
            controller.insert_to(self.buff, 'ca', simulation)


class GLADIATORS_FINALE_Piece4(Skill):
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
            name=f'{self.sourcename}: Gladiators Finale Piece4',
            sourcename=self.sourcename,
            target_path=[self.sourcename]
        )
        if simulation.characters[self.sourcename].base.weapon in [1, 2, 3]:
            self.buff.add_buff('Normal Attack Bonus',
                               'Gladiators Finale Piece4', 0.35)
        controller = NumericController()
        controller.insert_to(self.buff, 'cd', simulation)
