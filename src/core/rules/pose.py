'''
TODO 角色姿态状态判断可以先考虑不做
'''
from enum import Enum


class ActionPose(Enum):
    STAND = 1
    JUMP = 2
    WALK = 3
    SPRINT = 4
    AIM = 5
    LOOSE = 6

class AttackPose(Enum):
    NORMAL_ATK = 1
    NORMAL_ATK_CHARGE = 2
    NORMAL_ATK_PLUNGE = 3
    ELEM_SKILL_DEFAULT = 4
    ELEM_SKILL_SHORT = 5
    ELEM_SKILL_LONG = 6
    ELEM_BURST_DEFAULT = 7
    ELEM_BURST_TRANSFORMATION = 8

class RestrictionPose(Enum):
    CD = 1
    NORMAL_ATK_BACKSWING = 2
    ELEM_SKILL_BACKSWING = 3
    ELEM_BURST_PRECAST = 4
    ELEM_BURST_BACKSWING = 5
