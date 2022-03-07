from typing import Dict, Tuple, List, Callable, Any
from collections import OrderedDict
from core.rules.dnode import DNode
from core.rules.alltypes import BuffType
from core.simulation.constraint import Constraint


class BuffPanel(object):
    def __init__(self):
        '''
        用于构建伤害\n
        储存需要修改伤害树的键和值\n
        包括添加节点和修改节点操作
        '''
        self.add_info: OrderedDict[str, Tuple[str, float, str]] = OrderedDict()
        self.change_info: Dict[str, float] = {}

    def add_buff(self, tar_key: str, name: str, value: float, func: str = ''):
        self.add_info[tar_key] = (name, value, func)

    def change_buff(self, key, value):
        self.change_info[key] = value

    @property
    def adds(self) -> List[Tuple[str, DNode]]:
        adds = []
        for key, tup in self.add_info.items():
            n: DNode = DNode(tup[0], tup[2], tup[1])
            adds.append((key, n))
        return adds

    @property
    def changes(self) -> List[Tuple[str, float]]:
        return list(self.change_info.items())


class Buff(BuffPanel):
    def __init__(self, **configs):
        '''
        用于构建buff\n
        type: buff类型\n
        name: buff名称\n
        sourcename: buff施加者\n
        constraint: 约束 一般为时间约束\n
        trigger: (可选)\\
        \t对DMG类型,参数(simulation, event)检查对此伤害是否触发;\\
        \t对ATTR类型,参数(simulation)检查加成数值是否更新, 适用于动态buff\n
        target_path: (可选)\\
        \t对DMG类型,参数([names] | None) buff作用角色, None为所有;\\
        \t对ATTR类型,参数([[names], attr] | [None, attr]) buff作用角色及其值, None为所有;\n
        ---
        ATTR类型: 储存需要修改属性树的键和值 包括添加节点和修改节点操作\n
        DMG类型: 储存需要修改伤害树的键和值\n
        ENEMY类型: 储存需要修改属性树类型的键和值\n
        INFUSE类型: 储存需要修改的技能和元素类型\n
        OTHER类型: 暂定\n
        '''
        super().__init__()
        self.type: BuffType = BuffType(0)
        self.name: str = ''
        self.sourcename: str = ''
        self.constraint: Constraint = None
        self.trigger: Callable[[Any], bool] = None
        self.target_path: List = []
        self.initialize(**configs)

    def initialize(self, **configs):
        for k, v in configs.items():
            self.__setattr__(k, v)

    def __eq__(self, other: 'Buff') -> bool:
        return self.name == other.name
