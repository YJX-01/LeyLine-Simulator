'''
# TODO 测试文件待删除

测试逻辑的入口
'''


from core.simulation import Simulation, Operation
from data.characters import get_character


if __name__ == '__main__':
    print('start a SIMPLE simulation!')
    simulation = Simulation()

    # TODO 模拟的配置项以后从UI界面录入
    simulation.set_party(
        [get_character({'name': "Albedo", 'level': 90, 'asc': 6})])
    simulation.set_operation_track(
        [
            Operation({'time': 6, 'character_index': 0,
                      'command': 'skill.e'}),
            Operation({'time': 0, 'character_index': 0,
                      'command': 'skill.e'}),
            Operation({'time': 2, 'character_index': 0,
                      'command': 'jump'}),
            Operation({'time': 1, 'character_index': 0,
                      'command': 'talent.1'}),
            Operation({'time': 3, 'character_index': 0,
                       'command': 'constellation.1'})
        ]
    )
    simulation.start_calculate()
