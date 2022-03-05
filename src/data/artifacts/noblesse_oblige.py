from typing import TYPE_CHECKING
from core.entities.buff import Buff
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, BuffType, EventType, DamageType, ActionType
from core.rules.skill import Skill
from core.simulation.event import Event
from core.simulation.constraint import Constraint
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.artifact import Artifact


class NOBLESSE_OBLIGE_Piece2(Skill):
    def __init__(self, art: 'Artifact'):
        super().__init__(
            type=SkillType.ARTIFACT,
            source=art,
            sourcename=art.owner
        )
        self.buff = None

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            def trigger(simulation, event: 'Event'):
                return event.sourcename == self.sourcename and event.subtype == DamageType.ELEM_BURST
            self.buff = Buff(
                type=BuffType.DMG,
                name=f'{self.sourcename}: Noblesse Oblige Piece2',
                sourcename=self.sourcename,
                trigger=trigger,
                target_path=[self.sourcename]
            )
            self.buff.add_buff('Elemental Burst Bonus',
                               'Noblesse Oblige Piece2', 0.2)
            controller = NumericController()
            controller.insert_to(self.buff, 'cd', simulation)


class NOBLESSE_OBLIGE_Piece4(Skill):
    def __init__(self, art: 'Artifact'):
        super().__init__(
            type=SkillType.ARTIFACT,
            source=art,
            sourcename=art.owner
        )
        self.buff = None

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.sourcename == self.sourcename and event.type == EventType.ACTION and event.subtype == ActionType.ELEM_BURST:
            self.build_buff(simulation, event.time)
            
    def build_buff(self, simulation: 'Simulation', start):
        self.buff = Buff(
            type=BuffType.ATTR,
            name='Noblesse Oblige Piece4',
            sourcename=self.sourcename,
            constraint=Constraint(start, 12),
            target_path=[None, 'ATK']
        )
        self.buff.add_buff('Bonus Scalers', 'Noblesse Oblige ATK', 0.2)
        controller = NumericController()
        controller.insert_to(self.buff, 'da', simulation)
