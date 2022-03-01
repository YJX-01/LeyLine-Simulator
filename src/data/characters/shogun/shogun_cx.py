from typing import TYPE_CHECKING
from core.entities.buff import *
from core.entities.creation import CreationSpace
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, EventType, ActionType
from core.rules.skill import Skill
from core.simulation.event import Event, BuffEvent
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class ShogunCX1(Skill):
    # already included in skill
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.CX,
            sourcename=shogun.name,
            LV=shogun.attribute.cx_lv
        )

    def __call__(self, *args):
        return


class ShogunCX2(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.cx_lv
        )
        self.buff = None

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.build_buff()
            controller = NumericController()
            controller.insert_to(self.buff, 'cd', simulation)
        else:
            return

    def build_buff(self):
        self.buff = Buff(
            type=BuffType.DMG,
            name='Shogun: Steelbreaker',
            sourcename='Shogun',
            trigger=self.musou_isshin_state,
            target_path=[self.sourcename]
        )
        self.buff.add_buff('Defence', 'Defence Ignore', 0.6)

    def musou_isshin_state(self, simulation: 'Simulation', event: 'Event') -> bool:
        creation_space = CreationSpace()
        for c in creation_space.creations:
            if c.name == 'Musou Isshin State' and c.end > event.time:
                return True
        else:
            return False


class ShogunCX3(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.cx_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            simulation.characters['Shogun'].attribute.elemburst_bonus_lv += 3
        else:
            return


class ShogunCX4(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.cx_lv
        )
        self.buff = None
        self.last = -10

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.time < self.last+10:
            return
        else:
            pass

        if event.type == EventType.ACTION and event.sourcename == 'Albedo' and event.subtype == ActionType.ELEM_BURST:
            self.build_buff(event.time, simulation)
            controller = NumericController()
            controller.insert_to(self.buff, 'da', simulation)
            simulation.event_queue.put(BuffEvent().frombuff(self.buff))
        else:
            return

    def build_buff(self, time, simulation: 'Simulation'):
        names = [n for n in simulation.shortcut.values() if n != 'Shogun']
        self.buff = Buff(
            type=BuffType.ATTR,
            name='Shogun: Pledge of Propriety',
            sourcename='Shogun',
            constraint=Constraint(time, 10),
            target_path=[names, 'ATK']
        )
        self.buff.add_buff('Bonus Scalers', 'Shogun CX4 ATK', 0.3)


class ShogunCX5(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.cx_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            simulation.characters['Shogun'].attribute.elemskill_bonus_lv += 3
        else:
            return


class ShogunCX6(Skill):
    # already included in skill
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.CX,
            sourcename=shogun.name,
            LV=shogun.attribute.cx_lv
        )

    def __call__(self, *args):
        return
