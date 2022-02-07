from copy import deepcopy, copy
from typing import TYPE_CHECKING
from core.rules import DNode, PanelType
if TYPE_CHECKING:
    from core.entities import Character


class EntityPanel(object):
    def __init__(self) -> None:
        pass


class BuffPanel(object):
    def __init__(self) -> None:
        pass


class ArtifactPanel(object):
    def __init__(self, character: 'Character') -> None:
        self.ATK: DNode = DNode('Artifact ATK', '+')
        self.DEF: DNode = DNode('Artifact DEF', '+')
        self.HP: DNode = DNode('Artifact HP', '+')
        self.EM = DNode('Artifact EM', '+')
        self.ER = DNode('Artifact ER', '+')
        self.CRIT_RATE = DNode('Artifact CRIT_RATE', '+')
        self.CRIT_DMG = DNode('Artifact CRIT_DMG', '+')
        self.HEAL_BONUS = DNode('Artifact HEAL_BONUS', '+')
        self.ANEMO_DMG = DNode('Artifact ANEMO_DMG', '+')
        self.GEO_DMG = DNode('Artifact GEO_DMG', '+')
        self.ELECTRO_DMG = DNode('Artifact ELECTRO_DMG', '+')
        self.HYDRO_DMG = DNode('Artifact HYDRO_DMG', '+')
        self.PYRO_DMG = DNode('Artifact PYRO_DMG', '+')
        self.CRYO_DMG = DNode('Artifact CRYO_DMG', '+')
        self.DENDRO_DMG = DNode('Artifact DENDRO_DMG', '+')
        self.PHYSICAL_DMG = DNode('Artifact PHYSICAL_DMG', '+')

        self.abstract_panel(character)

    def abstract_panel(self, character: 'Character') -> None:
        for s in ['ATK', 'DEF', 'HP', 'EM', 'ER', 'CRIT_RATE', 'CRIT_DMG', 'HEAL_BONUS',
                  'ANEMO_DMG', 'GEO_DMG', 'ELECTRO_DMG', 'HYDRO_DMG', 'PYRO_DMG', 'CRYO_DMG',
                  'PHYSICAL_DMG']:
            if s in ['ATK', 'DEF', 'HP']:
                base = deepcopy(character.attribute.__dict__[
                    s].find('{} Base'.format(s)))
                per = deepcopy(character.attribute.__dict__[
                    s].find('Artifact Scalers'))
                flat = deepcopy(character.attribute.__dict__[
                    s].find('Artifact Flat'))
                self.__dict__[s].extend([
                    DNode('Scaler', '*').extend([
                        base, per
                    ]),
                    flat
                ])
            else:
                for ele in character.attribute.__dict__[s].child:   
                    for k in ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET']:
                        if k in ele.key:
                            self.__dict__[s].insert(copy(ele))
