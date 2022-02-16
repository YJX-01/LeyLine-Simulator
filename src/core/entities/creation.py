class Creation(object):
    def __init__(self) -> None:
        self.type = ''
        self.source = ''
        self.attr_panel = None
        self.buff_panel = None
        self.duration = 0
        self.exist_num = 0
        self.scaler = None
        self.skills = None
        self.buffs = None


class TriggerableCreation(Creation):
    def __init__(self) -> None:
        super().__init__()


class IndependentCreation(Creation):
    def __init__(self) -> None:
        super().__init__()
