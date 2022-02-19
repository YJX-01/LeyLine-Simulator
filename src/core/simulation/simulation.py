from queue import PriorityQueue, Queue
from collections import OrderedDict
from typing import Sequence, Mapping, Union, List
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
        self.characters: OrderedDict[str, Character] = OrderedDict()
        self.operation_track: Sequence['Operation'] = []
        self.constraint_track: Sequence['Constraint'] = []
        self.char_shortcut: Mapping[str, str] = {}

        self.event_queue: Queue[Event] = PriorityQueue()
        self.active_constraint: Sequence['Constraint'] = []

        self.operation_log: Sequence['Operation'] = []
        self.event_log: Sequence['Event'] = []
        self.output_log: List[str] = []
        self.onstage: str = ''
        self.uni_action_constraint: DurationConstraint = None
        self.uni_switch_constraint: DurationConstraint = None

    def set_character(self, name, lv=1, asc=False) -> None:
        if name not in self.characters.keys() and len(self.characters) <= 4:
            genshin = Character()
            genshin.set_base(name=name, lv=lv, asc=asc)
            self.characters[name] = genshin
            self.char_state_update()
        elif name in self.characters:
            self.characters[name].base.set_lv(lv, asc)
        else:
            raise Exception('error occur when setting the character')
    
    def del_characters(self, name):
        if name not in self.characters.keys():
            raise KeyError
        else:
            del self.characters[name]
            self.char_state_update()

    def char_state_update(self):
        self.onstage = list(self.characters.keys())[0]
        self.char_shortcut = dict(zip(range(1, 1+len(self.characters)),
                                      self.characters.keys()))

    def set_artifact(self, name, artifact=None):
        self.characters[name].equip(artifact)

    def set_weapon(self, name, weapon=None):
        self.characters[name].equip(weapon)
    
    def set_talents(self, name, norm=1, skill=1, burst=1, cx=0):
        self.characters[name].set_talents(norm, skill, burst, cx)

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

    def clear_result(self):
        self.char_state_update()
        self.event_log.clear()
        self.operation_log.clear()

    def start(self):
        '''
        每一次模拟配置生成一个实例\n
        同样的配置项可以多次执行计算\n
        (考虑到例如暴击率的效果每次执行的结果是随机的，暴击率也可以设置成折算为期望收益)
        '''
        print('CALCULATE START!')
        self.event_log.clear()
        self.operation_log.clear()

        print('PROCESS COMMAND!')
        active_constraint: Sequence['Constraint'] = []
        active_constraint.extend(self.constraint_track)

        creation_space = CreationSpace()

        operation_queue: Queue['Operation'] = PriorityQueue()
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
            creation_space.execute(self, ev)
        
        for output in self.output_log:
            print(output)

        print('CALCULATE FINISHED!')
