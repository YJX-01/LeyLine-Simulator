from copy import deepcopy
from typing import List, Tuple
from core.rules.dnode import DNode
from core.rules.alltypes import DamageType, ElementalReactionType, ElementType
from core.entities.buff import *
from core.entities.enemy import Enemy
from core.entities.panel import EntityPanel
from core.simulation.event import *

class AMP_DMG(object):
    __multipliers = ['Basic Multiplier', 'Bonus Multiplier', 'Critical Multiplier',
                     'Amplifying Multiplier', 'Resistance Multiplier', 'Defence Multiplier']

    def __init__(self):
        self.root: DNode = DNode('Total Damage', '*')
        self.init_tree()
        self.depend: str = 'ATK'
        self.damage_type: DamageType = DamageType(0)
        self.elem_type: ElementType = ElementType(0)
        self.react_type: ElementalReactionType = ElementalReactionType(0)

    def init_tree(self) -> None:
        for m in self.__multipliers:
            self.root.insert(DNode(m, '+'))
        self.root.find('Basic Multiplier').insert(
            DNode('Stats * Ability', '*').extend([
                DNode('Ability Scaler', '+'),
                DNode('Ability Stat')
            ])
        )
        self.root.find('Bonus Multiplier').extend([
            DNode('Base', '', 1),
            DNode('Element DMG Bonus', '+'),
            DNode('Elemental Skill Bonus', '+'),
            DNode('Elemental Burst Bonus', '+'),
            DNode('Normal Attack Bonus', '+'),
            DNode('Charged Attack Bonus', '+'),
            DNode('Other Bonus', '+')
        ])
        self.root.find('Critical Multiplier').extend([
            DNode('Base', '', 1),
            DNode('Expectation', 'THRES_E').extend([
                DNode('Critical Rate', '+').extend([
                    DNode('Basic Critical Rate', '%'),
                    DNode('Bonus Critical Rate', '+')
                ]),
                DNode('Critical DMG', '+').extend([
                    DNode('Basic Critical DMG', '%'),
                    DNode('Bonus Critical DMG', '+')
                ])
            ])
        ])
        self.root.find('Amplifying Multiplier').insert(
            DNode('Amplifying Reaction', 'THRES_A').extend([
                DNode('Reaction Scaler', '+').extend([
                    DNode('Base', '', 1),
                    DNode('Elemental Mastery', 'EM').extend([
                        DNode('EM', '')
                    ]),
                    DNode('Reaction Bonus', '+')
                ]),
                DNode('Reaction Multiplier', '', 1)
            ])
        )
        self.root.find('Resistance Multiplier').insert(
            DNode('Resistance', 'RES').extend([
                DNode('Resistance Base', '%', 10),
                DNode('Resistance Debuff', '%', 0)
            ]),
        )
        self.root.find('Defence Multiplier').insert(
            DNode('Defence', 'DEF').extend([
                DNode('Character Level', '', 1),
                DNode('Enemy Level', '', 1),
                DNode('Defence Ignore'),
                DNode('Defence Reduction', '+')
            ])
        )
        return

    def connect(self, *args) -> None:
        '''connect to panel objects or damage event'''
        for arg in args:
            if isinstance(arg, EntityPanel):
                self.to_entity_panel(arg)
            elif isinstance(arg, BuffPanel):
                self.to_buff_panel(arg)
            elif isinstance(arg, DamageEvent):
                self.to_event(arg)
            elif isinstance(arg, ElementEvent):
                self.to_react(arg)
            elif isinstance(arg, Enemy):
                self.to_enemy(arg)
        return

    def to_entity_panel(self, panel: EntityPanel):
        if panel.mode == 'simple':
            self.root.modify('Ability Stat',
                             num=getattr(panel, self.depend).value)

            v = getattr(panel, self.elem_type.name+'_DMG').value
            self.root.find('Element DMG Bonus').insert(DNode(
                'Entity '+self.elem_type.name+'_DMG', '%', 100*v))

            self.root.modify('Basic Critical Rate',
                             num=100*getattr(panel, 'CRIT_RATE').value)

            self.root.modify('Basic Critical DMG',
                             num=100*getattr(panel, 'CRIT_DMG').value)

            self.root.modify('EM',
                             num=getattr(panel, 'EM').value)
        elif panel.mode == 'complete':
            n: DNode = deepcopy(getattr(panel, self.depend))
            self.root.modify('Ability Stat',
                             func=n.func,
                             child=n.child)

            n = deepcopy(getattr(panel, self.elem_type.name+'_DMG'))
            n.key = 'Entity ' + n.key
            self.root.find('Element DMG Bonus').insert(n)

            n = deepcopy(getattr(panel, 'CRIT_RATE'))
            self.root.modify('Basic Critical Rate',
                             func=n.func,
                             child=n.child)

            n = deepcopy(getattr(panel, 'CRIT_DMG'))
            self.root.modify('Basic Critical DMG',
                             func=n.func,
                             child=n.child)

            n = deepcopy(getattr(panel, 'EM'))
            self.root.modify('EM',
                             func=n.func,
                             child=n.child)

    def to_buff_panel(self, panel: 'BuffPanel'):
        for a in panel.adds:
            try:
                self.root.find(a[0])
            except:
                continue
            else:
                try:
                    self.root.find(a[1].key)
                except:
                    self.root.find(a[0]).insert(a[1])
                else:
                    self.root.modify(a[1].key,
                                     func=a[1].func,
                                     num=a[1].num,
                                     child=a[1].child)
        for c in panel.changes:
            self.root.modify(c[0], num=c[1])

    def to_event(self, event: DamageEvent):
        self.depend = event.depend
        self.damage_type = event.subtype
        self.elem_type = event.elem
        s = event.source
        while(not hasattr(s, 'base')):
            s = s.source
        self.root.modify('Character Level', num=s.base.lv)
        self.root.find('Ability Scaler').insert(
            DNode('Basic Ability Scaler', '', event.scaler))

        remove_map = {
            DamageType.ELEM_SKILL: 'Elemental Skill Bonus',
            DamageType.ELEM_BURST: 'Elemental Burst Bonus',
            DamageType.NORMAL_ATK: 'Normal Attack Bonus',
            DamageType.CHARGED_ATK: 'Charged Attack Bonus'
        }
        remove_map.pop(self.damage_type)
        for v in remove_map.values():
            self.root.remove(v)

    def to_react(self, event: ElementEvent):
        if self.subtype != 'reaction':
            raise TypeError('not a reaction')
        self.root.modify('Reaction Multiplier', num=event.num)

    def to_enemy(self, enemy: Enemy):
        self.root.modify('Enemy Level', num=enemy.lv)
        self.root.modify('Resistance Base',
                         num=enemy.RES[self.elem_type])

    def __repr__(self) -> str:
        result = []
        que: List[Tuple[DNode, int]] = []
        que.append((self.root, 0))
        while (que):
            c, n = que.pop()
            result.append('\t'*n+'->'+f'[{c.key}][{c.func}][ {c.num} ]')
            if not c.leaf:
                que.extend([(c, n+1) for c in reversed(c.child)])
        return '\n'.join(result)

    # TODO the test function should be deleted
    def test(self):
        self.root.modify('Ability Stat', num=2000)
        self.root.find('Ability Scaler').insert(
            DNode('Basic Ability Scaler', '%', 200))
        self.root.find('Other Bonus').insert(DNode('Bonus1', '%', 60))
        self.root.find('Other Bonus').insert(DNode('Bonus2', '%', 60))
        self.root.remove('Bonus2')
        self.root.modify('EM', num=90)
        self.root.modify('Reaction Multiplier', num=1.5)
        self.root()
        print(self)


# from functools import wraps

# from core.simulation.trigger import Trigger
# from .alltypes import *

# # TODO: 考虑附魔 buff 等改变元素类型的情况
# # TODO: 考虑雷神大招 buff 等改变伤害类型的情况
# def damage(
#     simulation=None,
#     time=0.0,
#     elem=ElementType.PHYSICAL,
#     type=DamageType.NONE):
#     '''
#     伤害装饰器。
#     用于在造成伤害时，添加一些通用的逻辑。
#     如，伤害会触发阿贝多的阳华。
#     另外也可以在这里实现元素附着的逻辑。
#     '''
#     def decorate(func):
#         @wraps(func)
#         def wrapper(*args, **kwargs):
#             trigger = Trigger()
#             print(f"\t\tTRIGGER BEFORE DAMAGE [ELEM:{elem}] [TYPE:{type}]")
#             result = func(*args, **kwargs)
#             print(f"\t\tTRIGGER AFTER DAMAGE [ELEM:{elem}] [TYPE:{type}]")
#             trigger.notify('damage_trigger', *args)
#             return result
#         return wrapper
#     return decorate

    