import json
from typing import Dict
from core.rules.element import ReactionLogic
from core.rules.alltypes import ElementType


class Enemy(object):
    def __init__(self, **configs):
        self.lv: int = 100
        self.name: str = ''
        self.HP: float = 1e9
        self.RES: Dict[ElementType: int] = {
            ElementType.ANEMO: 10,
            ElementType.GEO: 10,
            ElementType.ELECTRO: 10,
            ElementType.HYDRO: 10,
            ElementType.PYRO: 10,
            ElementType.CRYO: 10,
            ElementType.DENDRO: 10,
            ElementType.PHYSICAL: 10
        }
        self.aura = ReactionLogic()
        self.debuffs = []
        
        self.initialize(**configs)
        
    def initialize(self, **config):
        for k, v  in config.items():
            self.__setattr__(k, v)
