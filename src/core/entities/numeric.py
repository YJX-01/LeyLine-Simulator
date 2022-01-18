from typing import List, Tuple
from core.rules.dnode import DNode
from core.entities.panel import EntityPanel, BuffPanel


class AMP_DMG():
    __multipliers = ['Basic Multiplier', 'Bonus Multiplier', 'Critical Multiplier',
                     'Amplifying Multiplier', 'Resistance Multiplier', 'Defence Multiplier']

    def __init__(self):
        self.root: DNode = DNode('Total Damage', '*')
        self.init_tree()

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
                    DNode('Basic Critical Rate', '%', 5),
                    DNode('Bonus Critical Rate', '%', 0)
                ]),
                DNode('Critical DMG', '+').extend([
                    DNode('Basic Critical DMG', '%', 50),
                    DNode('Bonus Critical DMG', '%', 0)
                ])
            ])
        ])
        self.root.find('Amplifying Multiplier').insert(
            DNode('Amplifying Reaction', 'THRES_A').extend([
                DNode('Reaction Scaler', '+').extend([
                    DNode('Base', '', 1),
                    DNode('Elemental Mastery', 'EM').extend([
                        DNode('EM', '', 0)
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
                DNode('Defence Ignore', '%', 0),
                DNode('Defence Reduction', '+')
            ])
        )
        return

    def visualize(self) -> None:
        que: List[Tuple[DNode, int]] = []
        que.append((self.root, 0))
        while (que):
            c, n = que.pop()
            print('\t'*n+'->', f'[{c.key}][{c.func}][ {c.num} ]')
            if not c.leaf:
                que.extend([(c, n+1) for c in reversed(c.child)])

    def connect(self, *args) -> None:
        for arg in args:
            if isinstance(arg, EntityPanel):
                pass
            elif isinstance(arg, BuffPanel):
                pass
        return

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
        self.visualize()


d = AMP_DMG()
d.test()
