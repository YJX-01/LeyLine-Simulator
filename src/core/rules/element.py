from typing import List, Dict, Tuple
from core.rules.alltypes import ElementType
from core.rules.alltypes import ElementalReactionType as rt
from core.simulation.constraint import DurationConstraint


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
    # 8 x 8 matrix
    # first index is first element, second index is second element

    reaction_multiplier: Dict[rt, Tuple[float, bool]] = {
        rt.MELT: (2, True),
        rt.VAPORIZE: (2, True),
        rt.MELT_REVERSE: (1.5, True),
        rt.VAPORIZE_REVERSE: (1.5, True),
        rt.OVERLOADED: (4, False),
        rt.SHATTERED: (3, False),
        rt.ELECTRO_CHARGED: (2.4, False),
        rt.SWIRL: (1.2, False),
        rt.SUPERCONDUCT: (1, False),
        rt.CRYSTALLIZE: (0, False)}
    # reaction multiplier: Dict[react_type, Tuple[mul, amp_flag]]

    __decay_rate = {1: 0.8/9.5, 2: 1.6/12, 4: 3.2/17}

    reaction_modifier: Dict[rt, float] = {
        rt.MELT: 2,
        rt.VAPORIZE: 2,
        rt.MELT_REVERSE: 0.5,
        rt.VAPORIZE_REVERSE: 0.5,
        rt.OVERLOADED: 1,
        rt.SHATTERED: 1,
        rt.ELECTRO_CHARGED: 0.8,
        rt.SWIRL: 0.5,
        rt.SUPERCONDUCT: 1,
        rt.CRYSTALLIZE: 0.5,
        rt.FROZEN: 1}

    def __init__(self):
        self.aura: ElementType = ElementType(0)
        self.aura_gu: float = 0  # dynamic GU decaying with time
        self.aura_type: int = 0  # record init GU

        # coexist aura:
        # forzen/FZ: (HYDRO, CRYO);
        # electro-charged/EC: (HYDRO, ELECTRO);
        self.co_aura: ElementType = ElementType(0)
        self.co_aura_gu: float = 0
        self.co_aura_type: int = 0

        self.frozen_gu: float = 0
        self.frozen_decay_rate: float = 0

        self.clock: float = 0
        self.cd = None

    def insert(self, elem: ElementType, gu: int, time: float = 0) -> rt:
        if elem == ElementType.NONE or elem == ElementType.PHYSICAL:
            return rt.NONE
        
        if not self.aura_gu or elem == self.aura or elem == self.co_aura:
            self.apply(elem, gu, time)
            return rt.NONE
        else:
            react = self.trigger(elem, gu, time)
            return react

    def apply(self, elem: ElementType, gu: int, time: float):
        tax_gu = 0.8*gu
        # same element, merge
        if elem == self.aura and tax_gu > self.aura_gu:
            self.aura_gu = tax_gu
            if self.coexist == 'EC':
                self.aura_type = gu
        elif elem == self.co_aura and tax_gu > self.co_aura_gu:
            self.co_aura_gu = tax_gu
            if self.coexist == 'EC':
                self.co_aura_type = gu
        # no element, apply (not anemo & geo)
        elif elem != ElementType.ANEMO and elem != ElementType.GEO:
            self.aura = elem
            self.aura_gu = tax_gu
            self.aura_type = gu

    def trigger(self, elem: ElementType, gu: int, time: float):
        if self.coexist:
            return rt.NONE
        else:
            react = rt(self.__reaction_matrix[self.aura.value][elem.value])
            mul = self.reaction_modifier[react]
            react_gu = mul*gu
            if react == rt.FROZEN:
                self.frozen_gu = 2*min(self.aura_gu, react_gu)
                self.aura = self.aura if self.aura_gu > react_gu else elem
                self.aura_type = self.aura_type if self.aura_gu > react_gu else gu
                self.aura_gu = abs(self.aura_gu-react_gu)
            elif react == rt.ELECTRO_CHARGED:
                self.co_aura = elem
                self.co_aura_gu = react_gu
                self.co_aura_type = gu
                # self.EC(time)
            else:
                self.aura_gu -= react_gu
                self.refresh()
            return react

    def decay(self, time: float):
        if time > self.clock:
            pass
        self.clock = time

    def refresh(self):
        # clear the empty position
        if self.co_aura_gu <= 0:
            self.co_aura = ElementType(0)
            self.co_aura_gu = 0
            self.co_aura_type = 0
        if self.aura_gu <= 0:
            self.aura = self.co_aura
            self.aura_gu = self.co_aura_gu
            self.aura_type = self.co_aura_type

    @property
    def coexist(self) -> str:
        if self.co_aura_gu and self.aura_gu and \
            (self.aura == ElementType.ELECTRO and self.co_aura == ElementType.HYDRO or
             self.aura == ElementType.HYDRO and self.co_aura == ElementType.ELECTRO):
            return 'EC'
        elif self.frozen_gu:
            return 'FZ'
        else:
            return ''

    @property
    def clean(self) -> bool:
        self.refresh()
        return self.aura_gu == 0
