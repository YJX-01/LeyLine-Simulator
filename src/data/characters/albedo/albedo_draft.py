from functools import partial
from typing import TYPE_CHECKING
from core.simulation.event import Event
from core.rules.skill import *
from core.rules.damage import *
from core.simulation.trigger import Trigger

if TYPE_CHECKING:
    from core.simulation.event import Simulation
    from core.entities.character import Character


def Albedo_NORMAL_ATK(character: 'Character', time: float):
    '''
    阿贝多普通攻击技能：生成普通攻击事件 和 伤害事件。
    事件的触发时间，由角色技能的数据表决定。
    事件触发时执行的逻辑由其 func 属性决定。
    '''
    
    atk_event = Event({'time': time})
    
    # 普通攻击（动作），装饰器用于触发 Trigger，如行秋雨帘剑
    @normal_atk(count=character.action.NORMAL_ATK_count)
    def on_normal_atk(simulation: 'Simulation', event: 'Event'):
        print("\t\tALBEDO NORMAL ATK")
    atk_event.character = character
    atk_event.func = on_normal_atk
    atk_event.desc = 'ALBEDO NORMAL ATK EVENT'
    
    damage_event = Event({'time': time + 0.2})
    
    # 普通攻击伤害，装饰器用于触发 Trigger，如阿贝多阳华
    @damage(elem=ElementType.PHYSICAL, type=DamageType.NORMAL_ATK)
    def on_damage(simulation: 'Simulation', event: 'Event'):
        print("\t\tALBEDO NORMAL ATK DAMAGE")
    damage_event.character = character
    damage_event.func = on_damage
    damage_event.desc = 'ALBEDO NORMAL ATK DAMAGE EVENT'
    
    return [atk_event, damage_event]

def Albedo_ELEM_SKILL(character: 'Character', time: float):
    '''
    阿贝多元素战技 包含一个后台的 Trigger。
    '''
    elem_skill_event = Event({'time': time})
    @elem_skill(count=character.action.ELEM_SKILL_count)
    def on_elem_skill(simulation: 'Simulation', event: 'Event'):
        print('\t\tALBEDO ELEM SKILL')
        # 以下四个变量用于实现阳华的触发 CD 机制
        start = time + 0.2 # 从伤害结算后开始触发, 或许也可以放在伤害时间里面
        duration = 10.0
        last = 0.0
        cooldown = 2.0
        trigger = Trigger() # 取 Trigger 实例，全局拿到的都是同一个
        def solar_isotoma(simulation: 'Simulation', event: 'Event'):
            '''
            阿贝多阳华技能 写法与普通的技能相似。
            event 参数就是触发了阳华的事件。
            
            阳华本身这里只有伤害事件。
            如果是行秋雨帘剑的话 也可以加一个动作事件（相当于前摇）。
            
            最后这个函数会被注册进 Trigger 的消息系统中
            由 '@damage' 中通过 'damage_trigger' 触发
            '''
            nonlocal start, duration, last, cooldown, trigger
            trigger_time = event.time
            character = event.character
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
            def on_solar_damage(simulation: 'Simulation', event: 'Event'):
                print('\t\tSOLAR ISOTOMA DAMAGE')
            solar_isotoma_event.func = on_solar_damage
            solar_isotoma_event.desc = 'SOLAR ISOTOMA DAMAGE EVENT'
            # 这里就直接插入了，trigger 会触发所有同类型的回调，不好取它们的返回值
            simulation.event_queue.put((solar_isotoma_event.time, solar_isotoma_event))
            return
        # 把阳华注册进去
        trigger.register('damage_trigger', solar_isotoma)
        
    elem_skill_event.character = character
    elem_skill_event.func = on_elem_skill
    elem_skill_event.desc = 'ALBEDO ELEM SKILL EVENT'
    
    damage_event = Event({'time': time + 0.2})
    @damage(elem=ElementType.GEO, type=DamageType.ELEM_SKILL)
    def on_damage(simulation: 'Simulation', event: 'Event'):
        print('\t\tALBEDO ELEM SKILL DAMAGE')
    damage_event.character = character
    damage_event.func = on_damage
    damage_event.desc = 'ALBEDO ELEM SKILL DAMAGE EVENT'
    
    
    return [elem_skill_event, damage_event]
    

def Albedo_ELEM_BURST():
    pass