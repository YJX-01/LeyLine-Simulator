from typing import List


class Creation(object):
    def __init__(self, **configs) -> None:
        self.type: str = ''
        self.name: str = ''
        self.source: object = None
        self.sourcename: str = ''
        self.attr_panel = None
        self.buff_panel = None
        self.start: float = 0
        self.duration: float = 0
        self.exist_num: int = 0
        self.scaler = None
        self.skills = None
        self.buffs = None
        self.mode = None
        self.initialize(**configs)

    def initialize(self, **configs):
        for k, v in configs.items():
            self.__setattr__(k, v)

    @property
    def end(self) -> float:
        return self.start+self.duration


class TriggerableCreation(Creation):
    def __init__(self, **configs) -> None:
        super().__init__(type='triggerable')
        self.trigger_func = None
        self.stack = None
        self.initialize(**configs)


class IndependentCreation(Creation):
    def __init__(self, **configs) -> None:
        super().__init__(type='independent')
        self.selfexcite_func = None
        self.initialize(**configs)


class CreationSpace(object):
    __instance = None

    def __new__(cls, *args, **kwargs):
        if not cls.__instance:
            cls.__instance = object.__new__(cls, *args, **kwargs)
        return cls.__instance

    def __init__(self):
        if hasattr(self, 'creations'):
            return
        self.creations: List[Creation] = []

    def execute(self, simulation, event):
        for creation in self.creations:
            if event.time > creation.end:
                continue
            creation(simulation, event)

    def insert(self, creation: 'Creation'):
        n, old_i, old_start = 0, 0, 10000
        for i, c in enumerate(self.creations):
            if c.name == creation.name:
                old_i = i if c.start < old_start else old_i
                n += 1
        if n < creation.exist_num:
            self.creations.append(creation)
        elif n == creation.exist_num:
            self.creations[old_i] = creation

    def clear(self):
        self.creations.clear()
