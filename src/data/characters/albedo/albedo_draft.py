from typing import TYPE_CHECKING
from core.simulation.event import Event
from core.rules.skill import *
from core.rules.damage import *
from core.simulation.trigger import Trigger

if TYPE_CHECKING:
    from core.simulation.event import Simulation
    from core.entities.character import Character


def Albedo_NORMAL_ATK(character: 'Character', time: float):
    atk_event = Event({'time': time})
    @normal_atk(count=character.action.NORMAL_ATK_count)
    def on_normal_atk(simulation: 'Simulation', character: 'Character', time: float):
        print("\t\tALBEDO NORMAL ATK")
    atk_event.character = character
    atk_event.func = on_normal_atk
    atk_event.desc = 'ALBEDO NORMAL ATK EVENT'
    
    damage_event = Event({'time': time + 0.2})
    @damage(elem=ElementType.PHYSICAL, type=DamageType.NORMAL_ATK)
    def on_damage(simulation: 'Simulation', character: 'Character', time: float):
        print("\t\tALBEDO NORMAL ATK DAMAGE")
    damage_event.character = character
    damage_event.func = on_damage
    damage_event.desc = 'ALBEDO NORMAL ATK DAMAGE EVENT'
    
    return [atk_event, damage_event]

def Albedo_ELEM_SKILL(character: 'Character', time: float):
    elem_skill_event = Event({'time': time})
    @elem_skill(count=character.action.ELEM_SKILL_count)
    def on_elem_skill(simulation: 'Simulation', character: 'Character', time: float):
        print('\t\tALBEDO ELEM SKILL')
        start = time + 0.2 # 从伤害结算后开始触发, 或许也可以放在伤害时间里面
        duration = 10.0
        last = 0.0
        cooldown = 2.0
        trigger = Trigger()
        def solar_isotoma(simulation: 'Simulation', character: 'Character', trigger_time: float):
            nonlocal start, duration, last, cooldown, trigger
            if trigger_time > start + duration:
                trigger.unregister('damage_trigger', solar_isotoma)
                return
            if trigger_time <= start:
                return
            if trigger_time < last + cooldown:
                return
            last = trigger_time
            solar_isotoma_event = Event({'time': trigger_time})
            @damage(elem=ElementType.GEO, type=DamageType.ELEM_SKILL)
            def on_solar_damage(simulation: 'Simulation', character: 'Character', time: float):
                print('\t\tSOLAR ISOTOMA DAMAGE')
            solar_isotoma_event.func = on_solar_damage
            solar_isotoma_event.desc = 'SOLAR ISOTOMA DAMAGE EVENT'
            # 这里就直接插入了，trigger 会触发所有同类型的回调，不好取它们的返回值
            simulation.event_queue.put((solar_isotoma_event.time, solar_isotoma_event))
            return
        trigger.register('damage_trigger', solar_isotoma)
        
    elem_skill_event.character = character
    elem_skill_event.func = on_elem_skill
    elem_skill_event.desc = 'ALBEDO ELEM SKILL EVENT'
    
    damage_event = Event({'time': time + 0.2})
    @damage(elem=ElementType.GEO, type=DamageType.ELEM_SKILL)
    def on_damage(simulation: 'Simulation', character: 'Character', time: float):
        print('\t\tALBEDO ELEM SKILL DAMAGE')
    damage_event.character = character
    damage_event.func = on_damage
    damage_event.desc = 'ALBEDO ELEM SKILL DAMAGE EVENT'
    
    
    return [elem_skill_event, damage_event]
    

def Albedo_ELEM_BURST():
    pass