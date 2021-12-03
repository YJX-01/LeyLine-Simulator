from .event import *


class TimeLine():
    # one timegrid = 0.1s
    __max_time = 1200

    def __init__(self) -> None:
        self.__current_time = 0
        self.__lines = []
        self.__happening = []

    @property
    def time(self):
        return self.__current_time

    def __find_happening(self) -> None:
        def f(x): return x.start <= self.__current_time and self.__current_time < x.end
        self.__happening = list(filter(f, self.__lines))

    def addOne(self) -> None:
        self.__current_time += 1
        self.__find_happening()

    def minusOne(self) -> None:
        self.__current_time -= 1
        self.__find_happening()

    def delAfter(self):
        pass

    def answer(self, requires: list):
        pass

    def __del__(self) -> None:
        self.__current_time = 0
        del self.__lines
        return
