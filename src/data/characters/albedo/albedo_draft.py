from typing import TYPE_CHECKING
from core.simulation.event import Event
from core.rules.skill import *
from core.rules.damage import *

if TYPE_CHECKING:
    from core.simulation.event import Simulation
    from core.entities.character import Character


def Albedo_NORMAL_ATK(character: 'Character', time: float):
    atk_event = Event({'time': time})
    @normal_atk(count=character.action.NORMAL_ATK_count)
    def on_normal_atk(simulation: 'Simulation'):
        print("\t\tALBEDO NORMAL ATK")
    atk_event.func = on_normal_atk
    atk_event.desc = 'ALBEDO NORMAL ATK EVENT'
    
    damage_event = Event({'time': time + 0.2})
    @damage(elem=ElementType.PHYSICAL, type=DamageType.NORMAL_ATK)
    def on_damage(simulation: 'Simulation'):
        print("\t\tALBEDO NORMAL ATK DAMAGE")
    damage_event.func = on_damage
    damage_event.desc = 'ALBEDO NORMAL ATK DAMAGE EVENT'
    
    return [atk_event, damage_event]

def Albedo_ELEM_SKILL():
    pass

def Albedo_ELEM_BURST():
    pass