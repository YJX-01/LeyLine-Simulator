from typing import TYPE_CHECKING, Iterable, List


class DNode:
    def __init__(self, key='', func='', num=0):
        self.key: str = key
        self.func: str = func
        self.num: float = num
        self.leaf: bool = (func == '%' or func == '')
        if not self.leaf:
            self.child: List[DNode] = []

    def __call__(self) -> float:
        self.leaf: bool = (self.func == '%' or self.func == '')
        if self.leaf:
            if self.func == '':
                return self.num
            elif self.func == '%':
                return self.num/100
            else:
                raise Exception('constant has not children')
        else:
            if self.func == '*':
                self.num = 1
                for c in self.child:
                    self.num *= c()
                return self.num
            elif self.func == '+':
                self.num = 0
                for c in self.child:
                    self.num += c()
                return self.num
            elif self.func == 'EM':
                self.num = self.EM(sum([c() for c in self.child]))
                return self.num
            elif self.func == 'RES':
                self.num = self.RES(sum([c() for c in self.child]))
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

    def __eq__(self, __o: object) -> bool:
        return self.key == __o.key
    
    def __float__(self):
        return self()
    
    @property
    def value(self):
        self()
        return self.num

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

    def find(self, key: str) -> 'DNode':
        if self.key == key:
            return self
        elif self.leaf:
            raise Exception('not found')
        que: List[DNode] = []
        que.extend(self.child)
        while(que):
            c = que.pop(0)
            if c.key == key:
                return c
            elif not c.leaf:
                que.extend(c.child)
        raise Exception('not found')

    def insert(self, node: 'DNode') -> 'DNode':
        if not self.leaf:
            self.child.append(node)
            return self.find(node.key)
        else:
            raise KeyError

    def extend(self, iterable: Iterable) -> 'DNode':
        if not self.leaf:
            self.child.extend(iterable)
            return self
        else:
            raise KeyError

    def remove(self, key: str) -> None:
        que: List[DNode] = []
        que.append(self)
        while(que):
            p = que.pop(0)
            if not p.leaf:
                for i, c in enumerate(p.child):
                    if c.key == key:
                        del p.child[i]
                        return
                que.extend(p.child)

    def modify(self, key: str, **kwargs) -> 'DNode':
        if key:
            obj = self.find(key)
        else:
            obj = self
        for k, v in kwargs.items():
            obj.__setattr__(k, v)
        return obj
