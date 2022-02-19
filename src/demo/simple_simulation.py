from core.simulation import *
from core.entities.character import *


if __name__ == '__main__':
    '''
    # TODO 测试文件待删除

    测试逻辑的入口
    '''
    print('START A SIMPLE SIMULATION!')
    simulation = Simulation()
    simulation.set_character('Albedo', 80, True)
    simulation.set_talents('Albedo', 6, 6, 6)
    cmd_list = [
        '1.A@1',
        '1.A@2',
        '1.A@2.5',
        '1.A@3',
        '1.A@3.5',
        '1.A@4',
        '1.E@5',
        '1.A@6',
        '1.A@8',
        '1.E@9',
        '1.A@12',
        '1.E@13',
        '1.Q@14',
        '1.A@15'
    ]
    list(map(lambda s: simulation.insert(Operation(s)),
             cmd_list))
    simulation.start()
