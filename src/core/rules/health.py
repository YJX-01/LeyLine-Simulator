from copy import deepcopy
from typing import List, Tuple
from core.rules.dnode import DNode
from core.rules.alltypes import HealthType
from core.entities.buff import Buff, BuffPanel
from core.entities.panel import EntityPanel
from core.simulation.event import HealthEvent


class Heal(object):
    def __init__(self):
        self.root: DNode = DNode('Total Health', '*')
        self.init_tree()
        self.depend: str = 'HP'
        self.health_type: HealthType = HealthType(0)
        self.target: List[str] = []

    def init_tree(self):
        self.root.extend([
            DNode('Basic Multiplier', '+').extend([
                DNode('Stats * Ability', '*').extend([
                    DNode('Ability Scaler', '+'),
                    DNode('Ability Stat')
                ]),
                DNode('Ability Flat')
            ]),
            DNode('Bonus Multiplier', '+').extend([
                DNode('Base', '', 1),
                DNode('HEAL_BONUS', '+'),
                DNode('HEAL_INCOME', '+')
            ])
        ])

    def connect(self, *args) -> None:
        '''connect to panel objects, events, and enemy'''
        for arg in args:
            if isinstance(arg, EntityPanel):
                self.to_entity_panel(arg)
            elif isinstance(arg, BuffPanel):
                self.to_buff_panel(arg)
            elif isinstance(arg, HealthEvent):
                self.to_event(arg)

    def to_entity_panel(self, panel: EntityPanel):
        if panel.mode == 'simple':
            self.root.modify('Ability Stat',
                             num=getattr(panel, self.depend).value)

            self.root.find('HEAL_BONUS').insert(
                DNode('Entity HEAL_BONUS', '',
                      getattr(panel, 'HEAL_BONUS').value))

            self.root.find('HEAL_INCOME').insert(
                DNode('Entity HEAL_INCOME', '',
                      getattr(panel, 'HEAL_INCOME').value))
        elif panel.mode == 'complete':
            n: DNode = deepcopy(getattr(panel, self.depend))
            self.root.modify('Ability Stat',
                             func=n.func,
                             child=n.child)

            n = deepcopy(getattr(panel, 'HEAL_BONUS'))
            n.key = 'Entity HEAL_BONUS'
            self.root.find('HEAL_BONUS').insert(n)
            
            n = deepcopy(getattr(panel, 'HEAL_INCOME'))
            n.key = 'Entity HEAL_INCOME'
            self.root.find('HEAL_INCOME').insert(n)

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
            
    def to_event(self, event: 'HealthEvent'):
        self.depend = event.depend
        self.health_type = event.subtype

        self.root.find('Ability Scaler').insert(
            DNode('Basic Ability Scaler', '', event.scaler[0]))
        if len(event.scaler) > 1:
            self.root.modify('Ability Flat', num=event.scaler[1])
        if event.subtype == HealthType.LOSS:
            self.root.remove('Bonus Multiplier')

    @property
    def value(self) -> float:
        return self.root.value
    
    def __repr__(self) -> str:
        return self.root.__repr__()
