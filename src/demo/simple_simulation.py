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
    cmd_list = [
        'Albedo.A@1',
        'Albedo.A@2',
        'Albedo.A@2.5',
        'Albedo.A@3',
        'Albedo.A@3.5',
        'Albedo.A@4',
        'Albedo.E@5',
        'Albedo.A@6',
        'Albedo.A@8',
        'Albedo.E@9',
        'Albedo.E@20'
    ]
    list(map(lambda s: simulation.insert(Operation(s)),
             cmd_list))
    simulation.start()
