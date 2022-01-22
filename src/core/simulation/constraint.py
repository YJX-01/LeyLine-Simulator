from enum import Enum


class Constraint(object):
    def __init__(self):
        self.type: ConstraintType = ConstraintType(1)


class ConstraintType(Enum):
    FLAG = 1
    COUNTER = 2
    CD = 3
