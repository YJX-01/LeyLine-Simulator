from math import sqrt
from typing import List, Dict, Tuple, Any
from core.rules.alltypes import ElementType
from core.rules.alltypes import ElementalReactionType as rt


class ElemSys(object):
    __reaction_matrix: List[List[int]] = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 10, 20, 0, 34, 35, 36, 37, 0],
        [0, 10, 20, 34, 0, 54, 46, 47, 0],
        [0, 10, 20, 35, 45, 0, 65, 57, 0],
        [0, 10, 20, 36, 46, 56, 0, 67, 0],
        [0, 17, 27, 37, 47, 57, 67, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0]]
    # 8 x 8 matrix, first index is trigger element, second index is aura element
    # m[aura][trigger] = rt

    reaction_multiplier: Dict[rt, Tuple[float, ElementType]] = {
        rt.MELT: (2, ElementType.PYRO),
        rt.VAPORIZE: (2, ElementType.HYDRO),
        rt.MELT_REVERSE: (1.5, ElementType.CRYO),
        rt.VAPORIZE_REVERSE: (1.5, ElementType.PYRO),
        rt.OVERLOADED: (4, ElementType.PYRO),
        rt.SHATTERED: (3, ElementType.PHYSICAL),
        rt.ELECTRO_CHARGED: (2.4, ElementType.ELECTRO),
        rt.SWIRL: (1.2, ElementType.NONE),
        rt.SUPERCONDUCT: (1, ElementType.CRYO),
        rt.CRYSTALLIZE: (0, ElementType.NONE)}
    # reaction multiplier: Dict[react_type, Tuple[mul, dmg_elem]]

    __decay_rate = {1: 0.8/9.5, 2: 1.6/12, 4: 3.2/17, 0: 0}

    reaction_modifier: Dict[rt, float] = {
        rt.MELT: 2,
        rt.VAPORIZE: 2,
        rt.MELT_REVERSE: 0.5,
        rt.VAPORIZE_REVERSE: 0.5,
        rt.OVERLOADED: 1,
        rt.SUPERCONDUCT: 1,
        rt.SWIRL: 0.5,
        rt.CRYSTALLIZE: 0.5}

    def __init__(self):
        '''
        aura_elem: ElementType
        aura_gu: Gauge Unit (decay with time)
        aura_type: record init GU
        ---
        - when EC: coexist=HYDRO, aura=ELECTRO\n
        - when FZ: coexist=CRYO, aura=HYDRO/CRYO\n
        co_elem: ElementType
        co_gu: Gauge Unit (decay with time)
        co_type: record init GU\n
        frozen_decay_rate: a dynamic decay rate
        '''
        self.aura_elem: ElementType = ElementType.NONE
        self.aura_gu: float = 0
        self.aura_type: int = 0

        self.co_elem: ElementType = ElementType.NONE
        self.co_gu: float = 0
        self.co_type: int = 0
        self.frozen_decay_rate: float = 0

        self.clock: float = 0
        self.last_ec: float = 1000
        self.output: List[Tuple[float, rt, Dict]] = []
        self.log = []

        self.em: float = 0
        self.lv: int = 0
        self.name: str = ''

    @property
    def clean(self) -> bool:
        return self.aura_elem == ElementType.NONE and self.co_elem == ElementType.NONE

    def input(self, in_elem: ElementType, in_gu: int, time: float, **kwargs):
        '''
        Input:
        in_elem: ElementType
        in_gu: int
        time: float
        ---
        kwargs:
        em: float / Elemental Mastery
        lv: int / Level of the charater
        name: str / The charater who apply the element
        blunt: bool / whether it is blunt attack
        '''
        self.output.clear()
        self.decay(time)
        if in_elem == ElementType.NONE or in_elem == ElementType.PHYSICAL:
            return self.output
        if self.clean:
            self.apply(in_elem, in_gu)
        elif self.elem_exist(in_elem):
            self.add(in_elem, in_gu, **kwargs)
        else:
            self.react(in_elem, in_gu, **kwargs)
        return self.output

    def decay(self, time: float):
        if self.clean or self.clock == time:
            self.clock = time
            return
        while self.electro_charged_tick(time):
            pass
        self.decay_linear(time, co=False)
        if self.co_elem == ElementType.HYDRO:
            self.decay_linear(time, co=True)
        self.decay_with_frozen(time)

    def add(self, in_elem: ElementType, in_gu: int, **kwargs):
        if self.co_elem == ElementType.HYDRO:
            # EC's EM and decay rate depend on the last applier
            if in_elem == ElementType.HYDRO:
                self.co_gu = max(self.co_gu, 0.8*in_gu)
                self.co_type = in_gu
            else:
                self.aura_gu = max(self.aura_gu, 0.8*in_gu)
                self.aura_type = in_gu
            self.em = kwargs.get('em', 0)
            self.lv = kwargs.get('lv', 0)
            self.name = kwargs.get('name', '')
        else:
            self.aura_gu = max(self.aura_gu, 0.8*in_gu)

    def apply(self, in_elem: ElementType, in_gu: int):
        if in_elem == ElementType.ANEMO or in_elem == ElementType.GEO:
            return
        self.aura_elem = in_elem
        self.aura_gu = 0.8*in_gu
        self.aura_type = in_gu

    def react(self, in_elem: ElementType, in_gu: int, **kwargs):
        rt_index = self.__reaction_matrix[self.aura_elem.value][in_elem.value]
        reaction_type = rt(rt_index)
        modifier = self.reaction_modifier.get(reaction_type, 0)
        equal_gu = in_gu * modifier
        if self.co_elem == ElementType.HYDRO:
            if in_elem == ElementType.GEO:
                self.aura_gu = max(0, self.aura_gu-equal_gu)
                self.output.append((
                    self.clock, rt.CRYSTALLIZE, dict(**kwargs, elem=self.aura_elem)))
                self.remove(co=False)
            if in_elem == ElementType.ANEMO:
                self.aura_gu = max(0, self.aura_gu-equal_gu)
                self.output.append((
                    self.clock, rt.SWIRL, dict(**kwargs, elem=self.aura_elem)))
                if equal_gu > self.aura_gu:
                    self.co_gu = max(0, self.co_gu+self.aura_gu-equal_gu)
                    self.output.append((
                        self.clock, rt.SWIRL, dict(**kwargs, elem=self.co_elem)))
                    self.switch_aura(dir=False)
                    self.remove(co=True, judge=False)
                self.remove(co=False)
            if in_elem == ElementType.PYRO:
                self.aura_gu = max(0, self.aura_gu-equal_gu)
                self.output.append((
                    self.clock, rt.OVERLOADED, kwargs))
                if equal_gu > self.aura_gu:
                    self.co_gu = max(0, self.co_gu+self.aura_gu-equal_gu)
                    self.output.append((
                        self.clock, rt.VAPORIZE_REVERSE, kwargs))
                    self.switch_aura(dir=False)
                    self.remove(co=True, judge=False)
                self.remove(co=False)
            if in_elem == ElementType.CRYO:
                self.aura_gu = max(0, self.aura_gu-equal_gu)
                self.remove(co=False)
                if equal_gu > self.aura_gu:
                    self.output.append((
                        self.clock, rt.SUPERCONDUCT, dict(**kwargs, dmg=False)))
                    self.switch_aura(dir=False)
                    self.remove(co=True, judge=False)
                    frozen_gu = 2*min(self.aura_gu, in_gu)
                    self.aura_gu = max(0, self.aura_gu-in_gu)
                    self.remove(co=False)
                    self.co_elem = ElementType.CRYO
                    self.co_gu = frozen_gu
                    self.output.append((
                        self.clock, rt.FROZEN, kwargs))
                else:
                    self.output.append((
                        self.clock, rt.SUPERCONDUCT, dict(**kwargs, dmg=True)))
        elif self.co_elem == ElementType.CRYO:
            if kwargs.get('blunt', False):
                self.shattered(kwargs)
            if in_elem == ElementType.GEO:
                self.shattered(kwargs)
                if self.aura_elem != ElementType.NONE:
                    self.aura_gu = max(0, self.aura_gu-equal_gu)
                    self.output.append((
                        self.clock, rt.CRYSTALLIZE, dict(**kwargs, elem=self.aura_elem)))
                    self.remove(co=False)
            if in_elem == ElementType.ANEMO:
                if self.aura_elem == ElementType.NONE:
                    self.co_gu = max(0, self.co_gu-equal_gu)
                    self.output.append((
                        self.clock, rt.SWIRL, dict(**kwargs, elem=self.co_elem)))
                    self.remove(co=True)
                elif self.aura_elem == ElementType.CRYO:
                    if equal_gu > self.aura_gu:
                        self.co_gu = max(0, self.co_gu+self.aura_gu-equal_gu)
                    self.aura_gu = max(0, self.aura_gu-equal_gu)
                    self.output.append((
                        self.clock, rt.SWIRL, dict(**kwargs, elem=self.aura_elem)))
                    self.remove(co=True)
                    self.remove(co=False)
                elif self.aura_elem == ElementType.HYDRO:
                    if equal_gu > self.aura_gu:
                        self.co_gu = max(0, self.co_gu+self.aura_gu-equal_gu)
                        self.output.append((
                            self.clock, rt.SWIRL, dict(**kwargs, elem=self.co_elem)))
                    self.aura_gu = max(0, self.aura_gu-equal_gu)
                    self.output.append((
                        self.clock, rt.SWIRL, dict(**kwargs, elem=self.aura_elem)))
                    self.remove(co=True)
                    self.remove(co=False)
            if in_elem == ElementType.PYRO:
                if self.co_gu:
                    reaction_type = rt.MELT
                elif self.aura_elem == ElementType.HYDRO:
                    self.aura_gu = max(0, self.aura_gu-equal_gu)
                    self.remove(co=False)
                    self.output.append((
                        self.clock, rt.VAPORIZE_REVERSE, kwargs))
            if reaction_type == rt.MELT:
                if equal_gu > self.aura_gu:
                    if self.aura_elem == ElementType.HYDRO:
                        self.co_gu = max(0, self.co_gu-equal_gu)
                    else:
                        self.co_gu = max(0, self.co_gu+self.aura_gu-equal_gu)
                    self.remove(co=True)
                if self.aura_elem == ElementType.CRYO:
                    self.aura_gu = max(0, self.aura_gu-equal_gu)
                    self.remove(co=False)
                self.output.append((
                    self.clock, reaction_type, kwargs))
            if in_elem == ElementType.ELECTRO:
                if self.co_gu:
                    reaction_type = rt.SUPERCONDUCT
                else:
                    # not case for this scenario, but may add in future
                    pass
            if reaction_type == rt.SUPERCONDUCT:
                if equal_gu > self.aura_gu:
                    if self.aura_elem == ElementType.HYDRO:
                        self.co_gu = max(0, self.co_gu-equal_gu)
                    else:
                        self.co_gu = max(0, self.co_gu+self.aura_gu-equal_gu)
                    self.remove(co=True)
                if self.aura_elem == ElementType.CRYO:
                    self.aura_gu = max(0, self.aura_gu-equal_gu)
                    self.remove(co=False)
                self.output.append((
                    self.clock, reaction_type, dict(**kwargs, dmg=True)))
            if (in_elem == ElementType.HYDRO or in_elem == ElementType.CRYO):
                # when FZ, apply HYDRO or CRYO will process in this part
                if self.aura_elem == ElementType.NONE:
                    self.apply(in_elem, in_gu)
                else:
                    frozen_gu = 2*min(self.aura_gu, in_gu)
                    self.aura_gu = max(0, self.aura_gu-in_gu)
                    self.remove(co=False)
                    self.co_gu = max(self.co_gu, frozen_gu)
                    self.output.append((
                        self.clock, rt.FROZEN, kwargs))
        elif self.co_elem == ElementType.NONE:
            if reaction_type == rt.ELECTRO_CHARGED:
                if self.aura_elem == ElementType.HYDRO:
                    self.switch_aura(dir=True)
                    self.apply(in_elem, in_gu)
                elif self.aura_elem == ElementType.ELECTRO:
                    self.co_elem = in_elem
                    self.co_gu = 0.8*in_gu
                    self.co_type = in_gu
                self.electro_charged_tick(self.clock)
            elif reaction_type == rt.FROZEN:
                frozen_gu = 2*min(self.aura_gu, in_gu)
                self.aura_gu = max(0, self.aura_gu-in_gu)
                self.remove(co=False)
                self.co_elem = ElementType.CRYO
                self.co_gu = frozen_gu
                self.output.append((
                    self.clock, reaction_type, kwargs))
            elif reaction_type == rt.SWIRL or reaction_type == rt.CRYSTALLIZE:
                self.aura_gu = max(0, self.aura_gu-equal_gu)
                self.output.append((
                    self.clock, reaction_type, dict(**kwargs, elem=self.aura_elem)))
                self.remove(co=False)
            else:
                self.aura_gu = max(0, self.aura_gu-equal_gu)
                self.remove(co=False)
                self.output.append((
                    self.clock, reaction_type, kwargs))

    def electro_charged_tick(self, time: float) -> bool:
        flag = False
        if ((time >= self.last_ec+1 or self.last_ec == 1000) and self.co_elem == ElementType.HYDRO):
            t = self.last_ec+1 if self.last_ec <= self.clock <= self.last_ec+1 else self.clock
            v_e = self.__decay_rate[self.aura_type]
            v_h = self.__decay_rate[self.co_type]
            self.decay_linear(t, co=False)
            self.decay_linear(t, co=True)
            self.clock = t
            if (self.aura_gu / v_e > 0.5 and self.co_gu / v_h > 0.5):
                self.aura_gu = max(0, self.aura_gu - 0.4)
                self.remove(co=False)
                self.co_gu = max(0, self.co_gu - 0.4)
                self.remove(co=True)
                self.last_ec = self.clock
                self.output.append((
                    self.last_ec, rt.ELECTRO_CHARGED, dict(em=self.em, lv=self.lv, name=self.name)))
                flag = True
            if (self.aura_gu == 0):
                self.switch_aura(dir=False)
                self.remove(co=True, judge=False)
            self.remove(co=True)
        return flag

    def elem_exist(self, elem: ElementType) -> bool:
        if self.co_elem == ElementType.HYDRO:
            return self.aura_elem == elem or self.co_elem == elem
        else:
            return self.aura_elem == elem

    def decay_linear(self, time: float, co: bool = False):
        if co:
            v = self.__decay_rate[self.co_type]
            self.co_gu = max(0, self.co_gu-v*(time-self.clock))
            self.remove(co)
        else:
            v = self.__decay_rate[self.aura_type]
            self.aura_gu = max(0, self.aura_gu-v*(time-self.clock))
            self.remove(co)

    def decay_with_frozen(self, time: float):
        v = self.frozen_decay_rate
        if self.co_elem == ElementType.CRYO:
            v_ = v + 0.1 * (time - self.clock)
            if (self.co_gu > (v_**2-v**2)/(2*0.1)):
                self.co_gu -= (v_**2-v**2)/(2*0.1)
                self.frozen_decay_rate = v_
            else:
                self.remove(co=True, judge=False)
                t = 10*(sqrt(0.2*self.co_gu+v**2)-v)
                # cancel frozen at self.clock+t
                self.frozen_decay_rate = max(
                    0.4, v+0.1*t-0.2*(time-self.clock-t))
        else:
            self.frozen_decay_rate = max(0.4, v-0.2*(time-self.clock))
        self.clock = time

    def remove(self, co: bool, judge: bool = True):
        if co:
            if (judge and self.co_gu > 0):
                return
            self.co_elem = ElementType.NONE
            self.co_gu = 0
            self.co_type = 0
        else:
            if (judge and self.aura_gu > 0):
                return
            self.aura_elem = ElementType.NONE
            self.aura_gu = 0
            self.aura_type = 0

    def switch_aura(self, dir: bool):
        '''dir=True: aura copy to coexist\ndir=False: coexist copy to aura'''
        if dir:
            self.co_elem = self.aura_elem
            self.co_gu = self.aura_gu
            self.co_type = self.aura_type
        else:
            self.aura_elem = self.co_elem
            self.aura_gu = self.co_gu
            self.aura_type = self.co_type

    def shattered(self, kwargs: Dict[str, Any]):
        self.output.append((
            self.clock, rt.SHATTERED, kwargs))
        self.co_gu = 0
        self.remove(co=True)

    @property
    def element_now(self) -> List[Tuple[str, float]]:
        aura_list = []
        aura_list.append((self.aura_elem.name, self.aura_gu))
        if self.co_elem == ElementType.HYDRO:
            aura_list.append((self.co_elem.name, self.co_gu))
        elif self.co_elem == ElementType.CRYO:
            aura_list.append(('FROZEN', self.co_gu))
        return aura_list
