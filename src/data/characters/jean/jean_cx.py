from typing import TYPE_CHECKING
from core.entities.buff import *
from core.entities.creation import CreationSpace
from core.entities.numeric import NumericController
from core.rules.alltypes import SkillType, EventType, ElementType
from core.rules.skill import Skill
from core.simulation.event import Event, DamageEvent
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class JeanCX1(Skill):
    # already included in skill
    def __init__(self, jean: 'Character'):
        super().__init__(
            type=SkillType.CX,
            sourcename=jean.name,
            LV=jean.attribute.cx_lv
        )

    def __call__(self, *args):
        return


class JeanCX2(Skill):
    def __init__(self, jean: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=jean,
            sourcename=jean.name,
            LV=jean.attribute.cx_lv
        )
        self.buff = None

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.ENERGY and event.base:
            pass
        # TODO move speed promote


class JeanCX3(Skill):
    def __init__(self, jean: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=jean,
            sourcename=jean.name,
            LV=jean.attribute.cx_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            simulation.characters['Jean'].attribute.elemburst_bonus_lv += 3


class JeanCX4(Skill):
    def __init__(self, jean: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=jean,
            sourcename=jean.name,
            LV=jean.attribute.cx_lv
        )
        self.buff = None

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.CREATION and event.subtype == 'creation':
            self.build_buff(simulation, event)

    def build_buff(self, simulation: 'Simulation', event: 'Event'):
        def trigger(simulation, event: 'DamageEvent'):
            return event.elem == ElementType.ANEMO
        self.buff = Buff(
            type=BuffType.DMG,
            name='Jean: Lands of Dandelion(CX4)',
            sourcename='Jean',
            constraint=Constraint(event.time, 10),
            trigger=trigger
        )
        self.buff.change_buff('Resistance Debuff', -0.4)
        controller = NumericController()
        controller.insert_to(self.buff, 'dd', simulation)


class JeanCX5(Skill):
    def __init__(self, jean: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=jean,
            sourcename=jean.name,
            LV=jean.attribute.cx_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            simulation.characters['Jean'].attribute.elemskill_bonus_lv += 3


class JeanCX6(Skill):
    def __init__(self, jean: 'Character'):
        super().__init__(
            type=SkillType.CX,
            sourcename=jean.name,
            LV=jean.attribute.cx_lv
        )

    def __call__(self, *args):
        return
    # TODO Damage reduction system
