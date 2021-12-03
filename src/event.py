class Event():
    def __init__(self, data: dict = {}) -> None:
        self.__type = data.get('type', '')
        self.__source = data.get('source', '')
        self.__start_time = data.get('start_time', -1)
        self.__duration = data.get('duration', -1)  # dur > 0

    @property
    def start(self):
        return self.__start_time

    @property
    def end(self):
        return self.__start_time + self.__duration

    @start.setter
    def start(self, time):
        self.__start_time = time


class ActionEvent(Event):
    def __init__(self, data: dict) -> None:
        super().__init__(data)


class BuffEvent(Event):
    def __init__(self, data: dict) -> None:
        super().__init__(data)
        self.__target = None
        self.__buff = None


class CDEvent(Event):
    def __init__(self, data: dict) -> None:
        super().__init__(data)


class NumericEvent(Event):
    def __init__(self, data: dict) -> None:
        super().__init__(data)
