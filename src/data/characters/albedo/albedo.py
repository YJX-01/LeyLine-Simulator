import json
from typing import Dict
from core.entities.character import Character


def get_character_albedo(configs: Dict):
    albedo = Character(configs)
    return albedo