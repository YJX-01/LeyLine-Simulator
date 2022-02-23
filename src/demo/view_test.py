from core.simulation import *
from core.entities.character import *
from core.visualize.log_view import LogPrinter


if __name__ == '__main__':
    '''
    # TODO 测试文件待删除

    测试逻辑的入口
    '''
    print('START A SIMPLE SIMULATION!')
    simulation = Simulation()
    simulation.set_show_what('all')

    simulation.set_character('Albedo', 80, True)
    simulation.set_talents('Albedo', 6, 6, 6)
    w = Weapon()
    w.base.initialize(name='Favonius_Sword', lv=80, asc=False)
    simulation.set_weapon('Albedo', w)
    arts = Artifact()
    p1 = ArtifactPiece(
        'QIAN_YAN@FLOWER@[HP_CONST]@[ATK_CONST:9,CRIT_DMG:14,ER:17,HP_PER:36,]@LV20@STAR5;')
    p2 = ArtifactPiece(
        'QIAN_YAN@PLUME@[ATK_CONST]@[HP_CONST:17,ER:18,CRIT_DMG:16,ATK_PER:19,]@LV20@STAR5;')
    p3 = ArtifactPiece(
        'QIAN_YAN@SANDS@[HP_PER]@[ER:17,HP_CONST:7,CRIT_RATE:36,EM:8,]@LV20@STAR5;')
    p4 = ArtifactPiece(
        'ZONG_SHI@GOBLET@[HP_PER]@[ER:39,ATK_CONST:7,ATK_PER:16,CRIT_DMG:8,]@LV20@STAR5;')
    p5 = ArtifactPiece(
        'QIAN_YAN@CIRCLET@[HP_PER]@[EM:19,ER:18,DEF_CONST:10,ATK_CONST:25,]@LV20@STAR5;')
    arts.equip(p1, p2, p3, p4, p5)
    simulation.set_artifact('Albedo', arts)

    cmd_list = [
        '1.A@1',
        '1.E@2',
        '1.E@3',
        '1.Q@4',
        '1.Q@5',
        '1.A@6',
        '1.E@20'
    ]
    list(map(lambda s: simulation.insert(Operation(s)),
             cmd_list))
    import time
    import pprint
    t1 = time.perf_counter()
    simulation.start()
    t2 = time.perf_counter()
    print(1/(t2-t1))

    numeric_controller = NumericController()
    p = LogPrinter(numeric_controller)
    p.print_char_log('Albedo', ['ATK', 'DEF',
                     'CRIT_RATE', 'CRIT_DMG', 'EM'])
