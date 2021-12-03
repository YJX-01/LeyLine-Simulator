class Condition():
    def __init__(self, name: str, depend: list, func: function = None, locked: bool = True) -> None:
        self.__name = name
        self.__locked = locked
        self.__dependencies = depend
        self.__func = func
        self.__response = {}

    @property
    def dependencies(self) -> list:
        return self.__dependencies

    @dependencies.setter
    def dependencies(self, depend):
        if not self.__locked:
            self.__dependencies = depend
    
    @property
    def func(self) -> function:
        return self.__func
    
    @func.setter
    def func(self, f):
        if not self.__locked:
            self.__func = f
    
    @property
    def response(self) -> dict:
        return self.__response

    @response.setter
    def response(self, resp: dict):
        if resp:
            self.__response = resp

    def __call__(self, arg: dict = {}) -> bool:
        return self.__func(arg) if arg else self.__func(self.__response)

    def __del__(self) -> None:
        self.__dependencies.clear()
        self.__response.clear()
        self.__func = None
