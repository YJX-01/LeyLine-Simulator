from copy import deepcopy
from typing import TYPE_CHECKING, List, Tuple, Mapping
from core.rules.dnode import DNode
from core.rules.alltypes import DamageType, ElementalReactionType, ElementType
from core.entities.creation import Creation
from core.entities.buff import *
from core.entities.enemy import Enemy
from core.entities.panel import EntityPanel
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
        if hasattr(self, 'enemy'):
            return
        self.enemy = Enemy()
        self.dynamic_buffs_attr: List[Buff] = []
        self.dynamic_buffs_dmg: List[Buff] = []
        self.const_buffs_attr: List[Buff] = []
        self.const_buffs_dmg: List[Buff] = []
        self.char_attr_log = {}
        self.onstage_log = {}
        self.dmg_log = {}
        self.heal_log = {}
        self.shield_log = {}
        self.clock_time = 0.1

    def execute(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.__init__()
            self.character_record_init(simulation.characters)
            self.triggers_init(simulation)
            return

        if event.time > simulation.clock:
            while(event.time > simulation.clock):
                self.refresh(simulation)
                self.character_info_enquire(simulation)
                simulation.clock += self.clock_time

        self.triggers_call(simulation, event)
        if event.type == EventType.DAMAGE:
            damage = AMP_DMG()
            damage.connect(event)

            source = event.source.source
            if hasattr(source, 'attr_panel'):
                damage.connect(source.attr_panel)
            else:
                panel = EntityPanel(source)
                damage.connect(panel)

            buffs = [b for b in self.const_buffs_dmg
                     if b.trigger(event.time, event) and
                     (not b.target_path or b.target_path == event.sourcename)]
            buffs.extend([b for b in self.dynamic_buffs_dmg
                          if b.trigger(event.time, event) and
                          (not b.target_path or b.target_path == event.sourcename)])
            for b in buffs:
                damage.connect(b)

            simulation.event_queue.put(NumericEvent(
                time=event.time,
                subtype='damage',
                sourcename='Controller',
                obj=damage.root,
                desc=event.desc,
            ))

    def insert_to(self, buff: Buff, type: str, simulation: 'Simulation'):
        '''
        insert buff into the controller\n
        dynamic_attr | da\n
        dynamic_dmg | dd\n
        const_attr | ca\n
        const_dmg | cd\n
        '''
        if type == 'dynamic_attr' or type == 'da':
            if buff not in self.dynamic_buffs_attr:
                self.dynamic_buffs_attr.append(buff)
                simulation.characters[buff.target_path[0]
                                      ].attribute.connect(buff)
        elif type == 'dynamic_dmg' or type == 'dd':
            if buff not in self.dynamic_buffs_dmg:
                self.dynamic_buffs_dmg.append(buff)
        elif type == 'const_attr' or type == 'ca':
            if buff not in self.const_buffs_attr:
                self.const_buffs_attr.append(buff)
                simulation.characters[buff.target_path[0]
                                      ].attribute.connect(buff)
        elif type == 'const_dmg' or type == 'cd':
            if buff not in self.const_buffs_dmg:
                self.const_buffs_dmg.append(buff)

    def triggers_init(self, simulation: 'Simulation'):
        for name, character in simulation.characters.items():
            # TODO call all the passive, constellation
            # weapon and artifact passive buff

            # TODO register all the triggerable talent into triggers
            for passive in character.action.PASSIVE:
                passive(simulation, TryEvent(subtype='init'))

    def character_record_init(self, characters: Mapping):
        self.char_attr_log = dict.fromkeys(characters.keys())
        for k in self.char_attr_log:
            self.char_attr_log[k] = dict.fromkeys(self.__interest_data)
            for in_k in self.__interest_data:
                self.char_attr_log[k][in_k] = []

    def refresh(self, simulation: 'Simulation'):
        time = simulation.clock
        for b in self.dynamic_buffs_attr:
            if b.constraint.end < time:
                self.dynamic_buffs_attr.remove(b)
                simulation.characters[b.target_path[0]].attribute.disconnect(b)
        for b in self.dynamic_buffs_dmg:
            if b.constraint.end < time:
                self.dynamic_buffs_dmg.remove(b)

    def triggers_call(self, simulation: 'Simulation', event: 'Event'):
        for name, character in simulation.characters.items():
            for passive in character.action.PASSIVE:
                passive(simulation, event)

    def character_info_enquire(self, simulation: 'Simulation'):
        for name, character in simulation.characters.items():
            for in_k in self.__interest_data:
                attr_node = getattr(character.attribute, in_k)
                self.char_attr_log[name][in_k].append(attr_node())


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
