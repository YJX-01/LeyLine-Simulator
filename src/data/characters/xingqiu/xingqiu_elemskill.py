from random import random
from typing import TYPE_CHECKING
from core.entities.creation import TriggerableCreation, Creation, CreationSpace
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


class ShogunElemskill(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.ELEM_SKILL,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.elemskill_lv,
            elem_type=ElementType.ELECTRO,
            action_type=ActionType.ELEM_SKILL,
            damage_type=DamageType.ELEM_SKILL,
            action_time=shogun.action.elemskill_time,
            scaler=shogun.action.elemskill_scaler,
        )
        self.cd = None
        self.creations: Creation = EyeOfStormyJudgment(self)

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent') -> None:
        # check action collision
        if simulation.uni_action_constraint and not simulation.uni_action_constraint.test(event):
            self.reject_event(simulation, event, reason='action collision')
            return
        # check cd
        elif self.cd and not self.cd.test(event):
            self.reject_event(simulation, event, reason='cd')
            return

        # check finish, reset cd (cd has begin delay)
        self.cd = self.elemskill_cd(event.time+self.action_time[0]/60)

        # fetch mode and other information
        mode = event.mode
        act_t: float = self.action_time[1]/60

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc='Shogun.elem_skill')
        simulation.event_queue.put(action_event)

        # creation event
        self.creations.mode = mode
        creation_event = CreationEvent()
        creation_event.initialize(time=event.time+act_t,
                                  subtype='creation',
                                  source=self,
                                  sourcename=self.sourcename,
                                  func=self.elemskill_creation_event,
                                  desc='Shogun.elem_skill')
        simulation.event_queue.put(creation_event)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[1])
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=self.scaler[skill_lv][0],
                                mode=mode,
                                icd=ICD('', '',
                                        event.time+act_t, 1),
                                desc='Shogun.elem_skill')
        simulation.event_queue.put(damage_event)

    @staticmethod
    def reject_event(sim, ev: 'Event', reason):
        sim.output_log.append(
            f'[REJECT]:[{ev.time}s: {ev.desc}; reason: {reason}]')

    @staticmethod
    def elemskill_cd(start):
        def f(ev: Event):
            return ev.type == EventType.COMMAND and ev.desc == 'CMD.Shogun.E'
        cd_counter = DurationConstraint(start, 10, func=f, refresh=True)
        return cd_counter

    def elemskill_creation_event(self, simulation: 'Simulation', event: 'Event'):
        creation_space = CreationSpace()
        self.creations.activate(simulation, event.time)
        creation_space.insert(self.creations)


class EyeOfStormyJudgment(TriggerableCreation):
    def __init__(self, skill: ShogunElemskill):
        super().__init__(
            source=skill,
            sourcename='Shogun',
            name='Eye Of StormyJudgment',
            start=0,
            duration=25,
            exist_num=1,
            scaler=skill.scaler[str(skill.source.talent[1])]
        )
        self.skills = EyeAttack(self)

    def activate(self, simulation, start):
        self.start = start
        self.scaler = self.source.scaler[str(
            self.source.source.talent[1])]
        self.skills = EyeAttack(self)
        self.build_buff(simulation, start)

    def build_buff(self, simulation: 'Simulation', start):
        self.buffs = []

        # build buff for each character in the team
        for name, character in simulation.characters.items():
            def trigger(simulation, event):
                return self.start < event.time < self.start+self.duration and event.subtype == DamageType.ELEM_BURST
            energy_cnt = character.action.ELEM_BURST.energy.capacity
            buff = Buff(
                type=BuffType.DMG,
                name=f'{name}: Eye of Stormy Judgement',
                sourcename='Shogun',
                constraint=Constraint(start, 25),
                trigger=trigger,
                target_path=[name],
            )
            buff.add_buff('Elemental Burst Bonus',
                          'Shogun Eye Bonus',
                          energy_cnt*self.scaler[3])
            self.buffs.append(buff)
            
            # avoid repeat buff addition
            if name=='Shogun':
                simulation.event_queue.put(BuffEvent().frombuff(buff))

        numeric_controller = NumericController()
        for b in self.buffs:
            numeric_controller.insert_to(b, 'dd', simulation)

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.DAMAGE and event.time < self.end:
            self.skills(simulation, event)


class EyeAttack(Skill):
    def __init__(self, eye: EyeOfStormyJudgment):
        super().__init__(
            type=SkillType.CREATION_TRIG,
            source=eye,
            sourcename='Shogun',
            elem_type=ElementType.ELECTRO,
            action_type=ActionType.ELEM_SKILL,
            damage_type=DamageType.ELEM_SKILL,
            scaler=eye.scaler
        )
        self.cd = self.eye_cd(eye.start-0.9)

    def __call__(self, simulation: 'Simulation', event: 'Event') -> None:
        if not self.cd.test(event):
            return
        mode = self.source.mode

        # damage event
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+0.02,
                                scaler=self.scaler[1],
                                mode=mode,
                                icd=ICD('elem_skill', '',
                                        event.time, 1),
                                desc='Shogun.EyeAttack')
        simulation.event_queue.put(damage_event)

        if mode == '$':
            extra_ball = int(random() <= 0.5)
        else:
            extra_ball = 0.5
        energy_event = EnergyEvent(time=event.time+simulation.energy_delay,
                                   source=self,
                                   sourcename=self.sourcename,
                                   elem=ElementType.ELECTRO,
                                   base=1,
                                   num=extra_ball,
                                   desc='Shogun.energy')
        simulation.event_queue.put(energy_event)

    @staticmethod
    def eye_cd(start):
        def f(ev: 'Event'):
            return ev.type == EventType.DAMAGE and not isinstance(ev.source, ShogunElemskill)
        cd_counter = DurationConstraint(start, 0.9, func=f, refresh=True)
        return cd_counter
