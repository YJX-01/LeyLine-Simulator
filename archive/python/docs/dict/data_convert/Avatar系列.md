# Avatar 系列文件 JSON 含义

文件包含

-   AvatarExcelConfigData.json
-   AvatarPromoteExcelConfigData.json
-   AvatarCurveExcelConfigData.json

## AvatarExcelConfigData.json

包含角色基础信息

| key             | 含义              | 备注                                                                                                        |
| --------------- | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| IconName        | 可以视为角色名    | 部分名字并非官方角色名                                                                                      |
| BodyType        | 角色体型          |                                                                                                             |
| QualityType     | 角色星级          | QUALITY_ORANGE=5, QUALITY_PURPLE=4                                                                          |
| InitialWeapon   | 使用武器类型 id   | 只有第二位有别,例如 14101 为 4,代表法器(详见常见词含义表)                                                   |
| WeaponType      | 使用武器类型      | (详见常见词含义表)                                                                                          |
| AvatarPromoteId | 角色突破数据 id   | 2 是重复键值                                                                                                |
| SkillDepotId    | 角色技能数据库 id |                                                                                                             |
| HpBase          | 基础生命          | 小于 720，或大于 2000 是坏值                                                                                |
| AttackBase      | 基础攻击          | 小于 7.5 是坏值                                                                                             |
| DefenseBase     | 基础防御          | 小于 40 是坏值                                                                                              |
| Critical        | 基础暴击          | 均为 0.05                                                                                                   |
| CriticalHurt    | 基础爆伤          | 均为 0.5                                                                                                    |
| PropGrowCurves  | 角色数值增长曲线  | Type: 数值类型, GrowCurve: 数值的成长曲线. 三种值使用曲线相同(成长曲线详见 AvatarCurveExcelConfigData.json) |

## AvatarPromoteExcelConfigData.json

角色突破数据

| key                 | 含义               | 备注                             |
| ------------------- | ------------------ | -------------------------------- |
| AvatarPromoteId     | 角色突破数据 id    | 2 是重复键值                     |
| PromoteLevel        | 突破等级           | 不存在时该数据无效               |
| ScoinCost           | 突破花费摩拉数     |                                  |
| CostItems           | 突破花费材料列表   |                                  |
| UnlockMaxLevel      | 突破后等级上限     |                                  |
| AddProps            | 突破提升数值       | PropType: 提升类型 Value: 提升值 |
| RequiredPlayerLevel | 需要玩家的冒险等级 |                                  |

## AvatarCurveExcelConfigData.json

角色成长曲线

| key        | 含义                   | 备注                    |
| ---------- | ---------------------- | ----------------------- |
| Level      | 等级                   |                         |
| CurveInfos | 该等级下等级乘数的信息 |                         |
| Type       | 曲线类型               |                         |
| Value      | 值                     | 一般 S4 S5 的值分别相同 |
