from typing import List, Tuple
from core.rules.dnode import DNode
from core.entities.panel import EntityPanel, BuffPanel


class AMP_DMG():
    __multipliers = ['Basic Multiplier', 'Bonus Multiplier', 'Critical Multiplier',
                     'Amplifying Multiplier', 'Resistance Multiplier', 'Defence Multiplier']

    def __init__(self):
        self.root: DNode = DNode('Total Damage', '*')
        for m in self.__multipliers:
            self.root.insert(DNode(m, '+'))
        self.m_basic: DNode = self.root.find('Basic Multiplier')
        self.m_bonus: DNode = self.root.find('Bonus Multiplier')
        self.m_critical: DNode = self.root.find('Critical Multiplier')
        self.m_amplifying: DNode = self.root.find('Amplifying Multiplier')
        self.m_resistance: DNode = self.root.find('Resistance Multiplier')
        self.m_defense: DNode = self.root.find('Defence Multiplier')
        self.buildtree()

    def buildtree(self) -> None:
        stat_ability: DNode = self.m_basic.insert(
            DNode('Stats * Ability', '*')
        )
        stat_ability.child.extend([
            DNode('Ability Scaler', '+'),
            DNode('Ability Stat')
        ])
        self.m_bonus.extend([
            DNode('Base', '', 1),
            DNode('Element DMG Bonus', '+'),
            DNode('Elemental Skill Bonus', '+'),
            DNode('Elemental Burst Bonus', '+'),
            DNode('Normal Attack Bonus', '+'),
            DNode('Charged Attack Bonus', '+'),
            DNode('Other Bonus', '+')
        ])
        self.m_critical.insert(DNode('Base', '', 1))
        expect: DNode = self.m_critical.insert(
            DNode('Expectation', 'THRES_E')
        )
        expect.extend([
            DNode('Critical Rate', '+'),
            DNode('Critical DMG', '+')
        ])
        expect.find('Critical Rate').extend([
            DNode('Basic Critical Rate', '%', 5),
            DNode('Bonus Critical Rate', '%', 0)
        ])
        expect.find('Critical DMG').extend([
            DNode('Basic Critical DMG', '%', 50),
            DNode('Bonus Critical DMG', '%', 0)
        ])
        self.m_amplifying.insert(
            DNode('Amplifying Reaction', 'THRES_A')
        ).extend([
            DNode('Reaction Scaler', '+'),
            DNode('Reaction Multiplier', '', 1)
        ])
        react_scaler: DNode = self.m_amplifying.find('Reaction Scaler')
        react_scaler.insert(DNode('Base', '', 1))
        react_scaler.insert(
            DNode('Elemental Mastery', 'EM')
        ).insert(
            DNode('EM', '', 0)
        )
        react_scaler.insert(
            DNode('Reaction Bonus', '+')
        )
        self.m_resistance.insert(
            DNode('Resistance', 'RES'),
        ).extend([
            DNode('Resistance Base', '%', 10),
            DNode('Resistance Debuff', '%', 0)
        ])
        self.m_defense.insert(
            DNode('Defence', 'DEF')
        ).extend([
            DNode('Character Level', '', 1),
            DNode('Enemy Level', '', 1),
            DNode('Defence Ignore', '%', 0),
            DNode('Defence Reduction', '+')
        ])

    def visualize(self) -> None:
        que: List[Tuple[DNode, int]] = []
        que.append((self.root, 0))
        while (que):
            c, n = que.pop(0)
            print('\t'*n+'->', f'[{c.key}][{c.func}][ {c.num} ]')
            if not c.leaf:
                for i in range(len(c.child)):
                    que.insert(i, (c.child[i], n+1))

    def connect(self, *args) -> None:
        for arg in args:
            if isinstance(arg, EntityPanel):
                pass
            elif isinstance(arg, BuffPanel):
                pass
        return

    # TO DO the test function should be deleted
    def test(self):
        self.root.modify('Ability Stat', num=2000)
        self.root.find('Ability Scaler').insert(
            DNode('Basic Ability Scaler', '%', 200))
        self.root.find('Other Bonus').insert(DNode('Bonus1', '%', 60))
        self.root.find('Other Bonus').insert(DNode('Bonus2', '%', 60))
        self.m_bonus.remove('Bonus2')
        self.m_amplifying.modify('EM', num=90)
        self.m_amplifying.modify('Reaction Multiplier', num=1.5)
        self.root()
        self.visualize()

# d = AMP_DMG()
# d.test()