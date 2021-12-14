from typing import TYPE_CHECKING, Dict, List
from core.rules import Event
if TYPE_CHECKING:
    from core.simulation import Simulation


class Operation(Event):
    __default = {
        'time': 0,
        'desc': '',
        'priority': 999,
        'event_type': 0,
        'character_index': 0,
        'command': ''
    }

    def __init__(self, configs: Dict = __default) -> None:
        super().__init__(configs)

        # TODO 这块临时写的，最好和Event父类一起整理下构造函数参数
        # REPLY: operation 是需要处理的event， event本身不经过处理，仅用作记录和参考，
        # 例如放Q要参考CD event，计算伤害要参考加伤event

        # if 'time' in configs.keys():
        #     self.time = configs['time']
        # if 'character_index' in configs.keys():
        #     self.character_index = configs['character_index']
        # if 'skill_key' in configs.keys():
        #     self.skill_key = configs['skill_key']

        self.character_index = configs.get('character_index', 0)
        self.command = configs.get('command', None)

    def execute(self, simulation: 'Simulation'):
        print(
            f'[{self.get_time_str()}s]:[EXECUTE USER OPERATION] {simulation.characters[self.character_index].name} -> {self.command}'
        )

        # TODO 先写死一段操作(事件)触发事件的测试 后续应该放在具体的比如Skill实现内去做

        # some_side_effect = Event()
        # some_side_effect.time = self.time + 0.2
        # simulation.event_queue.put(
        #     (some_side_effect.get_event_priorities(), some_side_effect)
        # )

        # 试着写一下
        source = simulation.characters[self.character_index]
        events: List[Event] = source(self.command, simulation.reference(), {'time': self.time})
        for event in events:
            simulation.event_queue.put(
                (event.get_event_priorities(), event)
            )
