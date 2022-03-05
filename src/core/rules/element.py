from typing import List, Dict, Tuple
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
    
    reaction_modifier: Dict[rt, Tuple[float, bool]] = {
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

    def __init__(self):
        self.aura: ElementType = ElementType(0)
        self.aura_gu: float = 0  # dynamic GU decaying with time
        self.aura_type: int = 0  # record init GU

        # coexist aura: forzen: (HYDRO, CRYO); EC: (HYDRO, ELECTRO)
        self.co_aura: ElementType = ElementType(0)
        self.co_aura_gu: float = 0
        self.co_aura_type: int = 0

    def react_to(self, elem: ElementType, gu: int) -> rt:
        if elem == ElementType.NONE:
            return rt.NONE
        else:
            if self.aura != ElementType.NONE:
                return rt(self.__reaction_matrix[self.aura.value][elem.value])
            else:
                self.aura = elem
                return rt.NONE

    def apply(self, elem: ElementType, gu: int):
        pass
    
    def decay(self, interval):
        pass
