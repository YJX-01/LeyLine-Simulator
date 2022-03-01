from typing import TYPE_CHECKING
from core.entities.buff import *
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, EventType
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
        self.cd.refresh()

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type != EventType.ENERGY or not event.base:
            return
        if not self.cd.test(event):
            return
        else:
            self.source.action.ELEM_BURST.creations.stack.receive(2)


class ShogunPassive2(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.PASSIVE,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.passive_lv
        )
        self.buff = None
        self.last = 0

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.build_buff(simulation)
            controller = NumericController()
            controller.insert_to(self.buff, 'da', simulation)
        else:
            return

    def build_buff(self, simulation: 'Simulation'):
        self.buff = Buff(
            type=BuffType.ATTR,
            name='Shogun: Enlightened One',
            sourcename='Shogun',
            constraint=Constraint(0, 1000),
            trigger=self.trigger,
            target_path=[[self.sourcename], 'ELECTRO_DMG']
        )
        self.last = self.source.attribute.ER.value
        n = (self.last-1)*0.4
        self.buff.add_buff('Total ELECTRO_DMG',
                           'Shogun Passive2 ELECTRO_DMG', n)

    def trigger(self, simulation: 'Simulation'):
        if self.source.attribute.ER.value == self.last:
            return
        else:
            self.last = self.source.attribute.ER.value
            n = (self.last-1)*0.4
            self.buff.add_buff('Total ELECTRO_DMG',
                               'Shogun Passive2 ELECTRO_DMG', n)
            self.source.attribute.connect(self.buff)
