class Operation:
    def __init__(self, time: float, name: str, op: str) -> None:
        self.source = name
        self.operation = op
        self.time = time
