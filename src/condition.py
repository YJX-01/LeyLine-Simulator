class Condition():
    def __init__(self, name: str, depend: list, func: function = None) -> None:
        self._name = name
        self.dependencies = depend
        self.func = func
        self.response = {}

    def __call__(self, arg: dict = {}) -> bool:
        return self._func(arg) if arg else self._func(self.response)

    def __del__(self) -> None:
        self.dependencies.clear()
        self.response.clear()
        self.func = None
