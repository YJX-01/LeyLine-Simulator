class Artifact:
    '''
    定义单个圣遗物的类\n
    '''

    def __init__(self) -> None:
        self.set_name = ''  # 圣遗物套装: str
        self.position = ''  # 圣遗物位置: str
        self.quality = 5    # 圣遗物星级: int
        self.main_stat = ''  # 圣遗物主词条: str
        self.sub_stat = []  # 圣遗物副词条: str


class ArtifactSet():
    def __init__(self, art: list) -> None:
        self.artifact_set = art
        self.piece2 = None
        self.piece4 = None
        self.bonus = None
        self.effect = None
