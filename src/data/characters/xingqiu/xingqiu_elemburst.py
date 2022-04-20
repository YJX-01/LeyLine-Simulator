from typing import TYPE_CHECKING
from core.entities.creation import *
from core.rules.alltypes import *
from core.rules.skill import Skill
from core.rules.icd import ICD
from core.simulation.constraint import *
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class ShogunElemburst(Skill):
    def __init__(self, shogun: 'Character'):
        super().__init__(
            type=SkillType.ELEM_BURST,
            source=shogun,
            sourcename=shogun.name,
            LV=shogun.attribute.elemburst_lv,
            elem_type=ElementType.ELECTRO,
            action_type=ActionType.ELEM_BURST,
            damage_type=DamageType.ELEM_BURST,
            action_time=shogun.action.elemburst_time,
            scaler=shogun.action.elemburst_scaler
        )
        self.cd = self.elemburst_cd(-18)
        self.energy = CounterConstraint(0, 1000, 90)
        self.creations: Creation = ChakraDesiderata(self)

        self.elemburst_creation_init()

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
        delay_time = event.time+self.action_time[0]/60
        self.cd = self.elemburst_cd(delay_time)
        clear_event = EnergyEvent(time=delay_time, sourcename=self.sourcename,
                                  num=-self.energy.capacity, receiver=[self.sourcename])
        simulation.event_queue.put(clear_event)

        # fetch mode and other information
        mode = event.mode
        act_t: float = self.action_time[1]/60  # frame delay
        # reset ChakraDesiderata
        self.creations.clear()
        stack_cnt: int = self.creations.last  # resolve stack

        # action event
        action_event = ActionEvent().fromskill(self)
        action_event.initialize(time=event.time,
                                dur=act_t,
                                desc='Shogun.elem_burst')
        simulation.event_queue.put(action_event)

        # enter special state
        self.elemburst_transformation(event.time, simulation)

        # special energy restore mechanism
        restore_cnt = CounterConstraint(
            event.time, 7, 5, func=self.restore_cnt)
        restore_cd = DurationConstraint(
            event.time, 7, func=lambda ev: True, refresh=True)
        self.source.action.NORMAL_ATK.musou.restore_cnt = restore_cnt
        self.source.action.NORMAL_ATK.musou.restore_cd = restore_cd

        # damage event
        if mode == '0':
            return
        skill_lv = str(self.source.talent[2])
        scaler = self.scaler[skill_lv][0] + self.scaler[skill_lv][1]*stack_cnt
        damage_event = DamageEvent().fromskill(self)
        damage_event.initialize(time=event.time+act_t,
                                scaler=scaler,
                                mode=mode,
                                icd=ICD('elem_burst', '',
                                        event.time+act_t, 2),
                                desc='Shogun.elem_burst')
        simulation.event_queue.put(damage_event)

    @staticmethod
    def reject_event(sim, ev: 'Event', reason):
        sim.output_log.append(
            f'[REJECT]:[{ev.time}s: {ev.desc}; reason: {reason}]')

    @staticmethod
    def elemburst_cd(start):
        def f(ev: Event):
            return ev.type == EventType.COMMAND and ev.desc == 'CMD.Shogun.Q'
        cd_counter = DurationConstraint(start, 18, func=f, refresh=True)
        return cd_counter

    def elemburst_creation_init(self):
        creation_space = CreationSpace()
        creation_space.insert(self.creations)

    def elemburst_transformation(self, time, simulation: 'Simulation'):
        state = MusouIsshinState(time)
        creation_space = CreationSpace()
        creation_space.insert(state)

    @staticmethod
    def restore_cnt(ev: 'Event'):
        return int(ev.type == EventType.ENERGY and ev.desc == 'Shogun.musou_isshin.energy')


class ChakraDesiderata(TriggerableCreation):
    def __init__(self, skill: ShogunElemburst):
        super().__init__(
            source=skill,
            sourcename='Shogun',
            name='Chakra Desiderata',
            start=0,
            duration=1000,
            exist_num=1,
            scaler=skill.scaler[str(skill.source.talent[2])]
        )
        self.stack = CounterConstraint(0, 1000, 60)
        self.last = 0

    def clear(self):
        self.last = round(self.stack.count)
        self.stack.clear()

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type != EventType.ACTION or event.subtype != ActionType.ELEM_BURST:
            return
        # refresh scaler
        self.scaler = self.source.scaler[str(self.source.source.talent[2])]

        if event.sourcename != 'Shogun':
            energy_cnt = event.source.energy.capacity
            resolve_cnt = energy_cnt*self.scaler[3]
            # include CX 1
            if simulation.characters['Shogun'].attribute.cx_lv >= 1:
                if event.source.base.element == ElementType.ELECTRO.value:
                    resolve_cnt *= 1.8
                else:
                    resolve_cnt *= 1.2
            self.stack.receive(resolve_cnt)


class MusouIsshinState(Creation):
    def __init__(self, start):
        super().__init__(
            sourcename='Shogun',
            name='Musou Isshin State',
            start=start,
            duration=7,
            exist_num=1
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.SWITCH and event.source != 'Shogun':
            self.duration = event.time - self.start
