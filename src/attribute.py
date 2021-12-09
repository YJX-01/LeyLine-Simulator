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
