class Attribute():
    def __init__(self):
        self.__level = 1
        self.__ascension = 0
        self.__constellation = 0
        self.__norm_level = 1
        self.__skill_level = 1
        self.__burst_level = 1

    @property
    def level(self):
        return self.__level

    @property
    def ascension(self):
        return self.__ascension

    @property
    def constellation(self):
        return self.__constellation

    @property
    def norm_level(self):
        return self.__norm_level

    @property
    def skill_level(self):
        return self.__skill_level

    @property
    def burst_level(self):
        return self.__burst_level

    @level.setter
    def level(self, lv):
        if lv > + 1 and lv <= 90:
            self.__level = lv

    @ascension.setter
    def ascension(self, asc):
        if asc >= 0 and asc <= 6:
            self.__ascension = asc

    @constellation.setter
    def constellation(self, c):
        if c >= 0 and c <= 6:
            self.__constellation = c

    @norm_level.setter
    def norm_level(self, lv):
        if lv >= 0 and lv <= 11:
            self.__norm_level = lv

    @skill_level.setter
    def skill_level(self, lv):
        if lv >= 0 and lv <= 13:
            self.__skill_level = lv

    @burst_level.setter
    def burst_level(self, lv):
        if lv >= 0 and lv <= 13:
            self.__burst_level = lv

    def setBase(self, lv, asc, c):
        self.level = lv
        self.ascension = asc
        self.constellation = c
        self.updateAscension()

    def setSkill(self, norm, skill, burst):
        self.norm_level = norm
        self.skill_level = skill
        self.burst_level = burst

    def updateAscension(self, ascend=True):
        if self.__level < 20:
            self.__ascension = 0
        elif self.__level == 20:
            self.__ascension = int(ascend)
        elif self.__level < 40:
            self.__ascension = 1
        elif self.__level == 90:
            self.__ascension = 6
        else:
            self.__ascension = self.__level // 10 - 3 + int(ascend)
