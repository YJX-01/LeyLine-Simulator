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
        self.energy_log = {}
        self.dmg_log = {}
        self.heal_log = {}
        self.shield_log = {}
        self.clock_time = 0.1

    def execute(self, simulation: 'Simulation', event: 'Event'):
        if event.type == EventType.TRY and event.subtype == 'init':
            self.reset()
            self.log_init(simulation.characters)
            self.triggers_init(simulation)
            self.energy_init(simulation)
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
            damage.connect(self.enemy)

            source = event.source.source
            if isinstance(source, Creation):
                if getattr(source, 'attr_panel', None):
                    damage.connect(source.attr_panel)
                else:
                    panel = EntityPanel(source.source.source)
                    damage.connect(panel)
            else:
                panel = EntityPanel(source)
                damage.connect(panel)

            buffs = [b for b in self.const_buffs_dmg
                     if b.trigger(simulation, event) and
                     (not b.target_path or event.sourcename in b.target_path)]
            buffs.extend([b for b in self.dynamic_buffs_dmg
                          if b.trigger(simulation, event) and
                          (not b.target_path or event.sourcename in b.target_path)])
            for b in buffs:
                damage.connect(b)

            apply_flag, react_type, react_multi = self.enemy.attacked_by(event)
            if apply_flag and event.elem != ElementType.NONE and event.elem != ElementType.PHYSICAL:
                self.apply_element(simulation, event)
            if react_type != ElementalReactionType.NONE:
                react_event = self.react_event(event, react_multi, react_type)
                simulation.event_queue.put(react_event)
                damage.connect(react_event)

            numeric_event = NumericEvent(time=event.time,
                                         subtype=event.subtype,
                                         sourcename=event.sourcename,
                                         obj=damage.root,
                                         desc=event.desc)
            simulation.event_queue.put(numeric_event)

            self.dmg_log[event.sourcename][event.subtype.name].append(
                (event.time, damage.root.value))

    def set_enemy(self, **configs):
        self.enemy = Enemy(**configs)

    def set_interval(self, interval: float):
        self.clock_time = interval

    def reset(self):
        for k, v in self.__dict__.items():
            if isinstance(v, list) or isinstance(v, dict):
                v.clear()

    def insert_to(self, buff: 'Buff', type: str, simulation: 'Simulation'):
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
                for name in simulation.characters.keys():
                    if not buff.target_path[0] or name in buff.target_path[0]:
                        simulation.characters[name].attribute.connect(buff)

        elif type == 'const_attr' or type == 'ca':
            if buff not in self.const_buffs_attr:
                self.const_buffs_attr.append(buff)
                for name in simulation.characters.keys():
                    if not buff.target_path[0] or name in buff.target_path[0]:
                        simulation.characters[name].attribute.connect(buff)

        elif type == 'dynamic_dmg' or type == 'dd':
            if buff not in self.dynamic_buffs_dmg:
                self.dynamic_buffs_dmg.append(buff)

        elif type == 'const_dmg' or type == 'cd':
            if buff not in self.const_buffs_dmg:
                self.const_buffs_dmg.append(buff)

    def log_init(self, characters: Mapping):
        self.char_attr_log = dict.fromkeys(characters.keys())
        for k in self.char_attr_log:
            self.char_attr_log[k] = dict.fromkeys(self.__interest_data)
            self.energy_log[k] = []
            self.onstage_log[k] = []
            self.dmg_log[k] = dict.fromkeys(DamageType.__members__.keys())
            for in_k in self.__interest_data:
                self.char_attr_log[k][in_k] = []
            for type_k in DamageType.__members__.keys():
                self.dmg_log[k][type_k] = []

    def triggers_init(self, simulation: 'Simulation'):
        for character in simulation.characters.values():
            # TODO call all the passive, constellation
            # weapon and artifact passive buff
            ev = TryEvent(subtype='init')
            for passive in character.action.PASSIVE:
                passive(simulation, ev)
            for cx in character.action.CX:
                cx(simulation, ev)
            character.weapon.work(simulation, ev)
            character.artifact.work(simulation, ev)

    def energy_init(self, simulation: 'Simulation'):
        if not simulation.energy_full:
            return
        for character in simulation.characters.values():
            character.energy.receive(200)

    def triggers_call(self, simulation: 'Simulation', event: 'Event'):
        for name, character in simulation.characters.items():
            for passive in character.action.PASSIVE:
                passive(simulation, event)
            for cx in character.action.CX:
                cx(simulation, event)
            character.weapon.work(simulation, event)
            character.artifact.work(simulation, event)

    def refresh(self, simulation: 'Simulation'):
        time = simulation.clock
        for b in self.dynamic_buffs_attr:
            if b.constraint.end < time:
                self.dynamic_buffs_attr.remove(b)
                for name in simulation.characters.keys():
                    if not b.target_path[0] or name in b.target_path[0]:
                        simulation.characters[name].attribute.disconnect(b)
                break
            if b.trigger:
                b.trigger(simulation)
        for b in self.dynamic_buffs_dmg:
            if b.constraint.end < time:
                self.dynamic_buffs_dmg.remove(b)

    def character_info_enquire(self, simulation: 'Simulation'):
        self.onstage_log[simulation.onstage].append(simulation.clock)
        for name, character in simulation.characters.items():
            self.energy_log[name].append(
                character.action.ELEM_BURST.energy.count)
            for in_k in self.__interest_data:
                attr_node = getattr(character.attribute, in_k)
                self.char_attr_log[name][in_k].append(attr_node.value)

    def apply_element(self, simulation: 'Simulation', event: 'Event'):
        apply_event = ElementEvent(time=event.time,
                                   subtype='apply',
                                   sourcename=event.sourcename,
                                   elem=event.elem,
                                   num=event.icd.GU,
                                   desc=f'{event.sourcename}: apply {event.elem} {event.icd.GU}')
        simulation.event_queue.put(apply_event)

    def react_event(self, event: 'Event', react_multi, react_type):
        return ElementEvent(time=event.time,
                            subtype='reaction',
                            sourcename=event.sourcename,
                            elem=event.elem,
                            num=react_multi,
                            react=react_type,
                            desc=f'{event.sourcename}: trigger {react_type}')


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
                DNode('Defence Ignore'),
                DNode('Defence Reduction', '+')
            ])
        )
        return

    def connect(self, *args) -> None:
        '''connect to panel objects or damage event'''
        for arg in args:
            if isinstance(arg, EntityPanel):
                self.to_entity_panel(arg)
            elif isinstance(arg, BuffPanel):
                self.to_buff_panel(arg)
            elif isinstance(arg, DamageEvent):
                self.to_event(arg)
            elif isinstance(arg, ElementEvent):
                self.to_react(arg)
            elif isinstance(arg, Enemy):
                self.to_enemy(arg)
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

    def to_buff_panel(self, panel: 'BuffPanel'):
        for a in panel.adds:
            try:
                self.root.find(a[0])
            except:
                continue
            else:
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
        while(not hasattr(s, 'base')):
            s = s.source
        self.root.modify('Character Level', num=s.base.lv)
        self.root.find('Ability Scaler').insert(
            DNode('Basic Ability Scaler', '', event.scaler))

        remove_map = {
            DamageType.ELEM_SKILL: 'Elemental Skill Bonus',
            DamageType.ELEM_BURST: 'Elemental Burst Bonus',
            DamageType.NORMAL_ATK: 'Normal Attack Bonus',
            DamageType.CHARGED_ATK: 'Charged Attack Bonus'
        }
        remove_map.pop(self.damage_type)
        for v in remove_map.values():
            self.root.remove(v)

    def to_react(self, event: ElementEvent):
        if self.subtype != 'reaction':
            raise TypeError('not a reaction')
        self.root.modify('Reaction Multiplier', num=event.num)

    def to_enemy(self, enemy: Enemy):
        self.root.modify('Enemy Level', num=enemy.lv)
        self.root.modify('Resistance Base',
                         num=enemy.RES[self.elem_type])

    def __repr__(self) -> str:
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
        print(self)


# d = AMP_DMG()
# d.test()
