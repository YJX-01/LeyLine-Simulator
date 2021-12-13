from typing import Dict
from core.rules.element import ElementType


class Enemy:
    def __init__(self) -> None:
        self.HP = 100
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
