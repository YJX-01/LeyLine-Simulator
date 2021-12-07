from operation import Operation
# from team import *
# from timeline import *
# from character import *

from queue import PriorityQueue, Queue

class Simulator():
    def __init__(self) -> None:
        # self.timeline = TimeLine()
        # self.team = Team()
        self.operations: Operation = Queue()
        
    def sample(self) -> None:
        self.operations.put(Operation(1.0, "Albedo", "E"))

    def simulate(self) -> None:
        if not self.operations.empty():
            operation: Operation = self.operations.get()
            print(operation.source + " " + operation.operation + " " + str(operation.time))
            


simulator = Simulator()
simulator.sample()
simulator.simulate()

