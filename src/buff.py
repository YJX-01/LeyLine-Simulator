from condition import *

class Bonus():
    def __init__(self, name: str, bonus: dict = {}, condition: Condition = None) -> None:
        self.__name = name
        self.__bonus = bonus  # {target: stat}
        self.__condition = condition
        self.__flag = False

    @property
    def dependencies(self) -> list:
        return self.__condition.dependencies
    
    @property
    def response(self) -> dict:
        return self.__condition.response

    @property
    def active(self) -> bool:
        self.verify()
        return self.__flag

    def verify(self) -> None:
        self.__flag = self.__condition()

    def activate(self) -> dict:
        return self.__bonus if self.__flag else {}

    def __del__(self) -> None:
        self.__bonus.clear()
        del self.__condition


class Effect():
    def __init__(self, name: str, args: list = [], effect: function = None, condition: Condition = None) -> None:
        self.__name = name
        self.__args = args
        self.__effect = effect  # return {target: stat}
        self.__condition = condition
        self.__flag = False

    @property
    def dependencies(self) -> list:
        return self.__condition.dependencies
    
    @property
    def response(self) -> dict:
        return self.__condition.response

    @property
    def active(self) -> bool:
        self.verify()
        return self.__flag

    def verify(self) -> None:
        self.__flag = self.__condition()

    @property
    def args(self) -> list:
        return self.__args

    def activate(self, arg: dict) -> dict:
        return self.__effect(arg) if self.__flag else {}

    def __del__(self) -> None:
        self.__args.clear()
        self.__effect = None
        del self.__condition
