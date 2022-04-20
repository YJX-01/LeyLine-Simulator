from typing import TYPE_CHECKING
from core.entities.buff import Buff
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, BuffType, EventType, DamageType, ActionType
from core.rules.skill import Skill
from core.simulation.event import Event, BuffEvent
from core.simulation.constraint import Constraint
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.artifact import Artifact


class SHIMENAWAS_REMINISCENCE_Piece2(Skill):
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
                name=f'{self.sourcename}: Shimenawas Reminiscence Piece2',
                sourcename=self.sourcename,
                target_path=[[self.sourcename], 'ATK']
            )
            self.buff.add_buff('Bonus Scalers',
                               'Shimenawas Reminiscence Piece2', 0.18)
            controller = NumericController()
            controller.insert_to(self.buff, 'ca', simulation)


class SHIMENAWAS_REMINISCENCE_Piece4(Skill):
    def __init__(self, art: 'Artifact'):
        super().__init__(
            type=SkillType.ARTIFACT,
            source=art,
            sourcename=art.owner
        )
        self.buff = None
        self.last = 1000

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.sourcename == self.sourcename and event.type == EventType.ACTION and event.subtype == ActionType.ELEM_SKILL:
            self.build_buff(simulation, event)

    def build_buff(self, simulation: 'Simulation', event: 'Event'):
        if self.last < event.time <= self.last+10:
            return
        elif simulation.characters[self.sourcename].energy.count < 15:
            return

        simulation.characters[self.sourcename].energy.reduce(15)
        self.last = event.time

        def trigger(simulation: 'Simulation', event: 'Event'):
            return event.subtype in [DamageType.NORMAL_ATK, DamageType.CHARGED_ATK, DamageType.PLUNGING_ATK]

        self.buff = Buff(
            type=BuffType.DMG,
            name=f'{self.sourcename}: Shimenawas Reminiscence Piece4',
            sourcename=self.sourcename,
            constraint=Constraint(self.last, 10),
            trigger=trigger,
            target_path=[self.sourcename]
        )
        self.buff.add_buff('Normal Attack Bonus',
                           'Shimenawas Reminiscence Piece4', 0.5)
        self.buff.add_buff('Charged Attack Bonus',
                           'Shimenawas Reminiscence Piece4', 0.5)
        self.buff.add_buff('Plunging Attack Bonus',
                           'Shimenawas Reminiscence Piece4', 0.5)
        controller = NumericController()
        controller.insert_to(self.buff, 'dd', simulation)
        simulation.event_queue.put(BuffEvent().frombuff(self.buff))
