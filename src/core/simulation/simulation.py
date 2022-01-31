from queue import PriorityQueue, Queue
from typing import TYPE_CHECKING, Sequence, Mapping, Tuple, Union
from core.entities import *
from core.rules import *
from .operation import *
from .constraint import *


class Simulation(object):
    def __init__(self):
        '''
        attributes:\n
        \tcharacters: Mapping[str, Character_]\n
        \tartifactmap: Mapping[str, Artifact]\n
        \tweaponmap: Mapping[str, Weapon]\n
        \toperation_track: Sequence[Operation]\n
        \tconstraint_track: Sequence[Constraint]\n
        methods:\n
        \tset_character(name, lv, asc=False) -> None\n
        \t\tset the character in the simulation\n
        '''
        self.characters: Mapping[str, Character] = {}
        self.artifactmap: Mapping[str, Artifact] = {}
        # self.weaponmap: Mapping[str, Weapon] = {}
        self.operation_track: Sequence[Operation] = []
        self.constraint_track: Sequence[Constraint] = []
        self.event_queue: Queue[Event] = PriorityQueue()
        self.recorder = []

    def set_character(self, name='', lv=1, asc=False) -> None:
        if name not in self.characters.keys() and len(self.characters) <= 4:
            tmp = Character()
            tmp.base.choose(name)
            tmp.base.set_lv(lv, asc)
            tmp.action.attach_skill(name)
            self.characters[name] = tmp
            self.artifactmap[name] = Artifact()
            # self.weaponmap[name] = Weapon()
        elif name in self.characters:
            self.characters[name].base.set_lv(lv, asc)
        else:
            raise Exception('error occur when setting the character')

    def del_characters(self, name=''):
        if name not in self.characters.keys():
            raise KeyError
        else:
            del self.characters[name]
            del self.artifactmap[name]
            # del self.weaponmap[name]

    def set_artifact(self, name='', art={}):
        self.artifactmap[name].artifacts[0].initialize(art)
        return

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
        operation_queue: PriorityQueue[Tuple[float, Operation]] = PriorityQueue()
        active_constraint: Sequence[Constraint] = []
        active_constraint.extend(self.constraint_track)
        list(map(lambda op: operation_queue.put(
            (op.priority, op)), self.operation_track))
        while operation_queue.unfinished_tasks > 0:
            op: Operation = operation_queue.get()[1]
            op.execute(self)
            self.recorder.append(op.desc)
            operation_queue.task_done()
        
        print('EXECUTE EVENTS!')
        while self.event_queue.unfinished_tasks > 0:
            ev: Event = self.event_queue.get()[1]
            ev.execute(self)
            self.recorder.append(op.desc)
            self.event_queue.task_done()
        print('CALCULATE FINISHED!')
