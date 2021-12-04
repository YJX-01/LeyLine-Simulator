from team import *
from timeline import *
from character import *

from queue import PriorityQueue

class Simulator():
    def __init__(self) -> None:
        self.timeline = TimeLine()
        self.team = Team()
        self.operations = PriorityQueue()

    def simulate(self) -> None:
        if not self.operations.empty():
            operation = self.operations.get()
            operation.execute()




