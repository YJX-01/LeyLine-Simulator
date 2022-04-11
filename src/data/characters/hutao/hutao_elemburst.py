from typing import TYPE_CHECKING
from core.entities.creation import *
from core.rules.alltypes import *
from core.rules.skill import Skill
from core.rules.icd import ICD
from core.simulation.constraint import *
from core.simulation.event import *
from .hutao_elemskill import BloodBlossom
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class HutaoElemburst(Skill):
    def __init__(self, hutao: 'Character'):
        super().__init__(
            type=SkillType.ELEM_BURST,
            source=hutao,
            sourcename=hutao.name,
            LV=hutao.attribute.elemburst_lv,
            elem_type=ElementType.PYRO,
            action_type=ActionType.ELEM_BURST,
            damage_type=DamageType.ELEM_BURST,
            action_time=hutao.action.elemburst_time,
            scaler=hutao.action.elemburst_scaler
        )
        self.cd = self.elemburst_cd(-15)
        self.energy = CounterConstraint(0, 1000, 60)

    def __call__(self, simulation: 'Simulation', event: 'CommandEvent'):
        # check action collision
        if simulation.uni_action_constraint and not simulation.uni_action_constraint.test(event):
            self.reject_event(simulation, event, reason='action collision')
            return
        # check cd
        elif self.cd and not self.cd.test(event):
            self.reject_event(simulation, event, reason='cd')
            return
        # check energy
        elif not self.energy.full:
            if self.energy.capacity - self.energy.count <= simulation.energy_tolerance:
                simulation.output_log.append(
                    f'[WARNING]:[{self.sourcename} force activate, energy: {self.energy.count}]')
            else:
                self.reject_event(simulation, event, reason='energy')
                return

        # check finish, clear energy, reset cd (cd has begin delay)
        self.energy.clear()
        self.cd = self.elemburst_cd(event.time+self.action_time[0]/60)

        # fetch mode and other information
        mode = event.mode
        act_t: float = self.action_time[1]/60  # frame delay

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc='Hutao.elem_burst')
        simulation.event_queue.put(action_event)

        # low hp judge
        low_flag = self.hp_judge(simulation)

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[2])
        scaler = self.scaler[skill_lv][1] if low_flag else self.scaler[skill_lv][0]
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=scaler,
                                mode=mode,
                                icd=ICD('elem_burst', '',
                                        event.time+act_t, 2),
                                desc='Hutao.elem_burst')
        simulation.event_queue.put(damage_event)

        # gain hp
        scaler = self.scaler[skill_lv][3] if low_flag else self.scaler[skill_lv][2]
        health_event = HealthEvent()
        health_event.initialize(time=event.time,
                                subtype=HealthType.HEAL,
                                source=self,
                                sourcename=self.sourcename,
                                scaler=[scaler, 0],
                                target=['Hutao'],
                                desc='Hutao.elem_burst')
        simulation.event_queue.put(health_event)
        
        # include CX 2
        if self.source.attribute.cx_lv >= 2:
            self.impose_effect(simulation, damage_event)

    @staticmethod
    def reject_event(sim, ev: 'Event', reason):
        sim.output_log.append(
            f'[REJECT]:[{ev.time}s: {ev.desc}; reason: {reason}]')

    @staticmethod
    def elemburst_cd(start):
        def f(ev: Event):
            return ev.type == EventType.COMMAND and ev.desc == 'CMD.Hutao.Q'
        cd_counter = DurationConstraint(start, 15, func=f, refresh=True)
        return cd_counter

    def hp_judge(self, simulation: 'Simulation') -> bool:
        per = simulation.characters['Hutao'].hp_percentage
        return per[0] <= per[1]/2

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
