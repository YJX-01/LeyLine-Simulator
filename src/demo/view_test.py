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
    simulation.set_show_what('numeric', 'warning')

    simulation.set_character('Shogun', 80, True)
    simulation.set_talents('Shogun', 6, 6, 6)
    w = Weapon()
    w.initialize('Engulfing_Lightning', 80, False, 1)
    simulation.set_weapon('Shogun', w)
    arts = Artifact()
    p1 = ArtifactPiece(
        'JUE_YUAN@FLOWER@[HP_CONST]@[ER:17,CRIT_RATE:27,CRIT_DMG:15,ATK_PER:8,]@LV20@STAR5;')
    p2 = ArtifactPiece(
        'JUE_YUAN@PLUME@[ATK_CONST]@[DEF_CONST:19,CRIT_DMG:16,ER:7,CRIT_RATE:25,]@LV20@STAR5;')
    p3 = ArtifactPiece(
        'JUE_YUAN@SANDS@[ER]@[HP_CONST:17,CRIT_DMG:28,HP_PER:9,ATK_PER:15,]@LV20@STAR5;')
    p4 = ArtifactPiece(
        'JUE_YUAN@GOBLET@[ELECTRO_DMG]@[ATK_PER:8,CRIT_RATE:28,DEF_CONST:23,ATK_CONST:16,]@LV20@STAR5;')
    p5 = ArtifactPiece(
        'JUE_YUAN@CIRCLET@[CRIT_RATE]@[ER:17,DEF_CONST:26,ATK_CONST:18,CRIT_DMG:19,]@LV20@STAR5;')
    arts.equip(p1, p2, p3, p4, p5)
    simulation.set_artifact('Shogun', arts)

    cmd_list = [
        '1.A@1',
        '1.Q@2',
        '1.A@3',
        '1.E@4',
        '1.A@18',
        '1.Q@22',
        '1.A@23',
        '1.E@24'
    ]
    list(map(lambda s: simulation.insert(Operation(s)),
             cmd_list))
    import time
    t1 = time.perf_counter()
    simulation.start(30)
    t2 = time.perf_counter()
    print(1/(t2-t1))

    numeric_controller = NumericController()
    p = LogPrinter(numeric_controller)
    p.print_char_log('Shogun', ['ER'])
    p.print_energy_log()
    p.print_damage_log(['Shogun'])
