from typing import TYPE_CHECKING
from core.rules.alltypes import *
from core.rules.skill import Skill
from core.simulation.constraint import *
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class ShogunNormATK(Skill):
    def __init__(self, shogun: 'Character') -> None:
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.normatk_lv,
            elem_type=ElementType.PHYSICAL,
            action_type=ActionType.NORMAL_ATK,
            damage_type=DamageType.NORMAL_ATK,
            scaler=shogun.action.normatk_scaler
        )

        self.attack_counter = self.normatk_counter()
        self.stamina = self.stamina_counter()
        self.parallel = ShogunChargeATK(shogun)

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        for c in simulation.active_constraint:
            if isinstance(c, DurationConstraint) and not c.test(event):
                return
        if simulation.uni_action_constraint and not simulation.uni_action_constraint.test(event):
            return
        cmd = event.cmd
        mode = event.mode
        if cmd == 'Z':
            self.parallel(simulation, event)
            return

        act_cnt: int = self.attack_counter.test(simulation.event_log)

        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                func=self.normatk_action_event,
                                desc=f'Shogun.action.normatk.{act_cnt}')
        simulation.event_queue.put(action_event)

        if mode == '0':
            return
        if act_cnt == 3:
            scaler = self.scaler[str(self.LV)][3]+self.scaler[str(self.LV)][4]
        elif act_cnt == 4:
            scaler = self.scaler[str(self.LV)][5]
        else:
            scaler = self.scaler[str(self.LV)][act_cnt]
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+0.1,
                                scaler=scaler,
                                mode=mode,
                                desc=f'Shogun.damage.normatk.{act_cnt}')
        simulation.event_queue.put(damage_event)

    @staticmethod
    def normatk_counter():
        def f(ev: 'Event'):
            if ev.type == EventType.ACTION:
                if isinstance(ev.source, ShogunNormATK):
                    return 1
                else:
                    return -10
            else:
                return 0

        cnt = CounterConstraint(0, 1000, 5, f)
        cnt.circulate()
        return cnt

    @staticmethod
    def stamina_counter():
        def f(ev: 'Event'):
            return

        cnt = CounterConstraint(0, 100, 240, f)
        cnt.circulate()
        return cnt

    def normatk_action_event(self, simulation: 'Simulation', event: 'Event'):
        simulation.uni_action_constraint = DurationConstraint(
            event.time, 0.1,
            lambda ev: True if ev.type == EventType.COMMAND else False
        )
        return


class ShogunChargeATK(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.normatk_lv,
            elem_type=ElementType.PHYSICAL,
            action_type=ActionType.NORMAL_ATK_CHARGE,
            damage_type=DamageType.CHARGED_ATK,
            scaler=shogun.action.normatk_scaler
        )

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        cmd = event.cmd
        mode = event.mode

        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                func=self.chargeatk_action_event,
                                desc=f'Shogun.action.chargeatk')
        simulation.event_queue.put(action_event)

        if mode == '0':
            return
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+0.1,
                                scaler=self.scaler[str(self.LV)][6],
                                mode=mode,
                                desc=f'Shogun.damage.chargeatk')
        simulation.event_queue.put(damage_event)

    def chargeatk_action_event(self, simulation: 'Simulation', event: 'Event'):
        simulation.uni_action_constraint = DurationConstraint(
            event.time, 0.1,
            lambda ev: True if ev.type == EventType.COMMAND else False
        )
        return
