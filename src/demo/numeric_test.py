from core.simulation import *
from core.entities.character import *

if __name__ == '__main__':
    '''
    # TODO 测试文件待删除

    测试数值系统
    '''
    a = Character()
    a.initialize(name='Zhongli', lv=90, asc=False)
    arts = Artifact()
    p1 = ArtifactPiece('QIAN_YAN@FLOWER@[HP_CONST]@[ATK_CONST:9,CRIT_DMG:14,ER:17,HP_PER:36,]@LV20@STAR5;')
    p2 = ArtifactPiece('QIAN_YAN@PLUME@[ATK_CONST]@[HP_CONST:17,ER:18,CRIT_DMG:16,ATK_PER:19,]@LV20@STAR5;')
    p3 = ArtifactPiece('QIAN_YAN@SANDS@[HP_PER]@[ER:17,HP_CONST:7,CRIT_RATE:36,EM:8,]@LV20@STAR5;')
    p4 = ArtifactPiece('ZONG_SHI@GOBLET@[HP_PER]@[ER:39,ATK_CONST:7,ATK_PER:16,CRIT_DMG:8,]@LV20@STAR5;')
    p5 = ArtifactPiece('QIAN_YAN@CIRCLET@[HP_PER]@[EM:19,ER:18,DEF_CONST:10,ATK_CONST:25,]@LV20@STAR5;')
    arts.equip(p1,p2,p3,p4)
    a.equip(arts)
    pan = ArtifactPanel(a)
    print(pan.ATK(), pan.DEF(), pan.HP())