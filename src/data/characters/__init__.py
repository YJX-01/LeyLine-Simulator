
from typing import Dict, Callable

from core.entities.character import Character
from data.characters.albedo import get_character_albedo
from data.characters.aloy import get_character_aloy

from .albedo import *
from .aloy import *

builders: Dict[str, Callable[[Dict], Character]] = {
    'Albedo': get_character_albedo,
    'Aloy': get_character_aloy,
}

def get_character(configs: Dict):
    return builders[configs['name']](configs)
