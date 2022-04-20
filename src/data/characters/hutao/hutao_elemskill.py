from random import random
from typing import TYPE_CHECKING
from core.entities.creation import IndependentCreation, Creation, CreationSpace
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


class HutaoElemskill(Skill):
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.ELEM_SKILL,
            source=hutao,
            sourcename=hutao.name,
            LV=hutao.attribute.elemskill_lv,
            elem_type=ElementType.PYRO,
            action_type=ActionType.ELEM_SKILL,
            damage_type=DamageType.ELEM_SKILL,
            action_time=hutao.action.elemskill_time,
            scaler=hutao.action.elemskill_scaler,
        )
        self.cd = None

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
                                cd=self.cd.end,
                                desc='Hutao.elem_skill')
        simulation.event_queue.put(action_event)

        # enter special state
        self.elemskill_transformation(simulation, event)
        
        # lose hp
        hp = -self.source.attribute.hp_now * 0.3
        health_event = HealthEvent()
        health_event.initialize(time=event.time,
                                subtype=HealthType.LOSS,
                                source=self,
                                sourcename=self.sourcename,
                                scaler=[0, hp],
                                target=['Hutao'],
                                desc='Hutao.elem_skill')
        simulation.event_queue.put(health_event)

    @staticmethod
    def reject_event(sim, ev: 'Event', reason):
        sim.output_log.append(
            f'[REJECT]:[{ev.time}s: {ev.desc}; reason: {reason}]')

    @staticmethod
    def elemskill_cd(start):
        def f(ev: Event):
            return ev.type == EventType.COMMAND and ev.desc == 'CMD.Hutao.E'
        cd_counter = DurationConstraint(start, 16, func=f, refresh=True)
        return cd_counter

    def elemskill_transformation(self, simulation: 'Simulation', event: 'Event'):
        self.build_buff(simulation, event)
        state = ParamitaPapilioState(event.time)
        creation_space = CreationSpace()
        creation_space.mark_insert(state)

    def build_buff(self, simulation: 'Simulation', event: 'Event'):
        def trigger(simulation: 'Simulation'):
            creation_space = CreationSpace()
            return creation_space.mark_active('Paramita Papilio State', simulation.clock)
        self.buff = Buff(
            type=BuffType.ATTR,
            name='Hutao: Paramita Papilio',
            sourcename='Hutao',
            constraint=Constraint(event.time, 9),
            trigger=trigger,
            target_path=[['Hutao'], 'ATK']
        )
        s: Character = self.source
        skill_lv = str(s.talent[1])
        n = min(s.attribute.HP.value*self.scaler[skill_lv][1],
                s.attribute.ATK.find('ATK Base').value*4)
        self.buff.add_buff('Total ATK', 'DieWu ATK', n)
        controller = NumericController()
        controller.insert_to(self.buff, 'da', simulation)
        simulation.event_queue.put(BuffEvent().frombuff(self.buff))

    def paramita_papilio_state(self, simulation: 'Simulation', event: 'Event') -> bool:
        creation_space = CreationSpace()
        return creation_space.mark_active('Paramita Papilio State', event.time)


class ParamitaPapilioState(Creation):
    def __init__(self, start):
        super().__init__(
            sourcename='Hutao',
            name='Paramita Papilio State',
            start=start,
            duration=9,
            exist_num=1
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.SWITCH and event.source != 'Hutao':
            self.duration = event.time - self.start


class BloodBlossom(IndependentCreation):
    def __init__(self, skill: HutaoElemskill):
        super().__init__(
            source=skill,
            sourcename='Hutao',
            name='Blood Blossom',
            start=0,
            duration=8,
            exist_num=1,
            scaler=skill.scaler[str(skill.source.talent[1])]
        )
        self.skills = BlossomAttack(self)

    def activate(self, simulation: 'Simulation', event: 'Event'):
        self.mode = event.mode
        self.start = event.time
        creation_event = CreationEvent()
        creation_event.initialize(time=event.time,
                                  subtype='creation',
                                  source=self,
                                  sourcename=self.sourcename,
                                  desc='Hutao.blood_blossom')
        simulation.event_queue.put(creation_event)
        self.selfexcite_func(simulation, event)

    def renew(self, simulation: 'Simulation', event: 'Event'):
        self.mode = event.mode
        self.duration += (8-self.end+event.time)

    def selfexcite_func(self, simulation: 'Simulation', event: 'Event'):
        creation_event = CreationEvent()
        creation_event.initialize(time=event.time+4,
                                  subtype='selfexcite',
                                  source=self,
                                  sourcename=self.sourcename,
                                  desc='Hutao.blood_blossom')
        simulation.event_queue.put(creation_event)

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if isinstance(event.source, BloodBlossom) and event.subtype == 'selfexcite' and event.time <= self.end:
            self.skills(simulation, event)
            self.selfexcite_func(simulation, event)


class BlossomAttack(Skill):
    def __init__(self, blossom: BloodBlossom):
        super().__init__(
            type=SkillType.CREATION_TRIG,
            source=blossom,
            sourcename='Hutao',
            elem_type=ElementType.PYRO,
            action_type=ActionType.ELEM_SKILL,
            damage_type=DamageType.ELEM_SKILL,
            scaler=blossom.scaler
        )

    def __call__(self, simulation: 'Simulation', event: 'Event') -> None:
        mode = self.source.mode
        if mode == '0':
            return
        # damage event
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time,
                                scaler=self.scaler[2],
                                mode=mode,
                                icd=ICD('elem_skill', '',
                                        event.time, 1),
                                desc='Hutao.blood_blossom')
        simulation.event_queue.put(damage_event)
