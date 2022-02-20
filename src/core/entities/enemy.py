from typing import Dict
from core.rules.element import ReactionLogic
from core.rules.alltypes import ElementType


class Enemy(object):
    def __init__(self):
        self.lv: int = 90
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
