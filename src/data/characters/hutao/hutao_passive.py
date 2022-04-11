from typing import TYPE_CHECKING
from core.entities.buff import *
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, EventType, ActionType
from core.rules.skill import Skill
from core.simulation.constraint import DurationConstraint
from core.simulation.event import Event, BuffEvent
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class HutaoPassive1(Skill):
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.PASSIVE,
            source=hutao,
            sourcename=hutao.name,
            LV=hutao.attribute.passive_lv
        )
        self.buff = None
        self.begin = 1000
        self.last = -10

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.ACTION and event.sourcename == 'Hutao' and event.subtype == ActionType.ELEM_SKILL:
            self.begin = event.time
            self.last = event.time+9
            self.build_buff(simulation, self.last)
        elif event.type == EventType.SWITCH and self.last > event.time > self.begin:
            self.last = event.time
            self.build_buff(simulation, self.last)
            simulation.event_queue.put(BuffEvent().frombuff(self.buff))
        elif event.time > self.last and event.time > self.begin:
            self.begin = 1000
            simulation.event_queue.put(BuffEvent().frombuff(self.buff))

    def build_buff(self, simulation: 'Simulation', time):
        names = [n for n in simulation.shortcut.values() if n != 'Shogun']
        self.buff = Buff(
            type=BuffType.ATTR,
            name='Hutao: Flutter By(PA1)',
            sourcename='Hutao',
            constraint=Constraint(time, 8),
            target_path=[names, 'CRIT_RATE']
        )
        self.buff.add_buff('Total CRIT_RATE', 'Hutao Passive1 CR', 0.12)
        controller = NumericController()
        controller.insert_to(self.buff, 'da', simulation)


class HutaoPassive2(Skill):
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.PASSIVE,
            source=hutao,
            sourcename=hutao.name,
            LV=hutao.attribute.passive_lv
        )
        self.buff = None
        self.last: bool = False

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.build_buff(simulation)
            controller = NumericController()
            controller.insert_to(self.buff, 'da', simulation)

    def build_buff(self, simulation: 'Simulation'):
        self.buff = Buff(
            type=BuffType.ATTR,
            name='Hutao: Sanguine Rouge(PA2)',
            sourcename='Hutao',
            constraint=Constraint(0, 1000),
            trigger=self.trigger,
            target_path=[[self.sourcename], 'PYRO_DMG']
        )
        per = self.source.hp_percentage
        self.last = bool(per[0] <= per[1]/2)
        self.buff.add_buff('Total PYRO_DMG',
                           'Hutao Passive2 PYRO_DMG', 0.33)

    def trigger(self, simulation: 'Simulation'):
        per = self.source.hp_percentage
        if self.last != bool(per[0] <= per[1]/2):
            self.last = bool(per[0] <= per[1]/2)
            self.buff.add_buff('Total PYRO_DMG',
                               'Hutao Passive2 PYRO_DMG', 0.33*int(self.last))
            self.source.attribute.connect(self.buff)
