# schema

共享Zod契约与推导类型。按common、content、account、project、exchange、protocol拆分；包根导出当前契约，`@leyline/schema/enka`是外部Enka输入契约。契约不依赖UI、平台或旧实现。目录职责见[仓库地图](../../docs/architecture.md#模块职责)。

- [文件与存储契约](#文件与存储契约)

当前文件版本、存储命名空间及字段语义见下文。

## 文件与存储契约

当前运行校验定义在src/exchange、src/account及src/project，应用操作遵循[文件与状态规范](../../docs/files-and-state.md)。

| 文档 | 当前契约 |
| --- | --- |
| 角色定义 | schemaVersion=2、kind=character-definition，直接根对象 |
| 账号、轴项目、定义库 | 当前v2封装及各自kind |
| 轴项目 | rulesVersion=timeline-v1，calculationProfile为direct或dependency |
| 独立计算器 | schemaVersion=1、kind=damage-calculator，project、可选baseline、actorId及可选recordId；最大8MiB |
| 浏览器账号、恢复、配置、队伍、定义库 | 各自当前v2存储命名空间 |
| 收藏、密度与独立组合 | 使用各自现行格式；键名版本按实际所属契约判断 |

读取按当前严格schema校验，旧版本标签或退休字段返回拒绝，当前编辑保留。磁盘文件及旧存储字节由用户维护，显式替换前完成备份。角色培养中的退休hpRatio字段按严格契约拒绝，生命条件由项目上下文提供。

计算器的actorId须指向有Build的队员，recordId须指向项目中的伤害记录。保存设定与快照，重开重新求值。内容更新通过显式审阅采用，文件打开保持自身定义。

kind=capture的独立记录关联同队员技能与合法时间，其定义无公式和效果，记录无damage。来源与命中的先后依order明确；before/after阶段按捕获契约执行。当前命中可以明确关联自身before阶段，自身after作为来源时拒绝；同刻缺order保持待确认，ID用于稳定排序而非补足依赖事实。

combatStates包含id、actor、startMs、endMs、values；值支持hpRatio、onField、shielded及明确null。damage.conditions覆盖当前队员，stateOverrides按actor覆盖上下文中其他队员，重复字段覆盖拒绝。stateReads保留实际查询及intervalId、source和值。

damage.reaction为none、null或严格type/trigger对象；反应规则快照在Build.reactionRules。damage.capture关联recordId与phase；damage.inputs提供本技能输入；damage.effectApplications关联instanceId与active。

CharacterDefinition.damageCoverage随内容快照保存，内置复制为自定义或倍率编辑后清除原覆盖证明。当前查询覆盖检查实体revision、skillId、命中索引、最高命座和全部相关分支。

武器passive.kind=none须有逐件来源，同时要求修饰和combatRules为空；字段缺失保留缺件状态。培养、反应规则及来源适用事实分别按各自契约校验。

人类可读JSON统一由formatJson输出两空格缩进和末尾换行；存储和生成块按各自格式使用紧凑JSON。
