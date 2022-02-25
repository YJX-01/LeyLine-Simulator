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

        self.musou_isshin_state = self.musou_isshin_count()
        self.musou = MusouIsshin(shogun)

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

        if self.musou_isshin_state.test(simulation.event_log) and self.musou_isshin_dur(simulation.event_log, event.time):
            self.musou(simulation, event)
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
                if isinstance(ev.source, ShogunNormATK) or isinstance(ev.source, MusouIsshin):
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

    def musou_isshin_count(self):
        def musou(ev: 'Event'):
            if ev.sourcename == 'Shogun' and ev.subtype == ActionType.ELEM_BURST:
                return 1
            elif ev.type == EventType.SWITCH:
                return -10
            else:
                return 0

        state = CounterConstraint(0, 1000, 1, musou)
        return state

    def musou_isshin_dur(self, log: list, time: float) -> bool:
        for ev in reversed(log):
            if ev.sourcename == 'Shogun' and ev.subtype == ActionType.ELEM_BURST:
                break
        return time < ev.time + 7


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


class MusouIsshin(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.ELEM_BURST,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.elemburst_lv,
            elem_type=ElementType.ELECTRO,
            action_type=ActionType.NORMAL_ATK,
            damage_type=DamageType.ELEM_BURST,
            scaler=shogun.action.elemburst_scaler
        )
        self.parallel = MusouIsshinCharge(shogun)
        self.restore_counter = None
        self.restore_cd = None

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        cmd = event.cmd
        mode = event.mode
        if cmd == 'Z':
            self.parallel(simulation, event)
            return

        act_cnt: int = self.source.action.NORMAL_ATK.attack_counter.test(
            simulation.event_log)
        stack_cnt: int = round(self.source.action.ELEM_BURST.creations.last)

        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                func=self.musou_isshin_action_event,
                                desc=f'Shogun.action.musou_isshin.{act_cnt}')
        simulation.event_queue.put(action_event)

        if mode == '0':
            return
        if act_cnt == 3:
            scaler = self.scaler[str(self.LV)][7] +\
                self.scaler[str(self.LV)][8] +\
                self.scaler[str(self.LV)][2]*stack_cnt*2
        elif act_cnt == 4:
            scaler = self.scaler[str(self.LV)][9] + \
                self.scaler[str(self.LV)][2]*stack_cnt
        else:
            scaler = self.scaler[str(self.LV)][act_cnt+4] + \
                self.scaler[str(self.LV)][2]*stack_cnt
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+0.1,
                                scaler=scaler,
                                mode=mode,
                                desc=f'Shogun.damage.musou_isshin.{act_cnt}')
        simulation.event_queue.put(damage_event)

        if not self.restore_cd.test(event):
            return
        self.restore_counter.test(simulation.event_log)
        if self.restore_counter.full:
            return
        restore_energy = self.scaler[str(self.LV)][-4]
        if len(self.source.PASSIVE) == 2:
            restore_energy *= (1+(self.source.attribute.ER()-1)*0.6)
        energy_event = EnergyEvent(time=event.time,
                                   source=self,
                                   sourcename=self.sourcename,
                                   func=self.restore,
                                   desc='Shogun.musou_isshin.energy',
                                   num=restore_energy)
        simulation.event_queue.put(energy_event)

    def musou_isshin_action_event(self, simulation: 'Simulation', event: 'Event'):
        simulation.uni_action_constraint = DurationConstraint(
            event.time, 0.1,
            lambda ev: True if ev.type == EventType.COMMAND else False
        )
        return

    @staticmethod
    def restore(simulation: 'Simulation', event: 'EnergyEvent'):
        for name, character in simulation.characters.items():
            if name == 'Shogun':
                continue
            character.action.ELEM_BURST.energy.receive(event.num)


class MusouIsshinCharge(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.ELEM_BURST,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.elemburst_lv,
            elem_type=ElementType.ELECTRO,
            action_type=ActionType.NORMAL_ATK_CHARGE,
            damage_type=DamageType.ELEM_BURST,
            scaler=shogun.action.elemburst_scaler
        )

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        mode = event.mode

        stack_cnt: int = round(self.source.action.ELEM_BURST.creations.last)

        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                func=self.musou_isshin_charge_action_event,
                                desc=f'Shogun.action.musou_isshin_charge')
        simulation.event_queue.put(action_event)

        if mode == '0':
            return
        scaler = self.scaler[str(self.LV)][10] +\
            self.scaler[str(self.LV)][11] +\
            self.scaler[str(self.LV)][2]*stack_cnt*2
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+0.1,
                                scaler=scaler,
                                mode=mode,
                                desc=f'Shogun.damage.musou_isshin_charge')
        simulation.event_queue.put(damage_event)

        if not self.source.action.NORMAL_ATK.musou.restore_cd.test(event):
            return
        self.source.action.NORMAL_ATK.musou.restore_counter.test(
            simulation.event_log)
        if self.source.action.NORMAL_ATK.musou.restore_counter.full:
            return
        restore_energy = self.scaler[str(self.LV)][-4]
        if len(self.source.PASSIVE) == 2:
            restore_energy *= (1+(self.source.attribute.ER()-1)*0.6)
        energy_event = EnergyEvent(time=event.time,
                                   source=self,
                                   sourcename=self.sourcename,
                                   func=self.restore,
                                   desc='Shogun.musou_isshin.energy',
                                   base=restore_energy)
        simulation.event_queue.put(energy_event)

    def musou_isshin_charge_action_event(self, simulation: 'Simulation', event: 'Event'):
        simulation.uni_action_constraint = DurationConstraint(
            event.time, 0.1,
            lambda ev: True if ev.type == EventType.COMMAND else False
        )
        return

    @staticmethod
    def restore(simulation: 'Simulation', event: 'EnergyEvent'):
        for name, character in simulation.characters.items():
            if name == 'Shogun':
                continue
            character.action.ELEM_BURST.energy.receive(event.num)
