from typing import TYPE_CHECKING
from core.entities.buff import Buff
from core.entities.numeric import NumericController
from core.rules.skill import Skill
from core.rules.alltypes import *
from core.simulation.event import Event
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.weapon import Weapon


class Festering_Desire_Skill(Skill):
    def __init__(self, weapon: 'Weapon'):
        super().__init__(
            type=SkillType.WEAPON,
            source=weapon,
            sourcename=weapon.owner,
            LV=weapon.action.refine,
            scaler=weapon.action.scaler
        )
        self.buff = None

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.build_buff(simulation)

    def build_buff(self, simulation: 'Simulation'):
        def trigger(simulation, event: 'Event'):
            return event.sourcename == self.sourcename and event.subtype == DamageType.ELEM_SKILL
        self.buff = Buff(
            type=BuffType.DMG,
            name=f'{self.sourcename}: Festering Desire: Undying Admiration',
            sourcename=self.sourcename,
            trigger=trigger,
            target_path=[self.sourcename]
        )
        self.buff.add_buff('Elemental Skill Bonus',
                           'Festering Desire Bonus',
                           self.scaler[0])
        self.buff.add_buff('Bonus Critical Rate',
                           'Festering Desire CRIT_RATE',
                           self.scaler[1])
        controller = NumericController()
        controller.insert_to(self.buff, 'cd', simulation)
