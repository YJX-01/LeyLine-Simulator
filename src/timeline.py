from .event import *


class TimeLine():
    # one timegrid = 0.1s
    __max_time = 1200

    def __init__(self) -> None:
        self.current_time = 0
        self.lines = []
        self.happening = []

    @property
    def time(self):
        return self.current_time

    def find_happening(self) -> None:
        def f(x): return x.start <= self.current_time and self.current_time < x.end
        self.happening = list(filter(f, self.lines))

    def addOne(self) -> None:
        self.current_time += 1
        self.find_happening()

    def minusOne(self) -> None:
        self.current_time -= 1
        self.find_happening()

    def delAfter(self):
        pass

    def answer(self, requires: list):
        pass

    def __del__(self) -> None:
        self.current_time = 0
        del self.lines
        return
