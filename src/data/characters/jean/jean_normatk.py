from typing import TYPE_CHECKING
from core.entities.creation import CreationSpace
from core.rules.alltypes import *
from core.rules.skill import Skill
from core.rules.icd import ICD
from core.simulation.constraint import CounterConstraint
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class JeanNormATK(Skill):
    def __init__(self, jean: 'Character') -> None:
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=jean,
            sourcename=jean.name,
            LV=jean.attribute.normatk_lv,
            elem_type=ElementType.PHYSICAL,
            action_type=ActionType.NORMAL_ATK,
            damage_type=DamageType.NORMAL_ATK,
            action_time=jean.action.normatk_time,
            scaler=jean.action.normatk_scaler
        )

        self.attack_counter = self.normatk_counter()
        self.stamina = self.stamina_counter()
        self.parallel = JeanChargeATK(jean)

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        # check action collision
        if simulation.uni_action_constraint and not simulation.uni_action_constraint.test(event):
            self.reject_event(simulation, event, reason='action collision')
            return

        # fetch cmd and mode
        cmd = event.cmd
        mode = event.mode
        if cmd == 'Z':
            self.parallel(simulation, event)
            return

        # fetch other information
        act_cnt: int = self.attack_counter.test(simulation.event_log)
        act_t: float = self.action_time[act_cnt]/60

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc=f'Jean.normal_atk.{act_cnt}')
        simulation.event_queue.put(action_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[0])
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=self.scaler[skill_lv][act_cnt],
                                mode=mode,
                                icd=ICD('normal_atk', '',
                                        event.time+act_t, 1),
                                desc=f'Jean.normal_atk.{act_cnt}')
        simulation.event_queue.put(damage_event)

    @staticmethod
    def reject_event(sim, ev: 'Event', reason):
        sim.output_log.append(
            f'[REJECT]:[{ev.time}s: {ev.desc}; reason: {reason}]')

    @staticmethod
    def normatk_counter():
        def f(ev: 'Event'):
            if ev.type != EventType.ACTION:
                return 0
            elif isinstance(ev.source, JeanNormATK):
                return 1
            else:
                return -10
        cnt = CounterConstraint(0, 1000, 5, func=f, cir=True)
        return cnt

    @staticmethod
    def stamina_counter():
        def f(ev: 'Event'):
            return
        cnt = CounterConstraint(0, 1000, 240, func=f, cir=True)
        return cnt


class JeanChargeATK(Skill):
    def __init__(self, jean: 'Character'):
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=jean,
            sourcename=jean.name,
            LV=jean.attribute.normatk_lv,
            elem_type=ElementType.PHYSICAL,
            action_type=ActionType.NORMAL_ATK_CHARGE,
            damage_type=DamageType.CHARGED_ATK,
            action_time=jean.action.normatk_time,
            scaler=jean.action.normatk_scaler
        )

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        # fetch mode and other information
        mode = event.mode
        act_t: float = self.action_time[5]/60

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc='Jean.charged_atk')
        simulation.event_queue.put(action_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[0])
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=self.scaler[skill_lv][5],
                                mode=mode,
                                icd=ICD('normal_atk', '',
                                        event.time+act_t, 1),
                                desc='Jean.charged_atk')
        simulation.event_queue.put(damage_event)
