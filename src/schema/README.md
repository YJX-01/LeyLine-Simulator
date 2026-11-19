# schema

共享Zod契约与推导类型。按common、content、account、project、exchange、protocol拆分；包根导出当前契约，`@leyline/schema/enka`是外部Enka输入契约。契约不依赖UI、平台或旧实现。目录职责见[仓库地图](../../docs/architecture.md#模块职责)。

- [文件与存储契约](#文件与存储契约)
- [结构化纯公式](#结构化纯公式)
- [结构化内容与配装契约](#结构化内容与配装契约)

当前文件版本、存储命名空间及字段语义见下文。

## 文件与存储契约

当前运行校验定义在src/exchange、src/account及src/project，应用操作遵循[文件与状态规范](../../docs/files-and-state.md)。

| 文档 | 当前契约 |
| --- | --- |
| 角色定义 | schemaVersion=3、kind=character-definition，直接根对象 |
| 账号、轴项目 | schemaVersion=5，拒绝旧版文档 |
| 定义库 | schemaVersion=2、kind=definition-library |
| 轴项目 | rulesVersion=timeline-v1，calculationProfile为direct或dependency |
| 独立计算器 | schemaVersion=4、kind=damage-calculator，project、可选baseline、actorId及可选recordId；最大8MiB |
| 浏览器账号、恢复、角色配置、队伍 | 各自当前v5存储命名空间 |
| 浏览器定义库 | 当前v2存储命名空间 |
| 收藏、密度与独立组合 | 使用各自现行格式；键名版本按实际所属契约判断 |

读取按当前严格schema校验，旧版本标签或退休字段返回拒绝，当前编辑保留。磁盘文件及旧存储字节由用户维护，显式替换前完成备份。角色培养中的退休hpRatio字段按严格契约拒绝，生命条件由项目上下文提供。

计算器的actorId须指向有Build的队员，recordId须指向项目中的伤害记录。保存设定与快照，重开重新求值。内容更新通过显式审阅采用，文件打开保持自身定义。

kind=capture的独立记录关联同队员技能与合法时间，其定义无公式和效果，记录无damage。来源与命中的先后依order明确；before/after阶段按捕获契约执行。当前命中可以明确关联自身before阶段，自身after作为来源时拒绝；同刻缺order保持待确认，ID用于稳定排序而非补足依赖事实。

combatStates包含id、actor、startMs、endMs、values；值支持hpRatio、onField、shielded及明确null。damage.conditions覆盖当前队员，stateOverrides按actor覆盖上下文中其他队员，重复字段覆盖拒绝。stateReads保留实际查询及intervalId、source和值。

damage.reaction为none、null或严格type/trigger对象；Build.reactionRules为版本2等级表/来源快照，algorithmRevision=1只选择引擎固定算法，拒绝外部反应常数覆盖。damage.capture关联recordId与phase；damage.inputs提供本技能输入；damage.effectApplications关联instanceId与active。

正式查询使用skillId、hitId、outputId定位结果。计算支持按实体修订、命座和相关依赖闭包核验。复制为自定义并修改倍率后按新内容计算，证明状态按自定义来源核验。

武器passive.kind=none须有逐件来源，同时要求修饰和combatRules为空；字段缺失保留缺件状态。培养、反应规则及来源适用事实分别按各自契约校验。

人类可读JSON统一由formatJson输出两空格缩进和末尾换行；存储和生成块按各自格式使用紧凑JSON。

## 结构化纯公式

calculation/values.ts 定义精确 namespace/id/revision、数量、布尔及枚举。次数和毫秒为非负安全整数；比例使用 scalar。template.ts只接受schemaVersion=2的模板配置：精确身份、模板id/revision、有限类型参数与来源。输入签名、运算、输出、阶段及端口由TS模板产生；外部nodes、inputs、outputs、stages、modifierPorts及脚本字段拒绝。内容参数仍以角色定义为唯一真值。

calculation/json.ts 在8 MiB及深度预算内先检查重复对象成员，再解析严格JSON；对象调用也先拒绝结构循环、访问器和超深结构。诊断使用转义后的JSON Pointer。显式null保持未知，纯数学可选参数可声明中性默认值。

calculation/bundle.ts当前schemaVersion/runtimeVersion均为2，要求fixed-templates-v1；接受模板配置、精确版本表、聚合、属性、效果和来源数据闭包，旧运算图库版本拒绝；aggregate.ts 声明逐人公式、排序依据、权重及独立/联合概率输入。binding.ts 明确施加者、受益者、贡献者、参数、事实及属性读取时间。current.phase=same沿用调用阶段；before/after为明确阶段，capture必须关联声明的捕获槽。

effect.ts 定义解锁、接收者、动作/命中筛选、伤害族、时效、适用事实、优先级及叠加规则。context.ts 保存有类型的角色/目标输入、来源事实、有效天赋等级、明确事件、状态区间和单次覆盖。生命比例范围、站场/护盾布尔类型、区间重叠及重复覆盖分别校验。缺失与显式null均不能自动成为false或0。

coverage.ts定义按具体输出范围的覆盖记录、最高命座、机制处理和证据层次，非空覆盖记录须声明coverage-v1。来源、规则与完整身份须可解析；声明完整的记录不能同时列出未实现机制。无规则装备可使用空公式闭包。非空stateMachines仍不接受；有限状态机和全目录机制闭合尚待实现。未知操作与能力不做运行时回退。

query.ts 区分技能命中与事件输出请求。独立反应描述允许空技能/命中/攻击类别，多人聚合无需伪造施放者；输出用eventId+outputId定位。CalculationSelection明确选择单个输出或事件合计，缺失/失效选择拒绝。装备占用按明确账号与库存物品身份检查，返回独立feasibility；缺账号及脱离库存的快照保持unknown。StructuredDamageEvaluation保留逐输出、事件合计、追踪、所需事实与聚合状态，数学execution和库存冲突分开。

bound-aggregate.ts约束逐贡献者公式、读取帧、资格及概率事实绑定，要求各自读取自己的配装并共享事件、目标和阶段。概率值由受限Binding读取；crit-rate与普通probability明确区分，独立和联合模型保持显式。事件的bound-aggregate分支要求bound-aggregate-v1，不接受手工贡献值替代已声明绑定。

## 结构化内容与配装契约

content/calculation.ts约束实体拥有的计算定义与ruleIds；维护来源可显式引用两个公共库，装配后必须完整编译。单文件交换的v3角色须携带可达数据闭包及模板精确版本，不能依赖目录回退；运行时缺算法版本明确拒绝，不执行文件内代码。

talents.hits中的基数及输出使用完整模板身份与受校验的Binding。输出BoundFormula可声明布尔predicate，未知条件保持未知，明确不满足时拒绝该输出。参数、捕获和离线闭包校验包含该条件。

actor-state只读取已提供队员的突破、命座和精炼；team-count按队员identity中的元素身份计算，缺身份保持未知并保留来源。没有突破门槛的被动以unlockAscension:null表达，其规则按自身activation执行；不为星耀祝礼额外增加突破门槛。

content/artifact-rarity.ts统一四/五星输入边界。Build.artifactMain按"4"/"5"、属性、强化等级寻址，分别17/21项，禁止单表或跨星级补配；套装rarities保留来源集合，rarity仅为目录最高星级投影。四星强化0–16，初始2/3条，完整rolls总量与等级一致；五星保留0–20及现行输入语义。上限校验与合法历史推定不等同于玩家观测。

content/structured-content.ts定义v3角色、武器和套装快照。角色参数按技能唯一保存，命中使用稳定id、参数绑定、捕获槽及命名输出；未审阅命中保留身份和原参数关系，不填充猜测的完整伤害公式。属性面板通过attributes.outputs显式引用类型和单位相符的actor属性，导出时一起保留。

calculation.bundle保存自身依赖，ruleIds关联精确效果身份。被动、命座、套装件数与效果解锁条件一致；覆盖记录须属于相同实体和对应命中/件数范围。技能输入携带明确数量类型、范围、整数要求和命座上限。

account/structured-build.ts接收v3 calculation-build，携带v3内容、培养、主词条表、来源和实物引用。artifact.inventory为明确的accountId与itemId组合，或null。当前账号、轴项目及计算器均使用该配装契约。

## 动作与事件状态契约

content/actions.ts定义可选character-actions版本1：自身identity、精确character引用、稳定actions及技能/命中/输出引用、来源、状态机和具体缺口。durationMs、cancelAfterMs、offsetsMs中的null表示未采用时刻，不能当作零。动作只引用角色伤害与参数；game-data维护manifest版本2，显式枚举实际存在的动作文件。

calculation/state-machine.ts约束event-state修订1。普通值可有单一时效；stacked必须有正整数容量、零清除值和逐层时效。同阶段priority必须唯一，不用ID裁定顺序。条件和时效使用同一BoundFormula，状态更新限于set/add/consume/clear/unknown；独立层数的逐层消耗未声明顺序时拒绝。容量未知可给已核验下界，超过可证明范围保持未知；缺口不会增加默认规则。

请求携带ownerId、targetId、startMs和显式initial。普通状态用expiresAtMs，独立层数用stackExpiries；缺值和缺时效分别保持未知。CombatContext.stateFrames保存对象/eventId/phase的事实快照，字段重复、失效引用或缺来源拒绝。calculationEvent可携带稳定actionId；它不替代skillId、hitId或事件自身身份。
