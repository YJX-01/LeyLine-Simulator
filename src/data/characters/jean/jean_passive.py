from random import random
from typing import TYPE_CHECKING
from core.rules.alltypes import SkillType, ActionType, DamageType, HealthType
from core.rules.skill import Skill
from core.simulation.event import Event, HealthEvent, EnergyEvent
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation
    from core.entities.character import Character


class JeanPassive1(Skill):
    def __init__(self, jean: 'Character'):
        super().__init__(
            type=SkillType.PASSIVE,
            source=jean,
            sourcename=jean.name,
            LV=jean.attribute.passive_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.sourcename == self.sourcename and event.subtype == DamageType.NORMAL_ATK:
            scaler = 0.075
            if event.mode == '$' and (random() <= 0.5):
                return
            else:
                scaler = 0.15
            health_event = HealthEvent()
            health_event.initialize(time=event.time,
                                    subtype=HealthType.HEAL,
                                    source=self,
                                    sourcename=self.sourcename,
                                    depend='ATK',
                                    scaler=[scaler, 0],
                                    target=list(simulation.shortcut.values()),
                                    desc='Jean.passive1')
            simulation.event_queue.put(health_event)


class JeanPassive2(Skill):
    def __init__(self, jean: 'Character'):
        super().__init__(
            type=SkillType.PASSIVE,
            source=jean,
            sourcename=jean.name,
            LV=jean.attribute.passive_lv
        )

    def __call__(self, simulation: 'Simulation', event: 'Event'):
        if event.sourcename == self.sourcename and event.subtype == ActionType.ELEM_BURST:
            energy_event = EnergyEvent(time=event.time+event.dur,
                                       sourcename=self.sourcename,
                                       num=16,
                                       receiver=[self.sourcename],
                                       desc='Jean.passive2')
            simulation.event_queue.put(energy_event)
