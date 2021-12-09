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

    # <2> = transformative Multiplier?
    # <20> basic reaction stat Multiplier

    # <3> = healing Multiplier

    # <4> = shield Multiplier

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

    __type_map = \
        {
            '00': statProcessor,
            '01': scalarProcessor,
            '10': damageBonusProcessor,
            '11': critDamageProcessor,
            '12': reactionProcessor,
            '13': resistanceProcessor,
            '14': defenceProcessor
        }

    def __init__(self, type: str) -> None:
        self.func = self.__type_map.get(type, None)

    def merge(self, ID: str, *multipliers):
        '''ID should not be repeated'''
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
