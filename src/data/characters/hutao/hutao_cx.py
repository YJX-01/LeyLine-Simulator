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


class HutaoCX1(Skill):
    # TODO stamina not complete
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.CX,
            sourcename=hutao.name,
            LV=hutao.attribute.cx_lv
        )

    def __call__(self, *args):
        return


class HutaoCX2(Skill):
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=hutao,
            sourcename=hutao.name,
            LV=hutao.attribute.cx_lv
        )
        self.buff = None

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.build_buff(simulation)

    def build_buff(self, simulation: 'Simulation'):
        def trigger(simulation, event: 'Event'):
            return event.desc == 'Hutao.blood_blossom'
        self.buff = Buff(
            type=BuffType.DMG,
            name='Hutao: Ominous Rainfall(CX2)',
            sourcename='Hutao',
            trigger=trigger,
            target_path=['Hutao']
        )
        self.buff.add_buff('Basic Multiplier', 'Hutao CX2', 0, '*')
        self.buff.add_buff('Hutao CX2', 'CX2 Stat',
                           simulation.characters['Hutao'].attribute.HP.value)
        self.buff.add_buff('Hutao CX2', 'CX2 Scaler', 0.1)
        controller = NumericController()
        controller.insert_to(self.buff, 'cd', simulation)


class HutaoCX3(Skill):
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=hutao,
            sourcename=hutao.name,
            LV=hutao.attribute.cx_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            simulation.characters['Hutao'].attribute.elemskill_bonus_lv += 3


class HutaoCX4(Skill):
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=hutao,
            sourcename=hutao.name,
            LV=hutao.attribute.cx_lv
        )
        self.buff = None
        self.begin = 1000
        self.last = -10

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        # TODO enemy die
        return

    def build_buff(self, simulation: 'Simulation', time):
        names = [n for n in simulation.shortcut.values() if n != 'Hutao']
        self.buff = Buff(
            type=BuffType.ATTR,
            name='Hutao: Garden of Eternal Rest(CX4)',
            sourcename='Hutao',
            constraint=Constraint(time, 15),
            target_path=[names, 'CRIT_RATE']
        )
        self.buff.add_buff('Total CRIT_RATE', 'Hutao Passive1 CR', 0.12)
        controller = NumericController()
        controller.insert_to(self.buff, 'da', simulation)


class HutaoCX5(Skill):
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.CX,
            source=hutao,
            sourcename=hutao.name,
            LV=hutao.attribute.cx_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            simulation.characters['Hutao'].attribute.elemburst_bonus_lv += 3


class HutaoCX6(Skill):
    # TODO
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.CX,
            sourcename=hutao.name,
            LV=hutao.attribute.cx_lv
        )

    def __call__(self, *args):
        return
