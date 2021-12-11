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
        dependency = data['dependency']
        return data[f'{dependency}']

    @staticmethod
    def scalarProcessor(data: dict, *buffs):
        return data['scalar']

    @staticmethod
    def damageBonusProcessor(data: dict, *buffs):
        dependency = data['dependency']
        bonus = sum([b for b in buffs])+data[f'{dependency}_bonus']
        return 1+bonus

    @staticmethod
    def critDamageProcessor(data: dict, *buffs):
        return 1+data['crit_damage']*data['crit_rate']

    @staticmethod
    def reactionProcessor(data: dict, *buffs):
        return 1+(2.78*data['EM'])/(1400+data['EM'])+data['react_bonus']

    @staticmethod
    def resistanceProcessor(data: dict, *buffs):
        elem = data.get('elem_type')
        reduce = data['monster'][f'{elem}_res'] - \
            data.get(f'{elem}_res_reduce', 0)
        if reduce > 75:
            return 1/(1+0.04*reduce)
        elif 0 <= reduce <= 75:
            return 1-0.01*reduce
        else:
            return 1-0.005*reduce

    @staticmethod
    def defenceProcessor(data: dict, *buffs):
        return (data['level']+100)/(data['level']+100+(1-data['def_ignore'])(1-data['def_reduce'])(data['monster']['level']+100))

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
        self.data = dict()
        self.buffs = None
        self.value = 1.0

    def update(self, data, *buffs):
        self.data = data
        self.buffs = buffs
        self.value = self.func(data, buffs)

    def __float__(self) -> float:
        return self.value


class Damage():
    def __init__(self) -> None:
        self.dealer = None
        self.type = None
        self.multipliers = None
        self.information = None


class AmplifyingDamage(Damage):
    def __init__(self) -> None:
        super().__init__()


class TransformativeDamage(Damage):
    def __init__(self) -> None:
        super().__init__()


class blankDamage(Damage):
    def __init__(self) -> None:
        super().__init__()


class Heal():
    def __init__(self) -> None:
        pass


class Shield():
    def __init__(self) -> None:
        pass
