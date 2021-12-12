from typing import Dict
from core.entities.character import Character


def get_character_aloy(configs: Dict):
    # TODO 看看这个工厂有没有办法拆成通用的
    aloy = Character(configs)
    return aloy
