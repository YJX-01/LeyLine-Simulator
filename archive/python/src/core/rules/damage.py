import json
from random import random
from copy import deepcopy
from typing import List, Tuple
from core.rules.dnode import DNode
from core.rules.alltypes import DamageType, ElementalReactionType, ElementType
from core.entities.buff import Buff, BuffPanel
from core.entities.enemy import Enemy
from core.entities.panel import EntityPanel
from core.simulation.event import DamageEvent, ElementEvent


class AMP_DMG(object):
    __multipliers = ['Basic Multiplier', 'Bonus Multiplier', 'Critical Multiplier',
                     'Amplifying Multiplier', 'Resistance Multiplier', 'Defence Multiplier']

    def __init__(self):
        self.root: DNode = DNode('Total Damage', '*')
        self.init_tree()
        self.depend: str = 'ATK'
        self.damage_type: DamageType = DamageType.NONE
        self.elem_type: ElementType = ElementType.NONE

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
            DNode('Plunging Attack Bonus', '+'),
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
        '''connect to panel objects, events, and enemy'''
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
                father = self.root.find(a[0])
            except:
                pass
            else:
                try:
                    child = self.root.find(a[1].key)
                except:
                    father.insert(a[1])
                else:
                    child.modify(func=a[1].func, num=a[1].num)
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
            DamageType.CHARGED_ATK: 'Charged Attack Bonus',
            DamageType.PLUNGING_ATK: 'Plunging Attack Bonus'
        }
        remove_map.pop(self.damage_type)
        for v in remove_map.values():
            self.root.remove(v)

        if event.mode == '$':
            cr = max(s.attribute.CRIT_RATE.value, 0)
            if random() < cr:
                self.root.find('Bonus Critical Rate').insert(
                    DNode('Actual Simulation Result', '', 1))
            else:
                self.root.find('Bonus Critical Rate').insert(
                    DNode('Actual Simulation Result', '', -10))
        elif event.mode == '!':
            self.root.find('Bonus Critical Rate').insert(
                DNode('Force Crit', '', 1))
        elif event.mode == '?':
            self.root.find('Bonus Critical Rate').insert(
                DNode('Force non-Crit', '', -10))

    def to_react(self, event: ElementEvent):
        if self.subtype != 'reaction':
            raise TypeError('not a reaction')
        self.root.modify('Reaction Multiplier', num=event.num)

    def to_enemy(self, enemy: Enemy):
        self.root.modify('Enemy Level', num=enemy.lv)
        self.root.modify('Resistance Base',
                         num=enemy.RES[self.elem_type])

    @property
    def value(self) -> float:
        return self.root.value

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


class TRANS_DMG(object):
    with open('docs\constant\ReactionLevelMultiplier.json', 'r') as f:
        reaction_info = json.load(f)

    def __init__(self):
        self.root: DNode = DNode('Total Damage', '*')
        self.init_tree()
        self.damage_type: DamageType = DamageType.NONE
        self.elem_type: ElementType = ElementType.NONE
        self.react_type: ElementalReactionType = ElementalReactionType.NONE

    def init_tree(self):
        self.root.extend([
            DNode('Level Multiplier'),
            DNode('Reaction Multiplier'),
            DNode('Reaction Scaler', '+').extend([
                DNode('Base', '', 1),
                DNode('Elemental Mastery', 'EM_T').extend([
                    DNode('EM', '')
                ]),
                DNode('Reaction Bonus', '+')
            ]),
            DNode('Resistance Multiplier', 'RES').extend([
                DNode('Resistance Base', '%', 10),
                DNode('Resistance Debuff', '%', 0)
            ]),
        ])

    def connect(self, *args) -> None:
        '''connect to panel objects, events, and enemy'''
        for arg in args:
            if isinstance(arg, BuffPanel):
                self.to_buff_panel(arg)
            elif isinstance(arg, ElementEvent):
                self.to_react(arg)
            elif isinstance(arg, Enemy):
                self.to_enemy(arg)

    def to_buff_panel(self, panel: 'BuffPanel'):
        for a in panel.adds:
            try:
                father = self.root.find(a[0])
            except:
                pass
            else:
                try:
                    child = self.root.find(a[1].key)
                except:
                    father.insert(a[1])
                else:
                    child.modify(func=a[1].func, num=a[1].num)
        for c in panel.changes:
            self.root.modify(c[0], num=c[1])

    def to_react(self, event: ElementEvent):
        if event.subtype != 'reaction':
            raise TypeError('not a reaction')
        self.elem_type = event.elem
        self.react_type = event.react
        self.root.modify('Reaction Multiplier', num=event.num)
        lv = event.info.get('lv')
        em = event.info.get('em')
        self.root.modify('Level Multiplier',
                         num=self.reaction_info['player'][lv])
        self.root.modify('EM',
                         num=em)

    def to_enemy(self, enemy: Enemy):
        self.root.modify('Resistance Base',
                         num=enemy.RES[self.elem_type])

    @property
    def value(self) -> float:
        return self.root.value
