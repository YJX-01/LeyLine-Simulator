'''
# TODO 测试文件待删除

测试逻辑的入口
'''


from core.simulation import Simulation, Operation
from data.characters.aloy.aloy import get_character_aloy
from data.characters.albedo.albedo import get_character_albedo


if __name__ == '__main__':
    print('start a SIMPLE simulation!')
    simulation = Simulation()

    # TODO 模拟的配置项以后从UI界面录入
    simulation.set_party([get_character_aloy({'name': "Aloy", 'level': 80, 'asc': 5}),
                          get_character_albedo({'name': "Albedo", 'level': 90, 'asc': 6})])
    simulation.set_operation_track(
        # 测试一下乱序插入是否能正确执行
        [
            Operation({'time': 6, 'character_index': 0,
                      'skill_key': 'normal_ATK_1_hit'}),
            Operation({'time': 0, 'character_index': 0,
                      'skill_key': 'normal_ATK_1_hit'}),
            Operation({'time': 2, 'character_index': 0,
                      'skill_key': 'normal_ATK_1_hit'}),
            Operation({'time': 1, 'character_index': 0,
                      'skill_key': 'normal_ATK_1_hit'}),
            Operation({'time': 3, 'character_index': 1,
                       'skill_key': 'normal_ATK_1_hit'})
        ]
    )
    simulation.start_calculate()
