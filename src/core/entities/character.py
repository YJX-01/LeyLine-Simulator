from enum import Enum

class Character:
    name: str = None
    elemental_type = None  # vision / gnosis
    weapon_type = None
    nationality = None
    rarity: int = None

    HP = 912
    ATK = 18
    DEF = 57
    CRIT_rate = 5
    CRIT_DMG = 50

    def __init__(self) -> None:
        pass

class Nationality(Enum):
    MONDSTADT = 1
    LIYUE = 2
    INAZUMA = 3
    SUMERU = 4
    FONTAINE = 5
    NATLAN = 6
    SNEZHNAYA = 7
    KHAENRIAH = 8