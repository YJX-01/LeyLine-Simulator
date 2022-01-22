from core.simulation import *
from core.entities.character import *


if __name__ == '__main__':
    '''
    # TODO 测试文件待删除

    测试逻辑的入口
    '''
    print('START A SIMPLE SIMULATION!')
    simulation = Simulation()
    simulation.set_character('Aloy', 90, False)
    simulation.set_character('Albedo', 80, True)
    simulation.insert(Operation('Albedo.E@1', simulation.constraint_track))
    simulation.start()
