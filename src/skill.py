from buff import Buff

class Skill():
    """使用技能应该产生四种效果

        1.技能本身的伤害。

        2.产生主动后台技能。

        3.产生被动后台技能。

        4.产生buff。

        新产生的主动后台和被动后台技能也可以产生效果1和4，但不会产生效果2和3
    """
    
    def __init__(self) -> None:
        self.__damages = [] #多段伤害
        self.__heals = [] #多段治疗
        
        self.__subskill_frontstage = [""]
        self.__subskill_backstage = [""]
        self.__buffs = [""]
        
        self.__prefix = 0
        self.__suffix = 0
        
        self.__breakable = False

    def use(self, time: float) -> None:
        self.damage()
        self.heal()
        self.genSubskillsFront()
        self.genSubskillsBack()
        self.genBuffs()
        pass

    def damage(self) -> None:
        pass
    
    def heal(self) -> None:
        pass
    
    def genSubskillsFront(self) -> None:
        pass
    
    def genSubskillsBack(self) -> None:
        pass
    
    def genBuffs(self) -> None:
        pass
