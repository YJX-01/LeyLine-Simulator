import csv
import os.path
import time
from typing import TYPE_CHECKING, Union, List
from core.rules.alltypes import EventType
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation


class Exporter(object):
    def __init__(self, simulation: Union['Simulation', None] = None):
        self.sim = simulation
        self.dir = ''

    def export_dir(self, dir: str):
        if os.path.isdir(dir):
            self.dir = dir
        else:
            raise Exception('Not a directory')

    def input_sim(self, simulation: 'Simulation'):
        self.sim = simulation

    def export(self, interest: List[str] = []):
        type_list = [EventType[i.upper()] for i in interest]
        if not interest:
            type_list = list(EventType.__members__.values())
        filename = time.strftime('%y-%m-%d-%H-%M', time.localtime())+'.csv'
        with open(os.path.join(self.dir, filename), 'w') as csvfile:
            my_writer = csv.writer(csvfile, lineterminator='\n')
            my_writer.writerow(['time', 'type', 'subtype', 'source',
                                'desc', 'info1', 'info2', 'info3'])
            # 8 columns
            for event in self.sim.event_log:
                if event.type not in type_list:
                    continue
                event_row = [event.time, event.type.name, '', event.sourcename,
                             event.desc, '', '', '']
                if hasattr(event.subtype, 'name'):
                    event_row[2] = event.subtype.name
                else:
                    event_row[2] = str(event.subtype)

                if event.type == EventType.COMMAND:
                    event_row[6] = event.mode
                if event.type == EventType.ACTION:
                    event_row[5] = event.dur
                    event_row[6] = event.cd
                if event.type == EventType.DAMAGE:
                    event_row[5] = event.elem.name
                    event_row[6] = event.mode
                if event.type == EventType.ENERGY:
                    event_row[5] = event.elem.name
                    event_row[6] = event.base
                    event_row[7] = event.num
                if event.type == EventType.ELEMENT:
                    event_row[5] = event.elem.name
                    event_row[6] = event.num
                    event_row[7] = event.react.name
                if event.type == EventType.BUFF:
                    event_row[5] = event.duration
                if event.type == EventType.NUMERIC:
                    event_row[5] = event.obj.value
                if event.type == EventType.HEALTH:
                    event_row[5] = str(event.scaler)
                my_writer.writerow(event_row)
