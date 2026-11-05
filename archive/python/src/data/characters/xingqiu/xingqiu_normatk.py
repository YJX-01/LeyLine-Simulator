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


class XingqiuNormATK(Skill):
    def __init__(self, xingqiu: 'Character') -> None:
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=xingqiu,
            sourcename=xingqiu.name,
            LV=xingqiu.attribute.normatk_lv,
            elem_type=ElementType.PHYSICAL,
            action_type=ActionType.NORMAL_ATK,
            damage_type=DamageType.NORMAL_ATK,
            action_time=xingqiu.action.normatk_time,
            scaler=xingqiu.action.normatk_scaler
        )

        self.attack_counter = self.normatk_counter()
        self.stamina = self.stamina_counter()
        self.parallel = XingqiuChargeATK(xingqiu)

        self.musou = MusouIsshin(xingqiu)

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        # check action collision
        if simulation.uni_action_constraint and not simulation.uni_action_constraint.test(event):
            self.reject_event(simulation, event, reason='action collision')
            return

        # judge transformation state
        if self.musou_isshin_state(simulation, event):
            self.musou(simulation, event)
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
                                desc=f'Xingqiu.normal_atk.{act_cnt}')
        simulation.event_queue.put(action_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[0])
        if act_cnt == 3:
            damage_event1 = self.normatk_damage_event(
                event.time+act_t, mode, skill_lv, 3, '3-1')
            damage_event2 = self.normatk_damage_event(
                event.time+act_t, mode, skill_lv, 4, '3-2')
            simulation.event_queue.put(damage_event1)
            simulation.event_queue.put(damage_event2)
        else:
            scaler_i = 5 if act_cnt == 4 else act_cnt
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
            elif isinstance(ev.source, XingqiuNormATK) or isinstance(ev.source, MusouIsshin):
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
                                desc=f'Xingqiu.normal_atk.{atk_cnt}')
        return damage_event

    def musou_isshin_state(self, simulation: 'Simulation', event: 'Event') -> bool:
        creation_space = CreationSpace()
        for c in creation_space.creations:
            if c.name == 'Musou Isshin State' and c.end > event.time:
                return True
        else:
            return False


class XingqiuChargeATK(Skill):
    def __init__(self, xingqiu: 'Character'):
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=xingqiu,
            sourcename=xingqiu.name,
            LV=xingqiu.attribute.normatk_lv,
            elem_type=ElementType.PHYSICAL,
            action_type=ActionType.NORMAL_ATK_CHARGE,
            damage_type=DamageType.CHARGED_ATK,
            action_time=xingqiu.action.normatk_time,
            scaler=xingqiu.action.normatk_scaler
        )

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        # fetch mode and other information
        mode = event.mode
        act_t: float = self.action_time[5]/60

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc='Xingqiu.charged_atk')
        simulation.event_queue.put(action_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[0])
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=self.scaler[skill_lv][6],
                                mode=mode,
                                icd=ICD('normal_atk', '',
                                        event.time+act_t, 1),
                                desc='Xingqiu.charged_atk')
        simulation.event_queue.put(damage_event)


class MusouIsshin(Skill):
    def __init__(self, xingqiu: 'Character'):
        super().__init__(
            type=SkillType.ELEM_BURST,
            source=xingqiu,
            sourcename=xingqiu.name,
            LV=xingqiu.attribute.elemburst_lv,
            elem_type=ElementType.ELECTRO,
            action_type=ActionType.NORMAL_ATK,
            damage_type=DamageType.ELEM_BURST,
            action_time=xingqiu.action.normatk_time,
            scaler=xingqiu.action.elemburst_scaler
        )
        self.parallel = MusouIsshinCharge(xingqiu)
        self.restore_counter = None
        self.restore_cd = None

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        # fetch cmd and mode
        cmd = event.cmd
        mode = event.mode
        if cmd == 'Z':
            self.parallel(simulation, event)
            return

        # fetch other information
        act_cnt: int = self.source.action.NORMAL_ATK.attack_counter.test(
            simulation.event_log)
        act_t: float = self.action_time[act_cnt+6]/60
        stack_cnt: int = round(self.source.action.ELEM_BURST.creations.last)

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc=f'Xingqiu.musou_isshin.{act_cnt}')
        simulation.event_queue.put(action_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[2])
        if act_cnt == 3:
            scaler1 = self.scaler[skill_lv][7] + \
                self.scaler[skill_lv][2]*stack_cnt
            damage_event1 = self.musou_isshin_damage_event(
                event.time+act_t, mode, scaler1, '3-1')
            simulation.event_queue.put(damage_event1)

            scaler2 = self.scaler[skill_lv][8] + \
                self.scaler[skill_lv][2]*stack_cnt
            damage_event2 = self.musou_isshin_damage_event(
                event.time+act_t, mode, scaler2, '3-2')
            simulation.event_queue.put(damage_event2)
        else:
            if act_cnt == 4:
                scaler = self.scaler[skill_lv][9] + \
                    self.scaler[skill_lv][2]*stack_cnt
            else:
                scaler = self.scaler[skill_lv][act_cnt+4] + \
                    self.scaler[skill_lv][2]*stack_cnt
            damage_event = self.musou_isshin_damage_event(
                event.time+act_t, mode, scaler, str(act_cnt))
            simulation.event_queue.put(damage_event)

        # judge special restore cd
        if not self.restore_judge(event):
            return

        # energy event
        restore_energy = self.scaler[skill_lv][-4]
        # passive talent 2
        if self.source.action.passive_lv == 2:
            restore_energy *= (1+(self.source.attribute.ER.value-1)*0.6)

        receiver = [n for n in simulation.shortcut.values() if n != 'Xingqiu']
        energy_event = EnergyEvent(time=event.time,
                                   source=self,
                                   sourcename=self.sourcename,
                                   num=restore_energy,
                                   receiver=receiver,
                                   desc='Xingqiu.musou_isshin.energy')
        simulation.event_queue.put(energy_event)

        # include CX 6
        if self.source.attribute.cx_lv >= 6:
            for name in receiver:
                simulation.characters[name].action.ELEM_BURST.cd.reduce(1)

    def musou_isshin_damage_event(self, time, mode, scaler: float, atk_cnt: str):
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=time,
                                scaler=scaler,
                                mode=mode,
                                icd=ICD('elem_burst', '',
                                        time, 1),
                                desc=f'Xingqiu.musou_isshin.{atk_cnt}')
        return damage_event

    def restore_judge(self, event: 'Event'):
        if not self.restore_counter or self.restore_counter.end < event.time:
            creation_space = CreationSpace()
            for c in creation_space.creations:
                if c.name == 'Musou Isshin State' and c.end > event.time:
                    self.restore_counter = CounterConstraint(c.start, 7, 5)
                    self.restore_cd = DurationConstraint(
                        c.start-1, 1, refresh=True)
                    break

        if not self.restore_counter.full and self.restore_cd.test(event):
            self.restore_counter.receive(1)
            return True
        else:
            return False


class MusouIsshinCharge(Skill):
    def __init__(self, xingqiu: 'Character'):
        super().__init__(
            type=SkillType.ELEM_BURST,
            source=xingqiu,
            sourcename=xingqiu.name,
            LV=xingqiu.attribute.elemburst_lv,
            elem_type=ElementType.ELECTRO,
            action_type=ActionType.NORMAL_ATK_CHARGE,
            damage_type=DamageType.ELEM_BURST,
            action_time=xingqiu.action.normatk_time,
            scaler=xingqiu.action.elemburst_scaler
        )

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        # fetch mode and other information
        mode = event.mode
        act_t: float = self.action_time[-1]/60
        stack_cnt: int = round(self.source.action.ELEM_BURST.creations.last)

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc='Xingqiu.musou_isshin_charge')
        simulation.event_queue.put(action_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[2])
        damage_event1 = DamageEvent().fromskill(self)
        damage_event1.initialize(time=event.time+act_t,
                                 scaler=self.scaler[skill_lv][10] +
                                 self.scaler[skill_lv][2]*stack_cnt,
                                 mode=mode,
                                 icd=ICD('elem_burst', '',
                                         event.time+act_t, 1),
                                 desc='Xingqiu.musou_isshin_charge.1')
        damage_event2 = DamageEvent().fromskill(self)
        damage_event2.initialize(time=event.time+act_t,
                                 scaler=self.scaler[skill_lv][11] +
                                 self.scaler[skill_lv][2]*stack_cnt,
                                 mode=mode,
                                 icd=ICD('elem_burst', '',
                                         event.time+act_t, 1),
                                 desc='Xingqiu.musou_isshin_charge.2')
        simulation.event_queue.put(damage_event1)
        simulation.event_queue.put(damage_event2)

        # judge special restore cd
        if not self.source.action.NORMAL_ATK.musou.restore_judge(event):
            return

        # energy event
        restore_energy = self.scaler[skill_lv][-4]
        # passive talent 2
        if self.source.action.passive_lv == 2:
            restore_energy *= (1+(self.source.attribute.ER.value-1)*0.6)

        receiver = [n for n in simulation.shortcut.values() if n != 'Xingqiu']
        energy_event = EnergyEvent(time=event.time,
                                   source=self,
                                   sourcename=self.sourcename,
                                   num=restore_energy,
                                   receiver=receiver,
                                   desc='Xingqiu.musou_isshin.energy')
        simulation.event_queue.put(energy_event)

        # include CX 6
        if self.source.attribute.cx_lv >= 6:
            for name in receiver:
                simulation.characters[name].action.ELEM_BURST.cd.reduce(1)
