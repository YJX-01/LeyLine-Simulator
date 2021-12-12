from typing import Dict
from core.entities.character import Character


def get_character_aloy(configs: Dict):
    aloy = Character(configs)
    return aloy
