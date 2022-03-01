from typing import TYPE_CHECKING
from core.rules.alltypes import *
from core.rules.skill import Skill
from core.simulation.constraint import *
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class AlbedoNormATK(Skill):
    def __init__(self, albedo: 'Character') -> None:
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.normatk_lv,
            elem_type=ElementType.PHYSICAL,
            action_type=ActionType.NORMAL_ATK,
            damage_type=DamageType.NORMAL_ATK,
            scaler=albedo.action.normatk_scaler
        )

        self.attack_counter = self.normatk_counter()
        self.stamina = self.stamina_counter()
        self.parallel = AlbedoChargeATK(albedo)

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        for c in simulation.active_constraint:
            if isinstance(c, DurationConstraint) and not c.test(event):
                simulation.output_log.append(
                    '[REJECT]:[{}s: {}]'.format(event.time, event.desc))
                return
        if simulation.uni_action_constraint and not simulation.uni_action_constraint.test(event):
            simulation.output_log.append(
                '[REJECT]:[{}s: {}]'.format(event.time, event.desc))
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
                                desc=f'Albedo.action.normatk.{act_cnt}')
        simulation.event_queue.put(action_event)

        if mode == '0':
            return
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+0.1,
                                scaler=self.scaler[str(self.LV)][act_cnt],
                                mode=mode,
                                desc=f'Albedo.damage.normatk.{act_cnt}')
        simulation.event_queue.put(damage_event)

    @staticmethod
    def normatk_counter():
        def f(ev: 'Event'):
            if ev.type == EventType.ACTION:
                if isinstance(ev.source, AlbedoNormATK):
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


class AlbedoChargeATK(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=albedo,
            sourcename=albedo.name,
            LV=albedo.attribute.normatk_lv,
            elem_type=ElementType.PHYSICAL,
            action_type=ActionType.NORMAL_ATK_CHARGE,
            damage_type=DamageType.CHARGED_ATK,
            scaler=albedo.action.normatk_scaler
        )

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        mode = event.mode

        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                func=self.chargeatk_action_event,
                                desc=f'Albedo.action.chargeatk')
        simulation.event_queue.put(action_event)

        if mode == '0':
            return
        damage_event1 = DamageEvent().fromskill(self)
        damage_event1.initialize(time=event.time+0.1,
                                 scaler=self.scaler[str(self.LV)][5],
                                 mode=mode,
                                 desc=f'Albedo.damage.chargeatk-1')
        damage_event2 = DamageEvent().fromskill(self)
        damage_event2.initialize(time=event.time+0.1,
                                 scaler=self.scaler[str(self.LV)][6],
                                 mode=mode,
                                 desc=f'Albedo.damage.chargeatk-2')
        simulation.event_queue.put(damage_event1)
        simulation.event_queue.put(damage_event2)

    def chargeatk_action_event(self, simulation: 'Simulation', event: 'Event'):
        simulation.uni_action_constraint = DurationConstraint(
            event.time, 0.1,
            lambda ev: True if ev.type == EventType.COMMAND else False
        )
        return
