import json
from attribute import *
from condition import *
from event import ActionEvent


class Albedo():
    __data_path = './'
    __data = {}

    def __init__(self):
        with open(self.__data_path, 'r') as data:
            self.__data = data
        self.__attribute = Attribute()

    def action(self, cmd: str):
        try:
            cmd_lst = cmd.split('.', 1)
            cmd_type, next_cmd = cmd_lst[0], cmd_lst[1]
        except:
            return {'action': 'null'}
        else:
            if cmd_type == 'norm_atk':
                self.norm_atk(next_cmd)
            elif cmd_type == 'elem_skill':
                self.elem_skill(next_cmd)
            elif cmd_type == 'elem_burst':
                self.elem_burst(next_cmd)
            elif cmd_type == 'jump':
                self.jump(next_cmd)
            elif cmd_type == 'sprint':
                self.sprint(next_cmd)
            elif cmd_type == 'switch':
                self.switch(next_cmd)
            else:
                return {'action': 'unknown'}

    def norm_atk(self, cmd: str) -> dict:
        try:
            cmd_lst = cmd.split('.', 1)
            cmd_type, next_cmd = cmd_lst[0], cmd_lst[1]
        except:
            return {'action.norm_atk': 'null'}
        else:
            if cmd_type == 'hit1':
                if next_cmd == 'condition':
                    def f_hit1(): return True
                    hit1_condition = Condition('hit1.condition',
                                               ['timeline.happening.action_event'], f_hit1)
                    return hit1_condition
                elif next_cmd == 'deal':
                    event_data = self.__data['norm_atk']['hit1']['event']
                    return ActionEvent()
                elif next_cmd == 'numeric':
                    data =  self.__data['norm_atk']['hit1'].copy()
                    data.pop('event')
                    data['stat'] = data['stat'][self.__attribute.skill_level-1]
                    return data
            elif cmd_type == 'hit2':
                pass
            elif cmd_type == 'hit3':
                pass
            elif cmd_type == 'hit4':
                pass
            elif cmd_type == 'hit5':
                pass
            elif cmd_type == 'charge':
                pass
            elif cmd_type == 'plunge_low':
                pass
            elif cmd_type == 'plunge_low':
                pass
            else:
                return {'action.norm_atk': 'unknown'}

    def elem_skill(self, cmd: str):
        pass

    def elem_burst(self, cmd: str):
        pass

    def auto(self, cmd: str = ''):
        if not cmd:
            pass
        else:
            pass
