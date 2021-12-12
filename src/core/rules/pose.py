'''
TODO 角色姿态状态判断可以先考虑不做
'''
from enum import Enum


class Pose(Enum):
    STAND = 1
    JUMP = 2
    SPRINT = 3
    NORMAL_ATK_HIT_1 = 4
    ELEM_SKILL = 5
    ELEM_BURST = 6
