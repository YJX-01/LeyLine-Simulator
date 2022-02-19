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
            LV=albedo.attribute.normatk_lv,
            elem_type=ElementType.PHYSICAL,
            action_type=ActionType.NORMAL_ATK,
            damage_type=DamageType.NORMAL_ATK,
            scaler=albedo.action.normatk_scaler
        )

        self.norm_cnt = self.normatk_counter()

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        for c in simulation.active_constraint:
            if isinstance(c, DurationConstraint) and not c.test(event):
                return
        if not simulation.uni_action_constraint(Event):
            return
        act_cnt: int = self.norm_cnt.test(simulation.event_log)

        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                func=self.normatk_action_event,
                                desc=f'Albedo.action.normatk.{act_cnt}')

        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+0.2,
                                func=self.normatk_damage_event,
                                desc=f'Albedo.damage.normatk.{act_cnt}')

        simulation.event_queue.put(action_event)
        simulation.event_queue.put(damage_event)

    @staticmethod
    def normatk_counter():
        def f(ev: 'Event'):
            if ev.type == EventType.ACTION and isinstance(ev.source, AlbedoNormATK):
                return 1
            elif ev.type == EventType.ACTION:
                return -10
            else:
                return 0

        circulation_counter = CounterConstraint(0, 1000, 5, f)
        circulation_counter.circulate()
        return circulation_counter

    def normatk_action_event(self, simulation: 'Simulation', event: 'Event'):
        simulation.uni_action_constraint = DurationConstraint(
            event.time, 0.1,
            lambda ev: True if ev.type == EventType.COMMAND else False
        )
        simulation.output_log.append(event.prefix_info +
                                     '\n\t\t[detail ]:[albedo normal atk action event happen' +
                                     '\n\t\t\t   apply action duration constraint]')

    def normatk_damage_event(self, simulation: 'Simulation', event: 'Event'):
        s = self.scaler[str(self.LV)][self.norm_cnt.test(simulation.event_log)]
        simulation.output_log.append(event.prefix_info +
                                     f'\n\t\t[detail ]:[albedo normal atk damage event happen, scaler: {s}]')

    @staticmethod
    def normatk_energy_event(simulation: 'Simulation', event: 'Event'):
        pass

class AlbedoChargeATK(Skill):
    def __init__(self, albedo: 'Character'):
        super().__init__(
            type=SkillType.NORMAL_ATK,
            source=albedo,
            LV=albedo.attribute.normatk_lv,
            elem_type=ElementType.PHYSICAL,
            action_type=ActionType.NORMAL_ATK_CHARGE,
            damage_type=DamageType.CHARGED_ATK,
            scaler=albedo.action.normatk_scaler
        )
        