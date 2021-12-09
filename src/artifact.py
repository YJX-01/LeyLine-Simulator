from wrapper import Wrapper


class Artifact(Wrapper):
    '''
    定义单个圣遗物的类\n
    '''

    def __init__(self) -> None:
        config = dict()
        config['set_name'] = None  # 圣遗物套装: str
        config['postion'] = None  # 圣遗物位置: str
        config['quality'] = None    # 圣遗物星级: int
        config['main_stat'] = None  # 圣遗物主词条: str
        config['sub_stat'] = None  # 圣遗物副词条: str
        super().__init__(config)


class ArtifactSet():
    def __init__(self, art: list) -> None:
        self.artifact_set = art
        self.piece2 = None
        self.piece4 = None
        self.bonus = None
        self.effect = None
