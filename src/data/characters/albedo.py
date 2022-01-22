from typing import Callable
from core.entities.character import Character
from core.simulation.event import Event


class Albedo(Character):
    def __init__(self):
        super().__init__()
        self.base.choose('Albedo')
        self.choose_action()

    def choose_action(self):
        self.action.NORMAL_ATK = norm_atk
        self.action.ELEM_SKILL = elem_skill
        self.action.ELEM_BURST = elem_burst
        self.action.PASSIVE = passive
        self.action.CX = cx


def norm_atk():
    return


def elem_skill():
    return


def elem_burst():
    return


def passive():
    return


def cx():
    return


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
