'''
# TODO 测试文件待删除

测试逻辑的入口
'''


from core.simulation import *
from core.entities.character import *


if __name__ == '__main__':
    print('start a SIMPLE simulation!')
    simulation = Simulation()

    # TODO 模拟的配置项以后从UI界面录入
    simulation.set_character('Aloy', 90, False)
    simulation.set_character('Albedo', 80, True)
    simulation.insert(Operation('Albedo.E', simulation.constraint_track))
    simulation.start()
