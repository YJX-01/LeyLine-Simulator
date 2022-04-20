from random import random
from typing import TYPE_CHECKING
from core.entities.creation import CreationSpace
from core.rules.alltypes import *
from core.rules.skill import Skill
from core.rules.icd import ICD
from core.simulation.constraint import CounterConstraint
from core.simulation.event import *
from .hutao_elemskill import BloodBlossom
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class HutaoNormATK(Skill):
    def __init__(self, hutao: 'Character') -> None:
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=hutao,
            sourcename=hutao.name,
            LV=hutao.attribute.normatk_lv,
            elem_type=ElementType.PHYSICAL,
            action_type=ActionType.NORMAL_ATK,
            damage_type=DamageType.NORMAL_ATK,
            action_time=hutao.action.normatk_time,
            scaler=hutao.action.normatk_scaler
        )

        self.attack_counter = self.normatk_counter()
        self.stamina = self.stamina_counter()
        self.parallel = HutaoChargeATK(hutao)

        self.diewu = ParamitaPapilio(hutao)

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        # check action collision
        if simulation.uni_action_constraint and not simulation.uni_action_constraint.test(event):
            self.reject_event(simulation, event, reason='action collision')
            return

        # judge transformation state
        if self.paramita_papilio_state(simulation, event):
            self.diewu(simulation, event)
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
                                desc=f'Hutao.normal_atk.{act_cnt}')
        simulation.event_queue.put(action_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[0])
        if act_cnt == 4:
            damage_event1 = self.normatk_damage_event(
                event.time+act_t, mode, skill_lv, 4, '4-1')
            damage_event2 = self.normatk_damage_event(
                event.time+act_t, mode, skill_lv, 5, '4-2')
            simulation.event_queue.put(damage_event1)
            simulation.event_queue.put(damage_event2)
        else:
            scaler_i = 6 if act_cnt == 5 else act_cnt
            damage_event = self.normatk_damage_event(
                event.time+act_t, mode, skill_lv, scaler_i, str(act_cnt))
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
            elif isinstance(ev.source, HutaoNormATK) or isinstance(ev.source, ParamitaPapilio):
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

    def normatk_damage_event(self, time, mode, skill_lv: str, scaler_i: int, atk_cnt: str):
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=time,
                                scaler=self.scaler[skill_lv][scaler_i],
                                mode=mode,
                                icd=ICD('normal_atk', '',
                                        time, 1),
                                desc=f'Hutao.normal_atk.{atk_cnt}')
        return damage_event

    def paramita_papilio_state(self, simulation: 'Simulation', event: 'Event') -> bool:
        creation_space = CreationSpace()
        return creation_space.mark_active('Paramita Papilio State', event.time)


class HutaoChargeATK(Skill):
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=hutao,
            sourcename=hutao.name,
            LV=hutao.attribute.normatk_lv,
            elem_type=ElementType.PHYSICAL,
            action_type=ActionType.NORMAL_ATK_CHARGE,
            damage_type=DamageType.CHARGED_ATK,
            action_time=hutao.action.normatk_time,
            scaler=hutao.action.normatk_scaler
        )

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        # fetch mode and other information
        mode = event.mode
        act_t: float = self.action_time[6]/60

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc='Hutao.charged_atk')
        simulation.event_queue.put(action_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[0])
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=self.scaler[skill_lv][6],
                                mode=mode,
                                icd=ICD('charged_atk', 'polearm',
                                        event.time+act_t, 1),
                                desc='Hutao.charged_atk')
        simulation.event_queue.put(damage_event)


class ParamitaPapilio(Skill):
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=hutao,
            sourcename=hutao.name,
            LV=hutao.attribute.normatk_lv,
            elem_type=ElementType.PYRO,
            action_type=ActionType.NORMAL_ATK,
            damage_type=DamageType.NORMAL_ATK,
            action_time=hutao.action.normatk_time,
            scaler=hutao.action.normatk_scaler
        )
        self.parallel = ParamitaPapilioCharge(hutao)
        self.restore_cd = None

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        # fetch cmd and mode
        cmd = event.cmd
        mode = event.mode
        if cmd == 'Z':
            self.parallel(simulation, event)
            return

        # fetch other information
        act_cnt: int = self.source.action.NORMAL_ATK.attack_counter.test(simulation.event_log)
        act_t: float = self.action_time[act_cnt]/60

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc=f'Hutao.diewu.{act_cnt}')
        simulation.event_queue.put(action_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[0])
        if act_cnt == 4:
            damage_event1 = self.normatk_damage_event(
                event.time+act_t, mode, skill_lv, 4, '4-1')
            damage_event2 = self.normatk_damage_event(
                event.time+act_t, mode, skill_lv, 5, '4-2')
            simulation.event_queue.put(damage_event1)
            simulation.event_queue.put(damage_event2)
        else:
            scaler_i = 6 if act_cnt == 5 else act_cnt
            damage_event = self.normatk_damage_event(
                event.time+act_t, mode, skill_lv, scaler_i, str(act_cnt))
            simulation.event_queue.put(damage_event)

        # energy event
        if not self.restore_judge(event):
            return
        if mode == '$':
            extra_ball = int(random() <= 1/2)
        else:
            extra_ball = 1/2
        energy_event = EnergyEvent(time=event.time,
                                   source=self,
                                   sourcename=self.sourcename,
                                   elem=ElementType.PYRO,
                                   base=1,
                                   num=2+extra_ball,
                                   desc='Hutao.energy')
        simulation.event_queue.put(energy_event)

    def normatk_damage_event(self, time, mode, skill_lv: str, scaler_i: int, atk_cnt: str):
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=time,
                                scaler=self.scaler[skill_lv][scaler_i],
                                mode=mode,
                                icd=ICD('normal_atk', '',
                                        time, 1),
                                desc=f'Hutao.diewu.{atk_cnt}')
        return damage_event

    def restore_judge(self, event: 'Event') -> bool:
        if not self.restore_cd:
            creation_space = CreationSpace()
            for c in creation_space.marks:
                if c.name == 'Paramita Papilio State' and event.time <= c.end:
                    self.restore_cd = DurationConstraint(c.start-5, 5, refresh=True)
                    break
        return self.restore_cd.test(event)


class ParamitaPapilioCharge(Skill):
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=hutao,
            sourcename=hutao.name,
            LV=hutao.attribute.normatk_lv,
            elem_type=ElementType.PYRO,
            action_type=ActionType.NORMAL_ATK_CHARGE,
            damage_type=DamageType.CHARGED_ATK,
            action_time=hutao.action.normatk_time,
            scaler=hutao.action.normatk_scaler
        )

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        # fetch mode and other information
        mode = event.mode
        act_t: float = self.action_time[-1]/60

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc='Hutao.diewu_charged')
        simulation.event_queue.put(action_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[0])
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=self.scaler[skill_lv][6],
                                mode=mode,
                                icd=ICD('charged_atk', 'polearm',
                                        event.time+act_t, 1),
                                desc='Hutao.diewu_charged')
        simulation.event_queue.put(damage_event)
        
        # impose special effect
        self.impose_effect(simulation, damage_event)

        # judge special restore cd
        if not self.source.action.NORMAL_ATK.diewu.restore_judge(event):
            return

        # energy event
        if mode == '$':
            extra_ball = int(random() <= 1/2)
        else:
            extra_ball = 1/2
        energy_event = EnergyEvent(time=event.time,
                                   source=self,
                                   sourcename=self.sourcename,
                                   elem=ElementType.PYRO,
                                   base=1,
                                   num=2+extra_ball,
                                   desc='Hutao.energy')
        simulation.event_queue.put(energy_event)
        
    def impose_effect(self, simulation: 'Simulation', event: 'Event'):
        creation_space = CreationSpace()
        for c in creation_space.creations:
            if c.name == 'Blood Blossom' and c.end > event.time:
                c.renew(simulation, event)
                break
        else:
            blossom = BloodBlossom(self.source.action.ELEM_SKILL)
            blossom.activate(simulation, event)
            creation_space.insert(blossom)
        
