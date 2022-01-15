import json
from typing import Dict
from core.entities.character import Character
from core.rules.event import Event


def get_character_albedo(configs: Dict):
    albedo = Character(configs)
    albedo.set_skills({'e': skill1})
    return albedo


def talent1():
    return 0


def skill1(*args):
    e1 = {
        'time': args[0]+0,
        'desc': 'action occur',
        'priority': 1,
        'event_type': 1
    }
    e2 = {
        'time': args[0]+0.1,
        'desc': 'damage occur',
        'priority': 1,
        'event_type': 4
    }
    e3 = {
        'time': args[0]+0.2,
        'desc': 'CD start',
        'priority': 1,
        'event_type': 3
    }
    return [Event(i) for i in (e1, e2, e3)]


def constellation1(): return 0
