from typing import TYPE_CHECKING, Dict, Tuple, List, Callable, Any
from core.rules.dnode import DNode
from core.rules.alltypes import BuffType
from core.simulation.constraint import *


class BuffPanel(object):
    def __init__(self):
        '''
        用于构建伤害\n
        储存需要修改伤害树的键和值\n
        包括添加节点和修改节点操作
        '''
        self.add_info: Dict[str, Tuple[str, float]] = {}
        self.change_info: Dict[str, float] = {}

    def add_buff(self, tar_key, name, value):
        self.add_info[tar_key] = (name, value)

    def change_buff(self, key, value):
        self.change_info[key] = value

    @property
    def adds(self) -> List[Tuple[str, DNode]]:
        adds = []
        for key, tup in self.add_info.items():
            n: DNode = DNode(tup[0], '', tup[1])
            adds.append((key, n))
        return adds

    @property
    def changes(self) -> List[Tuple[str, float]]:
        return list(self.change_info.items())


class Buff(BuffPanel):
    def __init__(self, **configs):
        '''
        用于构建buff\n
        对ATTR类型: 储存需要修改属性树的键和值 包括添加节点和修改节点操作\n
        对DMG类型: 储存需要修改伤害树的键和值\n
        对ENEMY类型: 储存需要修改属性树类型的键和值\n
        对INFUSE类型: 储存需要修改的技能和元素类型\n
        对OTHER类型: 暂定\n
        ---
        type: buff类型\n
        name: buff施加者\n
        trigger: (可选)\\
        对DMG类型,参数(time, event)检查对此伤害是否触发;\\
        对ATTR类型,参数(simulation)检查加成数值是否更新,适用于动态buff\n
        constraint: 约束 一般为时间约束\n
        target_path: (可选)\\
        对DMG类型,参数([names])buff作用角色;\\
        对ATTR类型,参数([name, attr])buff作用角色及其值\n
        '''
        super().__init__()
        self.type: BuffType = BuffType(0)
        self.name: str = ''
        self.trigger: Callable[[float, Any], bool] = None
        self.constraint: Constraint = None
        self.target_path: Any = None
        self.initialize(**configs)

    def initialize(self, **configs):
        for k, v in configs.items():
            self.__setattr__(k, v)

    def __eq__(self, other: object) -> bool:
        return self.name == other.name
