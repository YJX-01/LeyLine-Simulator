from typing import TYPE_CHECKING
from core.entities.buff import Buff
from core.entities.numeric import NumericController
from core.rules.skill import Skill
from core.rules.alltypes import *
from core.simulation.event import Event, BuffEvent
from core.simulation.constraint import Constraint
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.weapon import Weapon


class Engulfing_Lightning_Skill(Skill):
    def __init__(self, weapon: 'Weapon'):
        super().__init__(
            type=SkillType.WEAPON,
            source=weapon,
            sourcename=weapon.owner,
            LV=weapon.action.refine,
            scaler=weapon.action.scaler
        )
        self.buff = None
        self.last = 0

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.build_buff(simulation)
        elif event.sourcename == self.sourcename and event.type == EventType.ACTION and event.subtype == ActionType.ELEM_BURST:
            buff = Buff(
                type=BuffType.ATTR,
                name=f'{self.sourcename}: Engulfing Lightning: Eternal Stove',
                sourcename=self.sourcename,
                constraint=Constraint(event.time, 12),
                target_path=[[self.sourcename], 'ER']
            )
            buff.add_buff('Total ER',
                          'Engulfing Lightning ER',
                          self.scaler[2])
            controller = NumericController()
            controller.insert_to(buff, 'da', simulation)
            simulation.event_queue.put(BuffEvent().frombuff(buff))

    def build_buff(self, simulation: 'Simulation'):
        self.buff = Buff(
            type=BuffType.ATTR,
            name=f'{self.sourcename}: Engulfing Lightning: Timeless Dream',
            sourcename=self.sourcename,
            constraint=Constraint(0, 1000),
            trigger=self.trigger,
            target_path=[[self.sourcename], 'ATK']
        )
        self.last = simulation.characters[self.sourcename].attribute.ER()
        n = min(self.scaler[1],
                self.scaler[0] * (self.last-1))
        self.buff.add_buff('Bonus Scalers', 'Engulfing Lightning ATK', n)
        controller = NumericController()
        controller.insert_to(self.buff, 'da', simulation)

    def trigger(self, simulation: 'Simulation'):
        if simulation.characters[self.sourcename].attribute.ER.value != self.last:
            self.last = simulation.characters[self.sourcename].attribute.ER.value
            n = min(self.scaler[1],
                    self.scaler[0] * (self.last-1))
            self.buff.add_buff('Bonus Scalers', 'Engulfing Lightning ATK', n)
            simulation.characters[self.sourcename].attribute.connect(self.buff)
