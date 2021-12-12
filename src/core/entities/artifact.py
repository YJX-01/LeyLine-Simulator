from enum import Enum

class ArtifactType(Enum):
    FLOWER = 1
    PLUME = 2
    SANDS = 3
    GOBLET = 4
    CIRCLET = 5

class StatType(Enum):
    atk_percent = 1
    atk_const = 2
    def_percent = 3
    def_const = 4
    hp_percent = 5
    hp_const = 6
    EM = 7
    ER = 8
    crit_rate = 9
    crit_damage = 10
    heal_bonus = 11
    anemo_bonus = 12
    geo_bonus = 13
    electro_bonus = 14
    hydro_bonus = 15
    pyro_bonus = 16
    cryo_bonus = 17
    physical_bonus = 18
    dendro_bonus = 19

class Artifact:
    name = 'A FLOWER'
    artifact_type = ArtifactType.FLOWER
    main_stat = StatType.hp_const
    sub_stat = []

