from team import *
from timeline import *

class Server:
    def __init__(self) -> None:
        self.team = Team()
        self.timeline = TimeLine()
        self.recorder = None
        self.supervisor = None

    def answer(self, dependencies: list):
        response = {}
        return response
