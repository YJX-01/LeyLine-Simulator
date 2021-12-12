class Event():
    def __init__(self, data: dict = {}) -> None:
        self.type = data.get('type', '')
        self.source = data.get('source', '')
        self.start = data.get('start', -1)
        self.duration = data.get('duration', -1)  # dur > 0


class ActionEvent(Event):
    def __init__(self, data: dict) -> None:
        super().__init__(data)


class BuffEvent(Event):
    def __init__(self, data: dict) -> None:
        super().__init__(data)
        self.target = None
        self.buff = None


class CDEvent(Event):
    def __init__(self, data: dict) -> None:
        super().__init__(data)


class NumericEvent(Event):
    def __init__(self, data: dict) -> None:
        super().__init__(data)
