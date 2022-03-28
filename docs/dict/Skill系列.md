# Skill 系列文件 JSON 含义

文件包含

-   AvatarSkillExcelConfigData.json
-   AvatarSkillDepotExcelConfigData.json
-   ProudSkillExcelConfigData.json

## AvatarSkillExcelConfigData.json

技能基础值数据

| key               | 含义                    | 备注                                                   |
| ----------------- | ----------------------- | ------------------------------------------------------ |
| Id                | 下文中的 config id      | 一般为 5 到 6 位数，1 或 2 开头                        |
| SkillIcon         | 技能图标（技能名）      | Skill_S 是元素战技，Skill_E 是元素爆发，Skill_A 是普攻 |
| CdTime            | 冷却时间                |                                                        |
| CostElemVal       | 消耗元素能量            |                                                        |
| CostElemType      | 消耗元素能量类型        |                                                        |
| ProudSkillGroupId | 下文中的 proud skill id |                                                        |

## AvatarSkillDepotExcelConfigData.json

角色技能数据库信息

| key            | 含义            | 备注                                                               |
| -------------- | --------------- | ------------------------------------------------------------------ |
| Id             | 数据库 id       | 对应角色基础值里的 SkillDepotId                                    |
| EnergySkill    | 元素爆发技能 id | 技能在 AvatarSkillExcelConfigData.json 中的 config id，一般 5 位数 |
| Skills         | 其他技能 id     | 见下文                                                             |
| TalentStarName | 角色名称        |                                                                    |

关于"Skills":

-   列表第 0 项是普攻 id(6 位，config id)
-   第 1 项是元素战技 id(5 位，config id)
-   第 2 项是特殊移动方式的 id(5 位，config id)(绫华、莫娜)

## ProudSkillExcelConfigData.json

技能具体值数据

| key               | 含义                | 备注                     |
| ----------------- | ------------------- | ------------------------ |
| ProudSkillGroupId | 上文 proud skill id | 一般为 4 位,为主要定位键 |
| Level             | 技能等级            |                          |
| ProudSkillId      | proud skill id + lv |                          |
| ParamList         | 技能的具体值        | 对应位置没有统一格式     |
