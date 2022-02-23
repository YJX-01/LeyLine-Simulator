from typing import Sequence


class Creation(object):
    def __init__(self) -> None:
        self.type = None
        self.source = None
        self.attr_panel = None
        self.buff_panel = None
        self.start = None
        self.duration = None
        self.exist_num = None
        self.scaler = None
        self.skills = None
        self.buffs = None
        self.mode = None


class TriggerableCreation(Creation):
    def __init__(self) -> None:
        super().__init__()
        self.type = 'triggerable'
        self.trigger_func = None


class IndependentCreation(Creation):
    def __init__(self) -> None:
        super().__init__()
        self.type = 'independent'
        self.selfexcite_func = None


class CreationSpace(object):
    __instance = None

    def __new__(cls, *args, **kwargs):
        if not cls.__instance:
            cls.__instance = object.__new__(cls, *args, **kwargs)
        return cls.__instance

    def __init__(self):
        if hasattr(self, 'creations'):
            return
        self.creations: Sequence[Creation] = []

    def execute(self, simulation, event):
        for creation in self.creations:
            creation(simulation, event)

    def insert(self, creation: Creation):
        n, old_i, old_start = 0, 0, 10000
        for i, c in enumerate(self.creations):
            if isinstance(c, Creation):
                old_i = i if c.start < old_start else old_i
                n += 1
        if n < creation.exist_num:
            self.creations.append(creation)
        elif n == creation.exist_num:
            self.creations[old_i] = creation

    def clear(self):
        self.creations.clear()
