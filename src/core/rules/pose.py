'''
TODO 角色姿态状态判断可以先考虑不做
'''
from enum import Enum


class Pose(Enum):
    STANDING = 1
    JUMPING = 2
    GLIDING = 3
    NORMAL_ATK_HIT_1 = 4
