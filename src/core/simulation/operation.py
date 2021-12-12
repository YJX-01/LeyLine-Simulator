from typing import TYPE_CHECKING, Dict
from core.rules import Event
if TYPE_CHECKING:
    from core.simulation import Simulation


class Operation(Event):
    time = 0

    character_index = 0
    skill_key = 'normal_ATK_1_hit'

    def __init__(self, configs: Dict) -> None:
        super().__init__()

        # TODO 这块临时写的，最好和Event父类一起整理下构造函数参数
        if 'time' in configs.keys():
            self.time = configs['time']
        if 'character_index' in configs.keys():
            self.character_index = configs['character_index']
        if 'skill_key' in configs.keys():
            self.skill_key = configs['skill_key']

    def execute(self, simulation: 'Simulation'):
        print(
            f'[{self.get_time_str()}s]:[EXECUTE USER OPERATION] {simulation.characters[self.character_index].name} -> {self.skill_key}'
        )

        # TODO 先写死一段操作(事件)触发事件的测试 后续应该放在具体的比如Skill实现内去做
        some_side_effect = Event()
        some_side_effect.time = self.time + 0.2
        simulation.event_queue.put(
            (some_side_effect.get_event_priorities(), some_side_effect)
        )
