

class Operation:
    def __init__(self, time: float, name: str, op: str) -> None:
        self.__source = name
        self.__operation = op
        self.__time = time
        
    @property
    def source(self) -> str:
        return self.__source
    
    @property
    def operation(self) -> str:
        return self.__operation
    
    @property
    def time(self) -> float:
        return self.__time
