from typing import Iterable, List


class DNode(object):
    def __init__(self, key='', func='', num=0) -> None:
        self.key: str = key
        self.func: str = func
        self.num: float = num
        self.leaf: bool = (func == '%' or func == '')
        if not self.leaf:
            self.child: List[object] = []

    def __call__(self) -> float:
        if self.leaf:
            if self.func == '':
                return self.num
            elif self.func == '%':
                return self.num/100
            else:
                raise Exception('constant has not children')
        else:
            if self.func == '*':
                self.num = 1.0
                for c in self.child:
                    self.num *= c()
                return self.num
            elif self.func == '+':
                self.num = 0.0
                for c in self.child:
                    self.num += c()
                return self.num
            elif self.func == 'EM':
                self.num = self.EM(sum([c() for c in self.child]))
                return self.num
            elif self.func == 'RES':
                res = sum([c() for c in self.child])
                self.num = self.RES(res)
                return self.num
            elif self.func == 'DEF':
                lv_char = int(self.find('Character Level')())
                lv_enemy = int(self.find('Enemy Level')())
                def_ig = self.find('Defence Ignore')()
                def_red = self.find('Defence Reduction')()
                self.num = self.DEF(lv_char, lv_enemy, def_red, def_ig)
                return self.num
            elif self.func == 'THRES_E':
                c_rate = self.find('Critical Rate')()
                c_rate = 0 if c_rate < 0 else min(1, c_rate)
                c_dmg = self.find('Critical DMG')()
                self.num = c_rate * c_dmg
                return self.num
            elif self.func == 'THRES_A':
                r = self.find('Reaction Multiplier')()
                self.num = r
                if r > 1:
                    self.num *= self.find('Reaction Scaler')()
                return self.num
            else:
                raise KeyError

    @staticmethod
    def EM(em: float) -> float:
        return 2.78*em/(em+1400)

    @staticmethod
    def RES(res: float) -> float:
        if res < 0:
            return 1-0.5*res
        elif res < 0.75:
            return 1-res
        else:
            return 1/(1+4*res)

    @staticmethod
    def DEF(lv_char: int, lv_enemy: int, def_red: float, def_ig: float) -> float:
        d: float = (100+lv_char)/((100+lv_char) +
                                  (100+lv_enemy)*(1-def_red)*(1-def_ig))
        return d

    def find(self, key: str) -> object:
        if self.key == key:
            return self
        if self.leaf:
            return None
        que = []
        que.extend(self.child)
        while(que):
            c = que.pop(0)
            if c.key == key:
                return c
            elif not c.leaf:
                que.extend(c.child)
        raise Exception('not found')

    def insert(self, node: object) -> object:
        if not self.leaf:
            self.child.append(node)
            return self.find(node.key)
        else:
            raise KeyError

    def extend(self, iterable: Iterable) -> None:
        if not self.leaf:
            self.child.extend(iterable)
        else:
            raise KeyError

    def remove(self, key: str) -> None:
        que = []
        que.append(self)
        while(que):
            p = que.pop(0)
            if not p.leaf:
                for i in range(len(p.child)):
                    if p.child[i].key == key:
                        del p.child[i]
                        return
                que.extend(p.child)

    def modify(self, key: str, **kwargs) -> object:
        obj = self.find(key)
        for k, v in kwargs.items():
            obj.__setattr__(k, v)
        return obj


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
        que = []
        que.append((self.root, 0))
        while (que):
            c, n = que.pop(0)
            print('\t'*n+'->', f'[{c.key}][f={c.func}][ {c.num} ]')
            if not c.leaf:
                for i in range(len(c.child)):
                    que.insert(i, (c.child[i], n+1))

    def connect(self, **kwargs) -> None:
        for k, v in kwargs.items():
            pass
        return
