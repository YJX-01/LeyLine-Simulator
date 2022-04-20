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
    simulation.set_show_what('warning', 'reject', 'energy')
    simulation.set_energy_options(tolerance=40, full=True)
    simulation.set_enemy(lv=90)

    simulation.set_character('Shogun', lv=90)
    simulation.set_talents('Shogun', norm=6, skill=9, burst=10, cx=2)

    simulation.set_character('Albedo', lv=80, asc=True)
    simulation.set_talents('Albedo', norm=6, skill=9, burst=10, cx=2)

    simulation.set_character('Hutao', lv=90)
    simulation.set_talents('Hutao', norm=10, skill=10, burst=10, cx=2)
    
    simulation.set_character('Jean', lv=90)
    simulation.set_talents('Jean', norm=10, skill=10, burst=10, cx=6)

    w1 = Weapon()
    w1.initialize('Engulfing_Lightning', lv=90, asc=False, refine=5)
    simulation.set_weapon('Shogun', w1)

    w2 = Weapon()
    w2.base.initialize(name='Festering_Desire', lv=90, asc=False, refine=5)
    simulation.set_weapon('Albedo', w2)

    w3 = Weapon()
    w3.initialize('Engulfing_Lightning', lv=90, asc=False, refine=5)
    simulation.set_weapon('Hutao', w3)
    
    w4 = Weapon()
    w4.base.initialize(name='Festering_Desire', lv=90, asc=False, refine=5)
    simulation.set_weapon('Jean', w4)

    art1 = Artifact()
    p1_1 = ArtifactPiece(
        'JUE_YUAN@FLOWER@[HP_CONST]@[ER:17,CRIT_RATE:27,CRIT_DMG:15,ATK_PER:8,]@LV20@STAR5;')
    p2_1 = ArtifactPiece(
        'JUE_YUAN@PLUME@[ATK_CONST]@[CRIT_DMG:17,CRIT_RATE:18,ATK_PER:23,DEF_PER:10,]@LV20@STAR5;')
    p3_1 = ArtifactPiece(
        'JUE_DOU_SHI@SANDS@[ER]@[CRIT_DMG:17,ATK_CONST:8,DEF_PER:24,CRIT_RATE:27,]@LV20@STAR5;')
    p4_1 = ArtifactPiece(
        'JUE_YUAN@GOBLET@[ATK_PER]@[ATK_CONST:8,CRIT_DMG:16,ER:14,CRIT_RATE:22,]@LV20@STAR5;')
    p5_1 = ArtifactPiece(
        'JUE_YUAN@CIRCLET@[CRIT_RATE]@[CRIT_DMG:18,ER:9,ATK_PER:25,EM:15,]@LV20@STAR5;')
    art1.equip(p1_1, p2_1, p3_1, p4_1, p5_1)
    simulation.set_artifact('Shogun', art1)

    art2 = Artifact()
    p1_2 = ArtifactPiece(
        'ZONG_SHI@FLOWER@[HP_CONST]@[ATK_PER:23,CRIT_DMG:27,EM:15,ER:7,]@LV20@STAR5;')
    p2_2 = ArtifactPiece(
        'ZONG_SHI@PLUME@[ATK_CONST]@[HP_PER:8,CRIT_RATE:27,CRIT_DMG:26,HP_CONST:16,]@LV20@STAR5;')
    p3_2 = ArtifactPiece(
        'ZONG_SHI@SANDS@[DEF_PER]@[DEF_CONST:9,CRIT_DMG:32,CRIT_RATE:16,ER:15,]@LV20@STAR5;')
    p4_2 = ArtifactPiece(
        'ZHUI_YI@GOBLET@[GEO_DMG]@[HP_CONST:36,HP_PER:9,CRIT_RATE:29,ATK_PER:10,]@LV20@STAR5;')
    p5_2 = ArtifactPiece(
        'ZONG_SHI@CIRCLET@[CRIT_RATE]@[DEF_CONST:26,ATK_CONST:8,CRIT_DMG:26,ATK_PER:17,]@LV20@STAR5;')
    art2.equip(p1_2, p2_2, p3_2, p4_2, p5_2)
    simulation.set_artifact('Albedo', art2)

    art3 = Artifact()
    p1_3 = ArtifactPiece(
        'ZHUI_YI@FLOWER@[HP_CONST]@[ATK_PER:20,CRIT_DMG:19,ER:28,EM:8,]@LV20@STAR5;')
    p2_3 = ArtifactPiece(
        'ZHUI_YI@PLUME@[ATK_CONST]@[CRIT_RATE:26,ER:18,CRIT_DMG:17,EM:10,]@LV20@STAR5;')
    p3_3 = ArtifactPiece(
        'ZHUI_YI@SANDS@[ATK_PER]@[EM:24,HP_PER:18,CRIT_RATE:10,CRIT_DMG:18,]@LV20@STAR5;')
    p4_3 = ArtifactPiece(
        'QIAN_YAN@GOBLET@[PYRO_DMG]@[HP_PER:17,ATK_PER:9,CRIT_RATE:19,CRIT_DMG:28,]@LV20@STAR5;')
    p5_3 = ArtifactPiece(
        'ZHUI_YI@CIRCLET@[CRIT_RATE]@[CRIT_DMG:34,HP_CONST:8,HP_PER:9,ATK_CONST:14,]@LV20@STAR5;')
    art3.equip(p1_3, p2_3, p3_3, p4_3, p5_3)
    simulation.set_artifact('Hutao', art3)
    
    art4 = Artifact()
    p1_4 = ArtifactPiece(
        'JUE_DOU_SHI@FLOWER@[HP_CONST]@[CRIT_DMG:8,CRIT_RATE:27,ATK_PER:19,DEF_PER:19,]@LV20@STAR5;')
    p2_4 = ArtifactPiece(
        'JUE_DOU_SHI@PLUME@[ATK_CONST]@[ER:10,DEF_CONST:10,CRIT_DMG:35,ATK_PER:28,]@LV20@STAR5;')
    p3_4 = ArtifactPiece(
        'JUE_DOU_SHI@SANDS@[ATK_PER]@[EM:26,CRIT_DMG:8,ER:16,CRIT_RATE:26,]@LV20@STAR5;')
    p4_4 = ArtifactPiece(
        'RAN_XUE@GOBLET@[ANEMO_DMG]@[CRIT_DMG:25,ATK_PER:16,ATK_CONST:19,ER:10,]@LV20@STAR5;')
    p5_4 = ArtifactPiece(
        'JUE_DOU_SHI@CIRCLET@[CRIT_RATE]@[ATK_PER:35,CRIT_DMG:7,ATK_CONST:20,DEF_PER:10,]@LV20@STAR5;')
    art4.equip(p1_4, p2_4, p3_4, p4_4, p5_4)
    simulation.set_artifact('Jean', art4)

    cmds = \
        '''
        1.e@0
        4.c@1
        4.a@2
        4.a@3
        4.a@4
        4.eh@5
        4.er@6.5
        4.q@8
        '''
    cmd_list = []
    for c in cmds.split():
        cmd_list.append(c.strip())
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
    # p.print_char_log('Shogun', ['ATK', 'ER', 'ELECTRO_DMG', 'EM'])
    # p.print_char_log('Albedo', ['ATK', 'DEF', 'CRIT_RATE'])
    # p.print_char_log('Hutao', ['ATK'])
    # p.print_char_log('Jean', ['ATK'])
    p.print_energy_log()
    # p.print_damage_one('Shogun')
    # p.print_damage_one('Albedo')
    # p.print_damage_one('Hutao')
    p.print_damage_one('Jean')
    # p.print_heal_one('Hutao')
    p.print_heal_one('Jean')
    p.print_damage_pie()

    sp = SimPrinter(simulation)
    sp.print_action(['Shogun', 'Albedo', 'Hutao', 'Jean'], stage)
    # sp.print_buffs(stage)
    # sp.print_element()
    # sp.print_energy(stage)
