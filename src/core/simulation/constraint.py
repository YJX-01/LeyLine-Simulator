from typing import Callable, Any


class Constraint(object):
    def __init__(self, func: Callable = None):
        self.func: Callable = func


class ConstraintFlag(Constraint):
    def __init__(self, func: Callable = None):
        super().__init__(func)

    def __call__(self, *args: Any) -> bool:
        return self.func(*args) if self.func else False


class ConstraintCounter(Constraint):
    def __init__(self, func: Callable = None):
        super().__init__(func)

    def __call__(self, *args: Any) -> float:
        return self.func(*args) if self.func else 0


class ConstraintCooldown(Constraint):
    def __init__(self, func: Callable = None):
        super().__init__(func)

    def __call__(self, *args: Any) -> float:
        return self.func(*args) if self.func else 0


class ConstraintDuration(Constraint):
    def __init__(self, func: Callable = None):
        super().__init__(func)

    def __call__(self, *args: Any) -> float:
        return self.func(*args) if self.func else 0
