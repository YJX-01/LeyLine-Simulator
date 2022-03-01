from typing import TYPE_CHECKING
from core.entities.buff import Buff
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, BuffType, EventType, DamageType
from core.rules.skill import Skill
from core.simulation.event import Event
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.artifact import Artifact


class EMBLEM_OF_SEVERED_FATE_Piece2(Skill):
    def __init__(self, art: 'Artifact'):
        super().__init__(
            type=SkillType.ARTIFACT,
            source=art,
            sourcename=art.owner
        )
        self.buff = None

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.build_buff()
            controller = NumericController()
            controller.insert_to(self.buff, 'ca', simulation)
        else:
            return

    def build_buff(self):
        self.buff = Buff(
            type=BuffType.ATTR,
            name=f'{self.sourcename}: Emblem of Severed Fate Piece2',
            sourcename=self.sourcename,
            target_path=[[self.sourcename], 'ER']
        )
        self.buff.add_buff('Total ER', 'Emblem of Severed Fate Piece2', 0.2)


class EMBLEM_OF_SEVERED_FATE_Piece4(Skill):
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
            controller = NumericController()
            controller.insert_to(self.buff, 'cd', simulation)
        else:
            return

    def build_buff(self, simulation: 'Simulation'):
        self.buff = Buff(
            type=BuffType.DMG,
            name=f'{self.sourcename}: Emblem of Severed Fate Piece4',
            sourcename=self.sourcename,
            trigger=self.trigger,
            target_path=[self.sourcename]
        )
        er = simulation.characters[self.sourcename].attribute.ER()
        n = min(0.75, er*0.25)
        self.buff.add_buff('Elemental Burst Bonus',
                           'Emblem of Severed Fate Piece4', n)

    def trigger(self, simulation: 'Simulation', event: 'Event'):
        if event.subtype == DamageType.ELEM_BURST:
            er = simulation.characters[self.sourcename].attribute.ER()
            n = min(0.75, er*0.25)
            self.buff.add_buff('Elemental Burst Bonus',
                               'Emblem of Severed Fate Piece4', n)
            return True
        else:
            return False
