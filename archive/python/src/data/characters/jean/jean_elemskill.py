from random import random
from typing import TYPE_CHECKING
from core.entities.numeric import NumericController
from core.entities.buff import Buff
from core.rules.alltypes import *
from core.rules.skill import Skill
from core.rules.icd import ICD
from core.simulation.constraint import *
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class JeanElemskill(Skill):
    def __init__(self, jean: 'Character'):
        super().__init__(
            type=SkillType.ELEM_SKILL,
            source=jean,
            sourcename=jean.name,
            LV=jean.attribute.elemskill_lv,
            elem_type=ElementType.ANEMO,
            action_type=ActionType.ELEM_SKILL,
            damage_type=DamageType.ELEM_SKILL,
            action_time=jean.action.elemskill_time,
            scaler=jean.action.elemskill_scaler,
        )
        self.cd = None
        self.last_hold: float = -1

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent') -> None:
        # check action collision
        if simulation.uni_action_constraint and not simulation.uni_action_constraint.test(event):
            self.reject_event(simulation, event, reason='action collision')
            return
        # check cd
        elif self.cd and not self.cd.test(event):
            self.reject_event(simulation, event, reason='cd')
            return

        # fetch mode and other information
        cmd = event.cmd
        mode = event.mode
        if cmd == 'EH':
            self.last_hold = event.time
            return
        if cmd == 'ER':
            extra_t = event.time - self.last_hold
            begin_t = self.last_hold
            if self.source.attribute.cx_lv >= 1 and extra_t >= 1:
                self.cx1_buff(simulation, event.time)
        else:
            extra_t = 0
            begin_t = event.time

        act_t: float = self.action_time[1]/60 + extra_t

        # check finish, reset cd (cd has begin delay)
        self.cd = self.elemskill_cd(event.time+self.action_time[0]/60)

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=begin_t,
                                dur=act_t,
                                cd=self.cd.end,
                                desc='Jean.elem_skill')
        simulation.event_queue.put(action_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[1])
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=self.scaler[skill_lv][0],
                                mode=mode,
                                icd=ICD('', '',
                                        event.time+act_t, 2),
                                desc='Jean.elem_skill')
        simulation.event_queue.put(damage_event)

        # energy event
        if mode == '$':
            extra_ball = int(random() <= 2/3)
        else:
            extra_ball = 2/3
        energy_event = EnergyEvent(time=event.time,
                                   source=self,
                                   sourcename=self.sourcename,
                                   elem=ElementType.ANEMO,
                                   base=1,
                                   num=2+extra_ball,
                                   desc='Jean.energy')
        simulation.event_queue.put(energy_event)

    @staticmethod
    def reject_event(sim, ev: 'Event', reason):
        sim.output_log.append(
            f'[REJECT]:[{ev.time}s: {ev.desc}; reason: {reason}]')

    @staticmethod
    def elemskill_cd(start):
        def f(ev: Event):
            return ev.type == EventType.COMMAND and ev.desc == 'CMD.Jean.E'
        cd_counter = DurationConstraint(start, 10, func=f, refresh=True)
        return cd_counter

    def cx1_buff(self, simulation, time: float):
        def trigger(simulation, event: 'DamageEvent'):
            return event.sourcename == 'Jean' and event.subtype == DamageType.ELEM_SKILL
        buff = Buff(
            type=BuffType.DMG,
            name='Jean: Spiraling Tempest(CX1)',
            sourcename='Jean',
            constraint=Constraint(time, 1),
            trigger=trigger,
            target_path=['Jean']
        )
        buff.add_buff('Other Bonus',
                      'Jean CX1 Bonus', 0.4)
        controller = NumericController()
        controller.insert_to(buff, 'dd', simulation)
