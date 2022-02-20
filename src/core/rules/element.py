from core.rules.alltypes import ElementType, ElementalReactionType


class ReactionLogic(object):
    def __init__(self):
        self.uni_element = ElementType(0)

    def react_to(self, element: ElementType) -> ElementalReactionType:
        if element == ElementType.NONE:
            return ElementalReactionType.NONE
        elif element == ElementType.ANEMO:
            if self.uni_element != ElementType.NONE:
                return ElementalReactionType.SWIRL
            else:
                return ElementalReactionType.NONE
        elif element == ElementType.GEO:
            if self.uni_element != ElementType.NONE:
                return ElementalReactionType.CRYSTALLIZE
            else:
                return ElementalReactionType.NONE
        elif element == ElementType.ELECTRO:
            if self.uni_element == ElementType.NONE:
                self.uni_element = element
                return ElementalReactionType.NONE
            elif self.uni_element == ElementType.HYDRO:
                self.uni_element = ElementType.NONE
                return ElementalReactionType.ELECTRO_CHARGED
            elif self.uni_element == ElementType.PYRO:
                self.uni_element = ElementType.NONE
                return ElementalReactionType.OVERLOADED
            elif self.uni_element == ElementType.CRYO:
                self.uni_element = ElementType.NONE
                return ElementalReactionType.SUPERCONDUCT
        elif element == ElementType.HYDRO:
            if self.uni_element == ElementType.NONE:
                self.uni_element = element
                return ElementalReactionType.NONE
            elif self.uni_element == ElementType.ELECTRO:
                self.uni_element = ElementType.NONE
                return ElementalReactionType.ELECTRO_CHARGED
            elif self.uni_element == ElementType.PYRO:
                self.uni_element = ElementType.NONE
                return ElementalReactionType.VAPORIZE
            elif self.uni_element == ElementType.CRYO:
                self.uni_element = ElementType.NONE
                return ElementalReactionType.FROZEN
        elif element == ElementType.PYRO:
            if self.uni_element == ElementType.NONE:
                self.uni_element = element
                return ElementalReactionType.NONE
            elif self.uni_element == ElementType.ELECTRO:
                self.uni_element = ElementType.NONE
                return ElementalReactionType.OVERLOADED
            elif self.uni_element == ElementType.HYDRO:
                self.uni_element = ElementType.NONE
                return ElementalReactionType.VAPORIZE_REVERSE
            elif self.uni_element == ElementType.CRYO:
                self.uni_element = ElementType.NONE
                return ElementalReactionType.MELT
        elif element == ElementType.CRYO:
            if self.uni_element == ElementType.NONE:
                self.uni_element = element
                return ElementalReactionType.NONE
            elif self.uni_element == ElementType.ELECTRO:
                self.uni_element = ElementType.NONE
                return ElementalReactionType.SUPERCONDUCT
            elif self.uni_element == ElementType.HYDRO:
                self.uni_element = ElementType.NONE
                return ElementalReactionType.FROZEN
            elif self.uni_element == ElementType.PYRO:
                self.uni_element = ElementType.NONE
                return ElementalReactionType.MELT_REVERSE
        elif element == ElementType.DENDRO:
            return ElementalReactionType.NONE
        elif element == ElementType.PHYSICAL:
            return ElementalReactionType.NONE
