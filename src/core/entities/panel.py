from copy import deepcopy, copy
from typing import TYPE_CHECKING, Dict, Tuple, List
from core.rules.dnode import DNode
if TYPE_CHECKING:
    from core.entities import Character


class EntityPanel(object):
    def __init__(self, character: 'Character', mode: str = 'simple'):
        '''
        mode = simple | complete
        模式: 简单模式(仅记录数值) 完整模式(记录完整树)
        '''
        self.ATK: DNode = DNode('ATK')
        self.DEF: DNode = DNode('DEF')
        self.HP: DNode = DNode('HP')
        self.EM = DNode('EM')
        self.ER = DNode('ER')
        self.CRIT_RATE = DNode('CRIT_RATE')
        self.CRIT_DMG = DNode('CRIT_DMG')
        self.HEAL_BONUS = DNode('HEAL_BONUS')
        self.HEAL_INCOME = DNode('HEAL_INCOME')
        self.SHIELD_STRENGTH = DNode('SHIELD_STRENGTH')
        self.CD_REDUCTION = DNode('CD_REDUCTION')
        self.ANEMO_DMG = DNode('ANEMO_DMG')
        self.GEO_DMG = DNode('GEO_DMG')
        self.ELECTRO_DMG = DNode('ELECTRO_DMG')
        self.HYDRO_DMG = DNode('HYDRO_DMG')
        self.PYRO_DMG = DNode('PYRO_DMG')
        self.CRYO_DMG = DNode('CRYO_DMG')
        self.DENDRO_DMG = DNode('DENDRO_DMG')
        self.PHYSICAL_DMG = DNode('PHYSICAL_DMG')

        self.mode = mode
        self.abstract_panel(character, self.mode)

    def abstract_panel(self, character: 'Character', mode: str):
        if mode == 'simple':
            for k in self.__dict__.keys():
                if k == 'mode':
                    continue
                n: DNode = getattr(character.attribute, k)
                if n:
                    self.__dict__[k].modify('', num=n.value)
        elif mode == 'complete':
            for k in self.__dict__.keys():
                if k == 'mode':
                    continue
                self.__dict__[k] = deepcopy(getattr(character.attribute, k))
                self.__dict__[k].modify('', key=k)
        else:
            raise NameError('mode name error')


class ArtifactPanel(object):
    def __init__(self, character: 'Character'):
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

    def abstract_panel(self, character: 'Character'):
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
