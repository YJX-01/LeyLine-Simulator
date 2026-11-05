from typing import TYPE_CHECKING
from core.entities.buff import Buff
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, BuffType, EventType, DamageType
from core.rules.skill import Skill
from core.simulation.event import Event
from core.simulation.constraint import Constraint
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.artifact import Artifact


class BLOODSTAINED_CHIVALRY_Piece2(Skill):
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
                name=f'{self.sourcename}: Bloodstained Chivalry Piece2',
                sourcename=self.sourcename,
                target_path=[[self.sourcename], 'PHYSICAL_DMG']
            )
            self.buff.add_buff('Total PHYSICAL_DMG',
                               'Bloodstained Chivalry Piece2', 0.25)
            controller = NumericController()
            controller.insert_to(self.buff, 'ca', simulation)


class BLOODSTAINED_CHIVALRY_Piece4(Skill):
    # TODO
    def __init__(self, art: 'Artifact'):
        super().__init__(
            type=SkillType.ARTIFACT,
            source=art,
            sourcename=art.owner
        )
        self.buff = None
        self.last = 1000

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.build_buff(simulation)

    def build_buff(self, simulation: 'Simulation'):
        self.buff = Buff(
            type=BuffType.DMG,
            name=f'{self.sourcename}: Bloodstained Chivalry Piece4',
            sourcename=self.sourcename,
            constraint=Constraint(1000,10),
            trigger=self.trigger,
            target_path=[self.sourcename]
        )
        self.buff.add_buff('Charged Attack Bonus',
                           'Bloodstained Chivalry Piece4', 0.5)
        controller = NumericController()
        controller.insert_to(self.buff, 'dd', simulation)

    def trigger(self, simulation: 'Simulation', event: 'Event'):
        if event.subtype == DamageType.CHARGED_ATK and self.last < event.time <= self.last+10:
            return True
        elif event.type == EventType.TRY:
            # TODO enemy die
            pass
        else:
            return False
