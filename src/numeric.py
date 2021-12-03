class Multiplier():
    '''
    定义伤害乘区的类\n
    '''
    # <0> = Basic Multiplier
    # <00> Stat Multiplier
    # <01> Scalar Multiplier

    # <1> = Buffs Multiplier
    # <10> Damage Bonus Multiplier
    # <11> Critical Damage Multiplier
    # <12> Reaction Multiplier
    # <13> Resistance Multiplier
    # <14> Defence Multiplier

    # <2> = upheaval Multiplier?
    # <20> basic reaction stat Multiplier

    def __init__(self, ID: str) -> None:
        self.type = ID
        self.data = None
        self.work_function = None
        self.selectFunction()

    def merge(self, ID: str, *multipliers):
        '''ID should not be repeated'''
        pass

    def selectFunction(self) -> None:
        if self.type == '00':
            self.work_function = Multiplier.statProcessor
            return
        elif self.type == '01':
            self.work_function = Multiplier.scalarProcessor
            return
        elif self.type == '10':
            self.work_function = Multiplier.damageBonusProcessor
            return
        elif self.type == '11':
            self.work_function = Multiplier.critDamageProcessor
            return
        elif self.type == '12':
            self.work_function = Multiplier.reactionProcessor
            return
        elif self.type == '13':
            self.work_function = Multiplier.resistanceProcessor
            return
        elif self.type == '14':
            self.work_function = Multiplier.defenceProcessor
            return
        elif self.type == '14':
            self.work_function = Multiplier.defenceProcessor
            return
        else:
            pass

    @staticmethod
    def statProcessor(data: dict, *buffs):
        pass

    @staticmethod
    def scalarProcessor(data: dict, *buffs):
        pass

    @staticmethod
    def damageBonusProcessor(data: dict, *buffs):
        pass

    @staticmethod
    def critDamageProcessor(data: dict, *buffs):
        pass

    @staticmethod
    def reactionProcessor(data: dict, *buffs):
        pass

    @staticmethod
    def resistanceProcessor(data: dict, *buffs):
        pass

    @staticmethod
    def defenceProcessor(data: dict, *buffs):
        pass


class Damage():
    def __init__(self) -> None:
        self.dealer = None
        self.type = None
        self.multipliers = None
        self.information = None

class AmplifyingDamage(Damage):
    pass

class TransformativeDamage(Damage):
    pass

class blankDamage(Damage):
    pass

class Heal():
    pass

class Shield():
    pass