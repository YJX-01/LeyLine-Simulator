from wrapper import Wrapper

class Attribute(Wrapper):
    def __init__(self):
        config = dict()
        config['level'] = None
        config['ascension'] = None
        config['constellation'] = None
        config['norm_level'] = None
        config['skill_level'] = None
        config['burst_level'] = None
        super().__init__(config)

    def updateAscension(self, ascend=True):
        if self['level'] < 20:
            self['ascension'] = 0
        elif self['level'] == 20:
            self['ascension'] = int(ascend)
        elif self['level'] < 40:
            self['ascension'] = 1
        elif self['level'] == 90:
            self['ascension'] = 6
        else:
            self['ascension'] = self['level'] // 10 - 3 + int(ascend)
    
    def level_to_stat(self, level):
        # base values data: AvatarExcelConfigData.json
        # level multipliers data: AvatarCurveExcelConfigData.json
        # ascension values data: AvatarPromoteExcelConfigData.json

        # Base Attribute Value = Base Value * Level Multiplier + Ascension Value
        # Ascension Value in the Ascension Phase = Total Section in the Ascension Phase * Max Ascension Value
        # Total Section in the Ascension Phase = Sum of Sections for the Corresponding Ascension Phase / 182

        # Ascension Phase	1st	2nd	3rd	4th	5th	6th
        # Total Section	38/182	65/182	101/182	128/182	155/182	1
        pass
