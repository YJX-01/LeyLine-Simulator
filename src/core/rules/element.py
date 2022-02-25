from typing import List
from core.rules.alltypes import ElementType
from core.rules.alltypes import ElementalReactionType as rt


class ReactionLogic(object):
    __reaction_matrix: List[List[int]] =\
        [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 10, 20, 0, 34, 35, 36, 37, 0],
        [0, 10, 20, 34, 0, 54, 46, 47, 0],
        [0, 10, 20, 35, 45, 0, 65, 57, 0],
        [0, 10, 20, 36, 46, 56, 0, 67, 0],
        [0, 17, 27, 37, 47, 57, 67, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]
    # 8 x 8 matrix
    # first index is first element, second index is second element

    def __init__(self):
        self.uni_element = ElementType(0)

    def react_to(self, element: ElementType) -> rt:
        if element == ElementType.NONE:
            return rt.NONE
        else:
            if self.uni_element != ElementType.NONE:
                return rt(self.__reaction_matrix[self.uni_element.value][element.value])
            else:
                self.uni_element = element
                return rt.NONE
