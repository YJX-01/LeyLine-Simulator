from typing import TYPE_CHECKING, Dict, Tuple, List
from core.rules.dnode import DNode
from core.rules.alltypes import BuffType
from core.simulation.constraint import *

class Buff(object):
    def __init__(self):
        self.type: BuffType = BuffType(0)
        self.panel: BuffPanel = BuffPanel()
        self.trigger: DurationConstraint = DurationConstraint(0)


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
        for key, tup in self.add_info:
            n: DNode = DNode(tup[0], '', tup[1])
            adds.append((key, n))
        return adds

    @property
    def changes(self) -> List[Tuple[str, float]]:
        return list(self.change_info.items())
