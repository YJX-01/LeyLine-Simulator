from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from core.simulation import Simulation


class Event:
    time = 0
    priority = 500
    description = ''

    def execute(self, simulation: 'Simulation'):
        print(f'[{self.get_time_str()}s]:[event] some event happened')

    def get_event_priorities(self):
        return (self.time, self.priority)

    def get_time_str(self):
        return format(self.time, '0.2f')
