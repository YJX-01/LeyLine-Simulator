from wrapper import Wrapper

class Enemy(Wrapper):
    def __init__(self) -> None:
        config = dict()
        config['res'] = None
        config['hp'] = None
        config['name'] = None
        super().__init__(config)