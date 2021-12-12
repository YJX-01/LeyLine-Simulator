'''
# TODO 测试文件待删除

测试逻辑的入口
'''


from core.simulation import Simulation, Operation
from data.characters.aloy.aloy import get_character_aloy


if __name__ == '__main__':
    print('start a SIMPLE simulation!')
    simulation = Simulation()

    # TODO 模拟的配置项以后从UI界面录入
    simulation.set_party([get_character_aloy({})])
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
                      'skill_key': 'normal_ATK_1_hit'})
        ]
    )
    simulation.start_calculate()
