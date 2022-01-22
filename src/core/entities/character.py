import json
from typing import Callable, Mapping, Sequence, Dict, List
from core.rules import DNode, NationType, ElementType, WeaponType, PanelType
from core.simulation.event import Event


# TODO abandoned class
class Character_():
    def __init__(self, configs: dict) -> None:
        self.name: str = configs.get('name', '')
        self.level: int = configs.get('level', 0)
        self.asc: int = configs.get('asc', 0)  # asc is abbr for ascension
        self.cx: int = configs.get('cx', 0)  # cx is abbr for constellation
        self.element_type = None
        self.nationality = None
        self.weapon_type = None
        self.rarity: int = None
        self.HP_BASE: float = None
        self.ATK_BASE: float = None
        self.DEF_BASE: float = None
        self.talents: Dict[str, Callable[[Dict]]] = {}
        self.skills: Dict[str, Callable[[Dict]]] = {}
        self.constellations: Dict[str, Callable[[Dict]]] = {}
        self.initialize()

    def initialize(self):
        if not self.name:
            return
        info = dict()
        with open('.\docs\constant\CharacterConfig.json', 'r') as d:
            data: list = json.load(d)
            for c in data:
                if self.name == c['name']:
                    info = c.copy()
                    break
        self.element_type = ElementType(info['element'])
        self.nationality = NationType(info['region'])
        self.weapon_type = WeaponType(info['weapon'])
        self.rarity = info['rarity']
        self.HP_BASE = info['HP_BASE']
        self.ATK_BASE = info['ATK_BASE']
        self.DEF_BASE = info['DEF_BASE']

    def set_talents(self, talents):
        self.talents = talents

    def set_skills(self, skills):
        self.skills = skills

    def set_constellations(self, constellations):
        self.constellations = constellations

    def __call__(self, *args):
        # TODO 可能要使用 importlib 动态导入模块， 先写死
        for arg in args:
            if isinstance(arg, str):
                command_type: str = arg.split('.')[0]
                commands: List[str] = arg.split('.')[1:]
            elif isinstance(arg, dict):
                if 'time' in arg.keys():
                    time = arg.get('time')
            else:
                pass
        if command_type == 'skill':
            events: List[Event] = []
            for cmd in commands:
                f = self.skills[cmd]
                events.extend(f(time))
            return events
        elif command_type == 'talent':
            return [Event({'time': time+0.2, 'event_type': 2})]
        else:
            return [Event()]

    # for testing
    def demo_output(self):
        print(self.name, self.level, self.asc,
              self.element_type, self.nationality, self.weapon_type, self.rarity,
              self.HP_BASE, self.ATK_BASE, self.DEF_BASE)


class Character(object):
    def __init__(self) -> None:
        self.base: CharacterBase = CharacterBase()
        self.attribute: CharacterAttribute = CharacterAttribute()
        self.action: CharacterAction = CharacterAction()


class CharacterBase(object):
    with open('./docs/constant/LevelMultiplier.json', 'r') as f:
        __lv_curve = json.load(f)
    with open('./docs/constant/CharacterConfig.json', 'r') as f:
        __char_info = json.load(f)

    def __init__(self, **kwargs):
        self.name: str = ''
        self.rarity: str = ''
        self.weapon: int = 0
        self.element: int = 0
        self.region: int = 0
        self.lv: int = 0
        self.asc: int = 0
        self.asc_info: Mapping[str, List[float]] = {}
        self.HP_BASE: float = 0
        self.ATK_BASE: float = 0
        self.DEF_BASE: float = 0
        self.HP: float = 0
        self.ATK: float = 0
        self.DEF: float = 0
        self.EXTRA: Sequence[str, float] = ['', 0]
        if 'name' in kwargs.keys():
            self.choose(kwargs['name'])
        if 'lv' in kwargs.keys() and 'asc' in kwargs.keys() and self.name:
            self.set_lv(kwargs['lv'], kwargs['asc'])

    def set_lv(self, lv: int, asc: bool) -> None:
        if not self.name:
            return
        self.lv = lv
        self.asc = self.set_asc(self.lv, asc)
        lv_list = self.__lv_curve[self.rarity]
        self.HP = self.HP_BASE * lv_list[self.lv]
        self.ATK = self.ATK_BASE * lv_list[self.lv]
        self.DEF = self.DEF_BASE * lv_list[self.lv]
        if self.asc:
            self.HP += self.asc_info['HP_BASE'][self.asc-1]
            self.ATK += self.asc_info['ATK_BASE'][self.asc-1]
            self.DEF += self.asc_info['DEF_BASE'][self.asc-1]
            for k in self.asc_info.keys():
                if 'BASE' not in k:
                    self.EXTRA[0] = k
                    self.EXTRA[1] = self.asc_info[k][self.asc-1]
                    break

    def choose(self, name: str) -> None:
        self.name = name
        for c in self.__char_info:
            if c['name'] == name:
                self.rarity = str(c['rarity'])
                self.weapon = c['weapon']
                self.element = c['element']
                self.region = c['region']
                self.HP_BASE = c['HP_BASE']
                self.ATK_BASE = c['ATK_BASE']
                self.DEF_BASE = c['DEF_BASE']
                self.asc_info = c['asc']
                return

    @staticmethod
    def set_asc(lv: int, asc: bool):
        if lv <= 20:
            return (lv + int(asc))//21
        elif (20 < lv < 40):
            return lv // 20
        elif (lv % 10 != 0):
            return lv // 10 - 2
        else:
            return min(lv // 10 - 3 + int(asc), 6)

    def show(self) -> None:
        print('Name:{}\nLv:{}\nHP:{:.3f} / ATK:{:.3f} / DEF:{:.3f} / {}:{:.3f}'.format(
            self.name, self.lv,
            self.HP, self.ATK, self.DEF, self.EXTRA[0], self.EXTRA[1]))


class CharacterAction(object):
    def __init__(self) -> None:
        self.NORMAL_ATK: Callable = None
        self.ELEM_SKILL: Callable = None
        self.ELEM_BURST: Callable = None
        self.PASSIVE: Callable = None
        self.CX: Callable = None
        # self.JUMP


class CharacterAttribute(object):
    def __init__(self) -> None:
        '''
        include panel attributes:\n
        \tATK | DEF | HP | EM | ER | CRIT_RATE | CRIT_DMG\n
        \tHEAL_BONUS | HEAL_INCOME | SHIELD_STRENGTH | CD_REDUCTION\n
        \tELEM_DMG... | ELEM_RES...\n
        and other character attributes:\n
        \tENERGY | STAMINA | STAMINA_CONSUMPTION\n
        \tATK_SPD | MOVE_SPD | INTERRUPT_RES | DMG_REDUCTION\n
        '''
        # panel attributes
        self.ATK: DNode = self.init_ATK()
        self.DEF: DNode = self.init_DEF()
        self.HP: DNode = self.init_HP()
        self.EM = DNode('Total EM', '+')
        self.ER = DNode('Total ER', '+')
        self.CRIT_RATE = DNode('Total CRIT_RATE', '+')
        self.CRIT_DMG = DNode('Total CRIT_DMG', '+')
        self.HEAL_BONUS = DNode('Total HEAL_BONUS', '+')
        self.HEAL_INCOME = DNode('Total HEAL_INCOME', '+')
        self.SHIELD_STRENGTH = DNode('Total SHIELD_STRENGTH', '+')
        self.CD_REDUCTION = DNode('Total CD_REDUCTION', '+')
        self.ANEMO_DMG = DNode('Total ANEMO_DMG', '+')
        self.GEO_DMG = DNode('Total GEO_DMG', '+')
        self.ELECTRO_DMG = DNode('Total ELECTRO_DMG', '+')
        self.HYDRO_DMG = DNode('Total HYDRO_DMG', '+')
        self.PYRO_DMG = DNode('Total PYRO_DMG', '+')
        self.CRYO_DMG = DNode('Total CRYO_DMG', '+')
        self.DENDRO_DMG = DNode('Total DENDRO_DMG', '+')
        self.PHYSICAL_DMG = DNode('Total PHYSICAL_DMG', '+')
        # other attributes
        self.ENERGY: float = 0
        self.STAMINA: float = 0
        self.STAMINA_CONSUMPTION: float = 0
        self.ATK_SPD: float = 0
        self.MOVE_SPD: float = 0
        self.INTERRUPT_RES: float = 0
        self.DMG_REDUCTION: float = 0

    def init_ATK(self) -> DNode:
        root = DNode('Total ATK', '+')
        root.extend([
            DNode('Scaled ATK', '*').extend([
                DNode('ATK Base', '+').extend([
                    DNode('Charater ATK Base'),
                    DNode('Weapon ATK Base')
                ]),
                DNode('ATK Scalers', '+').extend([
                    DNode('Artifact Scalers', '+').extend([
                        DNode('Main Stat Scaler', '+'),
                        DNode('Sub Stat Scaler', '+')
                    ]),
                    DNode('Bonus Scalers', '+'),
                    DNode('Weapon Scaler', '%'),
                    DNode('Ascension Scaler', '%')
                ])
            ]),
            DNode('Flat ATK', '+').extend([
                DNode('Artifact Flat ATKs', '+'),
                DNode('Bonus Flat ATKs', '+')
            ]),
            DNode('Bonus ATK', '+').extend([
                DNode('Skill Transform ATK', '*').extend([
                    DNode('Skill Transform Stat'),
                    DNode('Skill Transform Scaler', '%')
                ]),
                DNode('Weapon Transform ATK', '*').extend([
                    DNode('Weapon Transform Stat'),
                    DNode('Weapon Transform Scaler', '%')
                ])
            ])
        ])
        return root

    def init_DEF(self) -> DNode:
        root = DNode('Total DEF', '+')
        root.extend([
            DNode('Scaled DEF', '*').extend([
                DNode('DEF Base', '+').extend([
                    DNode('Charater DEF Base'),
                ]),
                DNode('DEF Scalers', '+').extend([
                    DNode('Artifact Scalers', '+').extend([
                        DNode('Main Stat Scaler', '+'),
                        DNode('Sub Stat Scaler', '+')
                    ]),
                    DNode('Bonus Scalers', '+'),
                    DNode('Weapon Scaler', '%'),
                    DNode('Ascension Scaler', '%')
                ])
            ]),
            DNode('Flat DEF', '+').extend([
                DNode('Artifact Flat DEFs', '+'),
                DNode('Bonus Flat DEFs', '+')
            ]),
            DNode('Bonus DEF', '+').extend([
                DNode('Skill Transform DEF', '*').extend([
                    DNode('Skill Transform Stat'),
                    DNode('Skill Transform Scaler', '%')
                ]),
                DNode('Weapon Transform DEF', '*').extend([
                    DNode('Weapon Transform Stat'),
                    DNode('Weapon Transform Scaler', '%')
                ])
            ])
        ])
        return root

    def init_HP(self) -> DNode:
        root = DNode('Total HP', '+')
        root.extend([
            DNode('Scaled HP', '*').extend([
                DNode('HP Base', '+').extend([
                    DNode('Charater HP Base'),
                ]),
                DNode('HP Scalers', '+').extend([
                    DNode('Artifact Scalers', '+').extend([
                        DNode('Main Stat Scaler', '+'),
                        DNode('Sub Stat Scaler', '+')
                    ]),
                    DNode('Bonus Scalers', '+'),
                    DNode('Weapon Scaler', '%'),
                    DNode('Ascension Scaler', '%')
                ])
            ]),
            DNode('Flat HP', '+').extend([
                DNode('Artifact Flat HPs', '+'),
                DNode('Bonus Flat HPs', '+')
            ])
        ])
        return root


# def visualize(a) -> None:
#     que: List = []
#     que.append((a, 0))
#     while (que):
#         c, n = que.pop(0)
#         print('\t'*n+'->', f'[{c.key}][{c.func}][ {c.num} ]')
#         if not c.leaf:
#             for i in range(len(c.child)):
#                 que.insert(i, (c.child[i], n+1))

# d = CharacterAttribute()
# visualize(d.DEF)
