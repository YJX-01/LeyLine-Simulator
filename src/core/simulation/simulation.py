'''
每一次模拟配置生成一个实例
同样的配置项可以多次执行计算(考虑到例如暴击率的效果每次执行的结果是随机的，暴击率也可以设置成折算为期望收益)
'''


from queue import PriorityQueue
from typing import List
from core.entities import Character, Party, Player
from core.rules import Event
from core.simulation import Operation, operation


class Simulation:
    # TODO 这里以后需要记录一下party和player的配置，同时计算下ElementalResonance的状态
    party: Party = None
    players: List[Player] = []
    characters: List[Character] = []

    operation_track: List[Operation] = []  # USER INPUT
    event_queue: PriorityQueue = PriorityQueue()
    records = []  # SIMPLY RECORDS EVENT RESULTS

    def __init__(self) -> None:
        pass

    def set_party(self, characters: List[Character]):
        self.characters = characters

    def set_operation_track(self, input):
        self.operation_track = input

    def start_calculate(self):
        print('CALCULATE START!')
        self.event_queue = PriorityQueue()
        list(map(lambda operation: self.event_queue.put(
            (operation.get_event_priorities(), operation)), self.operation_track))

        while self.event_queue.unfinished_tasks > 0:
            event: Event = self.event_queue.get()[1]
            event.execute(self)
            self.records.append(event.description)
            self.event_queue.task_done()

        print('CALCULATE FINISHED!')
