from copy import deepcopy
from typing import TYPE_CHECKING, List, Tuple, Mapping
from core.rules.dnode import DNode
from core.rules.alltypes import DamageType, ElementalReactionType, ElementType
from core.entities.creation import Creation
from core.entities.enemy import Enemy
from core.entities.panel import EntityPanel, BuffPanel
from core.entities.character import Character
from core.simulation.event import *
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation


class NumericController(object):
    '''
    控制所有数值事件\n
    操作树结构 保证树的干净和可恢复\n
    定时自动更新 记录时间间隔内的全部数值
    '''
    __instance = None

    def __new__(cls, *args, **kwargs):
        if not cls.__instance:
            cls.__instance = object.__new__(cls, *args, **kwargs)
        return cls.__instance

    __interest_data = [
        'ATK', 'DEF', 'HP', 'EM', 'ER', 'CRIT_RATE', 'CRIT_DMG',
        'SHIELD_STRENGTH', 'ANEMO_DMG', 'GEO_DMG', 'ELECTRO_DMG',
        'HYDRO_DMG', 'PYRO_DMG', 'CRYO_DMG', 'DENDRO_DMG', 'PHYSICAL_DMG'
    ]

    def __init__(self):
        self.enemy = Enemy()
        self.active_buffs = []
        self.triggers = []
        self.char_num_log = {}
        self.damage_num_log = {}
        self.heal_num_log = {}
        self.shield_num_log = {}

    def initialize(self, simulation: 'Simulation'):
        self.__init__()
        self.character_record(simulation.characters)

    def execute(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY:
            if event.subtype == 'init':
                self.initialize(simulation)
                self.clock(simulation, event)
            elif event.subtype == 'num_clock':
                self.clock(simulation, event)
                self.character_info_enquire()
        elif event.type == EventType.DAMAGE:
            damage = AMP_DMG()
            damage.connect(event)
            source = event.source.source
            if isinstance(source, Character):
                panel = EntityPanel(source)
                damage.connect(panel)
            elif isinstance(source, Creation):
                damage.connect(source.attr_panel)

            def inform(simulation, event):
                simulation.output_log.append(event.prefix_info)

            simulation.event_queue.put(NumericEvent(
                time=event.time,
                subtype='DAMAGE',
                source='Controller',
                obj=damage.root,
                desc=event.desc,
                func=inform
            ))

    def initialize(self, simulation: 'Simulation'):
        for character in simulation.characters:
            # TODO call all the passive, constellation
            # weapon and artifact passive buff

            # TODO register all the triggerable talent into triggers
            pass

    def character_record(self, characters: Mapping):
        self.char_num_log = dict.fromkeys(characters.keys())
        for k in self.char_num_log:
            self.char_num_log[k] = dict.fromkeys(self.__interest_data)
            for in_k in self.__interest_data:
                self.char_num_log[k][in_k] = []

    def character_info_enquire(self):
        pass

    def clock(self, simulation: 'Simulation', event: 'Event'):
        if event.subtype == 'num_clock':
            clock_time = 0.1
            simulation.event_queue.put(
                TryEvent(time=event.time+clock_time, subtype='num_clock'))
        elif event.subtype == 'init':
            simulation.event_queue.put(TryEvent(time=0, subtype='num_clock'))


class AMP_DMG(object):
    __multipliers = ['Basic Multiplier', 'Bonus Multiplier', 'Critical Multiplier',
                     'Amplifying Multiplier', 'Resistance Multiplier', 'Defence Multiplier']

    def __init__(self):
        self.root: DNode = DNode('Total Damage', '*')
        self.init_tree()
        self.depend: str = 'ATK'
        self.damage_type: DamageType = DamageType(0)
        self.elem_type: ElementType = ElementType(0)
        self.react_type: ElementalReactionType = ElementalReactionType(0)

    def init_tree(self) -> None:
        for m in self.__multipliers:
            self.root.insert(DNode(m, '+'))
        self.root.find('Basic Multiplier').insert(
            DNode('Stats * Ability', '*').extend([
                DNode('Ability Scaler', '+'),
                DNode('Ability Stat')
            ])
        )
        self.root.find('Bonus Multiplier').extend([
            DNode('Base', '', 1),
            DNode('Element DMG Bonus', '+'),
            DNode('Elemental Skill Bonus', '+'),
            DNode('Elemental Burst Bonus', '+'),
            DNode('Normal Attack Bonus', '+'),
            DNode('Charged Attack Bonus', '+'),
            DNode('Other Bonus', '+')
        ])
        self.root.find('Critical Multiplier').extend([
            DNode('Base', '', 1),
            DNode('Expectation', 'THRES_E').extend([
                DNode('Critical Rate', '+').extend([
                    DNode('Basic Critical Rate', '%'),
                    DNode('Bonus Critical Rate', '+')
                ]),
                DNode('Critical DMG', '+').extend([
                    DNode('Basic Critical DMG', '%'),
                    DNode('Bonus Critical DMG', '+')
                ])
            ])
        ])
        self.root.find('Amplifying Multiplier').insert(
            DNode('Amplifying Reaction', 'THRES_A').extend([
                DNode('Reaction Scaler', '+').extend([
                    DNode('Base', '', 1),
                    DNode('Elemental Mastery', 'EM').extend([
                        DNode('EM', '')
                    ]),
                    DNode('Reaction Bonus', '+')
                ]),
                DNode('Reaction Multiplier', '', 1)
            ])
        )
        self.root.find('Resistance Multiplier').insert(
            DNode('Resistance', 'RES').extend([
                DNode('Resistance Base', '%', 10),
                DNode('Resistance Debuff', '%', 0)
            ]),
        )
        self.root.find('Defence Multiplier').insert(
            DNode('Defence', 'DEF').extend([
                DNode('Character Level', '', 1),
                DNode('Enemy Level', '', 1),
                DNode('Defence Ignore', '%'),
                DNode('Defence Reduction', '+')
            ])
        )
        return

    def visualize(self) -> None:
        que: List[Tuple[DNode, int]] = []
        que.append((self.root, 0))
        while (que):
            c, n = que.pop()
            print('\t'*n+'->', f'[{c.key}][{c.func}][ {c.num} ]')
            if not c.leaf:
                que.extend([(c, n+1) for c in reversed(c.child)])

    def connect(self, *args) -> None:
        '''connect to panel objects or damage event'''
        for arg in args:
            if isinstance(arg, EntityPanel):
                self.to_entity_panel(arg)
            elif isinstance(arg, BuffPanel):
                self.to_buff_panel(arg)
            elif isinstance(arg, DamageEvent):
                self.to_event(arg)
        return

    def to_entity_panel(self, panel: EntityPanel):
        if panel.mode == 'simple':
            self.root.modify('Ability Stat',
                             num=getattr(panel, self.depend).value)

            v = getattr(panel, self.elem_type.name+'_DMG').value
            self.root.find('Element DMG Bonus').insert(DNode(
                'Entity '+self.elem_type.name+'_DMG', '%', 100*v))

            self.root.modify('Basic Critical Rate',
                             num=100*getattr(panel, 'CRIT_RATE').value)

            self.root.modify('Basic Critical DMG',
                             num=100*getattr(panel, 'CRIT_DMG').value)

            self.root.modify('EM',
                             num=getattr(panel, 'EM').value)
        elif panel.mode == 'complete':
            n: DNode = deepcopy(getattr(panel, self.depend))
            self.root.modify('Ability Stat',
                             func=n.func,
                             child=n.child)

            n = deepcopy(getattr(panel, self.elem_type.name+'_DMG'))
            n.key = 'Entity ' + n.key
            self.root.find('Element DMG Bonus').insert(n)

            n = deepcopy(getattr(panel, 'CRIT_RATE'))
            self.root.modify('Basic Critical Rate',
                             func=n.func,
                             child=n.child)

            n = deepcopy(getattr(panel, 'CRIT_DMG'))
            self.root.modify('Basic Critical DMG',
                             func=n.func,
                             child=n.child)

            n = deepcopy(getattr(panel, 'EM'))
            self.root.modify('EM',
                             func=n.func,
                             child=n.child)

    def to_buff_panel(self, panel: BuffPanel):
        for a in panel.adds:
            try:
                self.root.find(a[1].key)
            except:
                self.root.find(a[0]).insert(a[1])
            else:
                self.root.modify(a[1].key,
                                 func=a[1].func,
                                 num=a[1].num,
                                 child=a[1].child)
        for c in panel.changes:
            self.root.modify(c[0], num=c[1])

    def to_event(self, event: DamageEvent):
        self.depend = event.depend
        self.damage_type = event.subtype
        self.elem_type = event.elem
        s = event.source
        while(not hasattr(s, 'name')):
            s = s.source
        self.root.modify('Character Level', num=s.base.lv)
        self.root.find('Ability Scaler').insert(
            DNode('Basic Ability Scaler', '', event.scaler))

    @property
    def view_str(self) -> str:
        result = []
        que: List[Tuple[DNode, int]] = []
        que.append((self.root, 0))
        while (que):
            c, n = que.pop()
            result.append('\t'*n+'->'+f'[{c.key}][{c.func}][ {c.num} ]')
            if not c.leaf:
                que.extend([(c, n+1) for c in reversed(c.child)])
        return '\n'.join(result)

    # TODO the test function should be deleted
    def test(self):
        self.root.modify('Ability Stat', num=2000)
        self.root.find('Ability Scaler').insert(
            DNode('Basic Ability Scaler', '%', 200))
        self.root.find('Other Bonus').insert(DNode('Bonus1', '%', 60))
        self.root.find('Other Bonus').insert(DNode('Bonus2', '%', 60))
        self.root.remove('Bonus2')
        self.root.modify('EM', num=90)
        self.root.modify('Reaction Multiplier', num=1.5)
        self.root()
        self.visualize()


# d = AMP_DMG()
# d.test()
