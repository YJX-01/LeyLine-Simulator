from queue import PriorityQueue, Queue
from collections import OrderedDict
from typing import Sequence, Mapping, Union, List, Dict
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
        \tcharacters: OrderedDict[str, Character]\n
        \toperation_track: Sequence[Operation]\n
        \tconstraint_track: Sequence[Constraint]\n
        \tevent_queue: Queue[Event]\n
        methods:\n
        \tset_character(name, lv, asc=False)\n
        \tset_artifact(name, artifact)\n
        \tset_weapon(name, weapon)\n
        '''
        if hasattr(self, 'characters'):
            return
        self.characters: OrderedDict[str, Character] = OrderedDict()
        self.operation_track: Sequence['Operation'] = []
        self.constraint_track: Sequence['Constraint'] = []
        self.char_shortcut: Dict[str, str] = {}

        self.show_option: Dict[str, bool] = {}
        self.event_queue: Queue[Event] = PriorityQueue()
        self.active_constraint: Sequence['Constraint'] = []

        self.operation_log: Sequence['Operation'] = []
        self.event_log: Sequence['Event'] = []
        self.output_log: List[str] = []
        self.onstage: str = ''
        self.clock: float = 0
        self.uni_action_constraint: DurationConstraint = None
        self.uni_switch_constraint: DurationConstraint = None

    def set_character(self, name: str, lv: int = 1, asc: bool = False):
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

    def set_artifact(self, name: str, artifact: Artifact):
        self.characters[name].equip(artifact)

    def set_weapon(self, name: str, weapon: Weapon):
        self.characters[name].equip(weapon)

    def set_talents(self, name, norm=1, skill=1, burst=1, cx=0):
        self.characters[name].set_talents(norm, skill, burst, cx)

    def set_show_what(self, *args, **kwargs):
        self.show_option = dict.fromkeys(
            list(EventType.__members__.keys()), False)
        for arg in args:
            if not isinstance(arg, str):
                continue
            if arg == 'all':
                self.show_option = dict.fromkeys(
                    list(EventType.__members__.keys()), True)
                break
            self.show_option[arg.upper()] = True
        for k, v in kwargs.items():
            self.show_option[k.upper()] = v

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
        self.event_queue = PriorityQueue()

    def start(self, endtime: float = 30, mode: str = ''):
        '''
        每一次模拟配置生成一个实例\n
        同样的配置项可以多次执行计算\n
        (考虑到例如暴击率的效果每次执行的结果是随机的，暴击率也可以设置成折算为期望收益)
        '''
        print('CALCULATE START!')
        self.clear_result()
        creation_space = CreationSpace()
        creation_space.clear()
        numeric_controller = NumericController()

        print('PROCESS COMMAND!')
        active_constraint: Sequence['Constraint'] = []
        active_constraint.extend(self.constraint_track)
        self.event_queue.put(TryEvent(time=-1, subtype='init'))

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
            if ev.time > endtime:
                break
            numeric_controller.execute(self, ev)
            creation_space.execute(self, ev)
            ev.execute(self)
            self.event_log.append(ev)
            self.event_queue.task_done()

        show_what = [k for k, b in self.show_option.items() if b]
        for output in self.output_log:
            if sum([s in output for s in show_what]):
                print(output)

        print('CALCULATE FINISHED!')
