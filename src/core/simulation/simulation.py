from queue import PriorityQueue, Queue
from typing import Sequence, Mapping, Union
from core.entities import *
from core.rules import *
from .constraint import *
from .operation import Operation


class Simulation(object):
    __instance = None

    def __new__(cls, *args, **kwargs):
        if not cls.__instance:
            cls.__instance = object.__new__(cls, *args, **kwargs)
        return cls.__instance

    def __init__(self):
        '''
        attributes:\n
        \tcharacters: Mapping[str, Character]\n
        \toperation_track: Sequence[Operation]\n
        \tconstraint_track: Sequence[Constraint]\n
        \tevent_queue: Queue[Event]\n
        methods:\n
        \tset_character(name, lv, asc=False)\n
        \tset_artifact(name, artifact)\n
        \tset_weapon(name, weapon)\n
        '''
        self.characters: Mapping[str, Character] = {}
        self.operation_track: Sequence['Operation'] = []
        self.constraint_track: Sequence['Constraint'] = []
        self.event_queue: Queue[Event] = PriorityQueue()
        self.active_constraint: Sequence['Constraint'] = []
        self.operation_log = []
        self.event_log = []

    def set_character(self, name='', lv=1, asc=False) -> None:
        if name not in self.characters.keys() and len(self.characters) <= 4:
            genshin = Character()
            genshin.initialize(name=name, lv=lv, asc=asc)
            self.characters[name] = genshin
        elif name in self.characters:
            self.characters[name].base.set_lv(lv, asc)
        else:
            raise Exception('error occur when setting the character')

    def del_characters(self, name=''):
        if name not in self.characters.keys():
            raise KeyError
        else:
            del self.characters[name]

    def set_artifact(self, name='', artifact=None):
        self.characters[name].equip(artifact)

    def set_weapon(self, name='', weapon=None):
        self.characters[name].equip(weapon)

    def insert(self, obj: Union['Operation', 'Constraint']):
        if isinstance(obj, Operation):
            self.operation_track.append(obj)
        elif isinstance(obj, Constraint):
            self.constraint_track.append(obj)
        else:
            raise TypeError

    def remove(self, obj: Union['Operation', 'Constraint']):
        try:
            if isinstance(obj, Operation):
                self.operation_track.remove(obj)
            elif isinstance(obj, Constraint):
                self.constraint_track.remove(obj)
        except ValueError:
            raise ValueError('obj not found')
        except TypeError:
            raise TypeError('please input operation or constraint')
        else:
            return

    def start(self):
        '''
        每一次模拟配置生成一个实例\n
        同样的配置项可以多次执行计算\n
        (考虑到例如暴击率的效果每次执行的结果是随机的，暴击率也可以设置成折算为期望收益)
        '''
        print('CALCULATE START!')

        operation_queue: Queue['Operation'] = PriorityQueue()
        active_constraint: Sequence['Constraint'] = []
        active_constraint.extend(self.constraint_track)
        list(map(lambda op: operation_queue.put(op), self.operation_track))
        while operation_queue.unfinished_tasks > 0:
            op: 'Operation' = operation_queue.get()
            op.execute(self)
            self.operation_log.append(op)
            operation_queue.task_done()

        print('EXECUTE EVENTS!')
        while self.event_queue.unfinished_tasks > 0:
            ev: 'Event' = self.event_queue.get()
            ev.execute(self)
            self.event_log.append(ev)
            self.event_queue.task_done()

        print('CALCULATE FINISHED!')
