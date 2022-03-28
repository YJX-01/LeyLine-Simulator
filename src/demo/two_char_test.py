from core.simulation import *
from core.entities.character import *
from core.visualize.log_view import LogPrinter
from core.visualize.sim_view import SimPrinter


if __name__ == '__main__':
    '''
    # TODO 测试文件待删除

    测试逻辑的入口
    '''
    print('START A SIMPLE SIMULATION!')
    simulation = Simulation()
    simulation.set_show_what('numeric', 'warning', 'reject')
    simulation.set_energy_options(tolerance=40, full=True)
    simulation.set_enemy(lv=90)

    simulation.set_character('Shogun', lv=90)
    simulation.set_talents('Shogun', norm=6, skill=9, burst=10, cx=2)

    simulation.set_character('Albedo', lv=80, asc=True)
    simulation.set_talents('Albedo', norm=6, skill=9, burst=10, cx=2)

    w = Weapon()
    w.base.initialize(name='Festering_Desire', lv=90, asc=False, refine=5)
    simulation.set_weapon('Albedo', w)

    w2 = Weapon()
    w2.initialize('Engulfing_Lightning', lv=90, asc=False, refine=5)
    simulation.set_weapon('Shogun', w2)

    arts = Artifact()
    p1 = ArtifactPiece(
        'JUE_YUAN@FLOWER@[HP_CONST]@[ER:17,CRIT_RATE:27,CRIT_DMG:15,ATK_PER:8,]@LV20@STAR5;')
    p2 = ArtifactPiece(
        'JUE_YUAN@PLUME@[ATK_CONST]@[CRIT_DMG:17,CRIT_RATE:18,ATK_PER:23,DEF_PER:10,]@LV20@STAR5;')
    p3 = ArtifactPiece(
        'JUE_DOU_SHI@SANDS@[ER]@[CRIT_DMG:17,ATK_CONST:8,DEF_PER:24,CRIT_RATE:27,]@LV20@STAR5;')
    p4 = ArtifactPiece(
        'JUE_YUAN@GOBLET@[ATK_PER]@[ATK_CONST:8,CRIT_DMG:16,ER:14,CRIT_RATE:22,]@LV20@STAR5;')
    p5 = ArtifactPiece(
        'JUE_YUAN@CIRCLET@[CRIT_RATE]@[CRIT_DMG:18,ER:9,ATK_PER:25,EM:15,]@LV20@STAR5;')
    arts.equip(p1, p2, p3, p4, p5)
    simulation.set_artifact('Shogun', arts)

    art2 = Artifact()
    p1_ = ArtifactPiece(
        'ZONG_SHI@FLOWER@[HP_CONST]@[ATK_PER:23,CRIT_DMG:27,EM:15,ER:7,]@LV20@STAR5;')
    p2_ = ArtifactPiece(
        'ZONG_SHI@PLUME@[ATK_CONST]@[HP_PER:8,CRIT_RATE:27,CRIT_DMG:26,HP_CONST:16,]@LV20@STAR5;')
    p3_ = ArtifactPiece(
        'ZONG_SHI@SANDS@[DEF_PER]@[DEF_CONST:9,CRIT_DMG:32,CRIT_RATE:16,ER:15,]@LV20@STAR5;')
    p4_ = ArtifactPiece(
        'ZHUI_YI@GOBLET@[GEO_DMG]@[HP_CONST:36,HP_PER:9,CRIT_RATE:29,ATK_PER:10,]@LV20@STAR5;')
    p5_ = ArtifactPiece(
        'ZONG_SHI@CIRCLET@[CRIT_RATE]@[DEF_CONST:26,ATK_CONST:8,CRIT_DMG:26,ATK_PER:17,]@LV20@STAR5;')
    art2.equip(p1_, p2_, p3_, p4_, p5_)
    simulation.set_artifact('Albedo', art2)

    cmd_list = [
        '1.a@0.5',
        '2.c@1',
        '2.e@2',
        '2.a@3',
        '2.q@4',
        '1.c@5',
        '1.e@6',
        '1.q@8.1',
        '1.a@10',
        '1.a@11',
        '1.a@12',
        '1.z@13',
        '2.c@14',
        '2.a@15',
        '2.z@16',
        '2.e@17',
        '2.q@18'
    ]
    list(map(lambda s: simulation.insert(Operation(s)),
             cmd_list))
    import time
    t1 = time.perf_counter()
    simulation.start()
    t2 = time.perf_counter()
    print('freq={:.1f}'.format(1/(t2-t1)))

    numeric_controller = NumericController()
    stage = numeric_controller.onstage_record()

    p = LogPrinter(numeric_controller)
    p.paint_color(simulation)
    p.print_char_log('Shogun', ['ATK', 'ER', 'ELECTRO_DMG', 'EM'])
    p.print_char_log('Albedo', ['ATK', 'DEF'])
    p.print_energy_log()
    p.print_damage_one('Shogun')
    p.print_damage_one('Albedo')
    p.print_damage_pie()

    sp = SimPrinter(simulation)
    sp.print_action(['Shogun', 'Albedo'], stage)
    sp.print_buffs(stage)
    sp.print_element()
    sp.print_energy(stage)
