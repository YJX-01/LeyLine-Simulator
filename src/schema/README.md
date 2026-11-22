# schema

共享Zod契约与推导类型。按common、content、account、project、exchange、protocol拆分；包根导出当前契约，`@leyline/schema/enka`是外部Enka输入契约。契约不依赖UI、平台或旧实现。目录职责见[仓库地图](../../docs/architecture.md#模块职责)。

- [文件与存储契约](#文件与存储契约)
- [结构化纯公式](#结构化纯公式)
- [结构化内容与配装契约](#结构化内容与配装契约)

当前文件版本、存储命名空间及字段语义见下文。

## 文件与存储契约

当前运行校验定义在src/exchange、src/account及src/project，应用操作遵循[文件与状态规范](../../docs/files-and-state.md)。

根 package.json 的 version 同时用于软件版本、第一方文件的 schemaVersion、计算库的 runtimeVersion 和内置目录的 dataVersion。当前值为字符串 `"0.2.0"`。文件以 kind 区分。实体 revision 标识具体内容，rulesVersion、algorithmRevision 和模板 revision 标识具体求值协议。外部来源的版本沿用其原始记录。

| 文档 | 当前契约 |
| --- | --- |
| 角色定义 | kind=character-definition，文件根对象直接保存角色元数据 |
| 账号、轴项目 | kind=account 或 axis，document 保存编辑状态，content 保存引用的定义 |
| 定义库 | kind=definition-library，保存定义集合 |
| 轴项目规则 | rulesVersion=timeline-v1，统一依赖求值 |
| 独立计算器 | kind=damage-calculator，document 内含 project、可选 baseline、actorId 和可选 recordId，最大 8 MiB |

浏览器按用途分别存储账号、项目恢复、角色配置、队伍、定义库、收藏与偏好。键名由 storageKeyFor 生成，例如 `leyline-account-0.2.0`。

读取按当前严格schema校验，旧版本标签或退休字段返回拒绝，当前编辑保留。磁盘文件及旧存储字节由用户维护，显式替换前完成备份。角色培养中的退休hpRatio字段按严格契约拒绝，生命条件由项目上下文提供。

计算器的actorId须指向有Build的队员，recordId须指向项目中的伤害记录。保存设定与快照，重开重新求值。内容更新通过显式审阅采用，文件打开保持自身定义。

轴项目和计算器用同一 HitRef 保存内容分组、命名空间、实体 ID、本地修订和命中 ID。打开文件时从内容表取回角色、装备、套装及成长曲线，按原修订求值。

kind=capture的独立记录关联同队员技能与合法时间，其定义无公式和效果，记录无damage。来源与命中的先后依order明确；before/after阶段按捕获契约执行。当前命中可以明确关联自身before阶段，自身after作为来源时拒绝；同刻缺order保持待确认，ID用于稳定排序而非补足依赖事实。

combatStates 保存按队员和时间段设置的生命比例、站场和护盾状态。damage.facts 按队员、目标、队伍或事件保存带类型的覆盖值，显式 null 表示未知，省略时继承。stateReads 记录实际取值和区间。

多人反应记录使用 reactionEvent，包含伤害族、元素、贡献者和暴击口径。联合概率表可显式指定各状态的暴击结果。reactionRules 保存采用的公式闭包。actionStates 保存当前角色修订的动作定义、状态起点和初始值，timeline 的 actionId 及 facts 明确执行事件。

damage.reaction 为 none、null 或严格的 type/trigger 对象。反应规则表使用当前 schemaVersion，algorithmRevision=1 选择引擎固定算法。damage.capture 关联 recordId 与 phase，damage.facts 按主体提供技能计数与战斗条件，damage.effectApplications 关联 instanceId 与 active。

正式查询使用 HitRef，按内容分组、命名空间、实体、本地修订和命中 ID 定位。计算支持按实体修订、命座和相关依赖闭包核验。复制为自定义并修改倍率后按新内容计算，证明状态按自定义来源核验。

武器被动按精炼档读取数值，增益和追击写入该武器的 buffs 和 hits。培养、反应规则及来源适用事实分别按各自契约校验。

人类可读JSON统一由formatJson输出两空格缩进和末尾换行；存储和生成块按各自格式使用紧凑JSON。

## 结构化纯公式

calculation/values.ts 定义精确 namespace/id/revision、数量、布尔及枚举。次数和毫秒为非负安全整数；比例使用 scalar。template.ts 校验当前软件版本的模板配置：精确身份、模板id/revision、有限类型参数与来源。输入签名、运算、输出、阶段及端口由TS模板产生；外部nodes、inputs、outputs、stages、modifierPorts及脚本字段拒绝。内容参数仍以角色定义为唯一真值。

calculation/json.ts 在8 MiB及深度预算内先检查重复对象成员，再解析严格JSON；对象调用也先拒绝结构循环、访问器和超深结构。诊断使用转义后的JSON Pointer。显式null保持未知，纯数学可选参数可声明中性默认值。

calculation/bundle.ts 要求 schemaVersion 与 runtimeVersion 都等于软件版本，要求fixed-templates-v1；接受模板配置、精确版本表、聚合、属性、效果和来源数据闭包，旧运算图库版本拒绝；aggregate.ts 声明逐人公式、排序依据、权重及独立/联合概率输入。binding.ts 明确施加者、受益者、贡献者、参数、事实及属性读取时间。current.phase=same沿用调用阶段；before/after为明确阶段，capture必须关联声明的捕获槽。

effect.ts 定义解锁、接收者、动作/命中筛选、伤害族、时效、适用事实、优先级及叠加规则。context.ts 保存有类型的角色/目标输入、来源事实、有效天赋等级、明确事件、状态区间和单次覆盖。生命比例范围、站场/护盾布尔类型、区间重叠及重复覆盖分别校验。缺失与显式null均不能自动成为false或0。

coverage.ts 定义按具体输出范围的覆盖记录、最高命座、机制处理和证据层次。非空覆盖记录须声明 coverage-v1。来源、规则与完整身份须可解析，声明完整的记录要求每项相关机制已实现。无规则装备可使用空公式闭包。动作状态见[动作与事件状态契约](#动作与事件状态契约)。

query.ts 区分技能命中与事件输出请求。独立反应描述允许空技能/命中/攻击类别，多人聚合无需伪造施放者；输出用eventId+outputId定位。CalculationSelection明确选择单个输出或事件合计，缺失/失效选择拒绝。装备占用按明确账号与库存物品身份检查，返回独立feasibility；缺账号及脱离库存的快照保持unknown。StructuredDamageEvaluation保留逐输出、事件合计、追踪、所需事实与聚合状态，数学execution和库存冲突分开。

bound-aggregate.ts约束逐贡献者公式、读取帧、资格及概率事实绑定，要求各自读取自己的配装并共享事件、目标和阶段。概率值由受限Binding读取；crit-rate与普通probability明确区分，独立和联合模型保持显式。事件的bound-aggregate分支要求bound-aggregate-v1，不接受手工贡献值替代已声明绑定。

## 结构化内容与配装契约

content/calculation.ts 约束装备和公共库的计算定义与规则身份。角色侧的 content/character-metadata.ts 校验维护与交换共用的角色 JSON。文件保存角色专属定义、自定义曲线和公共依赖引用，装配由当前软件提供公共曲线与模板，并校验实际依赖。

talents.hits中的基数及输出使用完整模板身份与受校验的Binding。输出BoundFormula可声明布尔predicate，未知条件保持未知，明确不满足时拒绝该输出。参数、捕获和离线闭包校验包含该条件。

actor-state只读取已提供队员的突破、命座和精炼；team-count按队员identity中的元素身份计算，缺身份保持未知并保留来源。没有突破门槛的被动以unlockAscension:null表达，其规则按自身activation执行；不为星耀祝礼额外增加突破门槛。

content/artifact-rarity.ts统一四/五星输入边界。Build.artifactMain按"4"/"5"、属性、强化等级寻址，分别17/21项，禁止单表或跨星级补配；套装rarities保留来源集合，rarity仅为目录最高星级投影。四星强化0–16，初始2/3条，完整rolls总量与等级一致；五星保留0–20及现行输入语义。上限校验与合法历史推定不等同于玩家观测。

content/structured-content.ts 定义引擎读取的角色、武器和套装快照。角色参数按技能唯一保存，命中使用稳定 ID、参数绑定、捕获槽及命名输出。未审阅命中保留身份、原参数关系与支持缺口。装配生成 attributes.outputs，面板按类型和单位读取对应的角色属性。

calculation.bundle保存自身依赖，ruleIds关联精确效果身份。被动、命座、套装件数与效果解锁条件一致；覆盖记录须属于相同实体和对应命中/件数范围。技能输入携带明确数量类型、范围、整数要求和命座上限。

account/structured-build.ts接收 calculation-build，携带角色与装备定义、培养、主词条表、来源和实物引用。本地配装的 weapon 为完整武器定义或明确的 null。空槽保留角色培养，武器等级、突破和精炼不提供数值或效果。展柜快照携带来源中已核验的武器定义。artifact.inventory为明确的accountId与itemId组合，或null。当前账号、轴项目及计算器均使用该配装契约。

## 动作与事件状态契约

content/actions.ts定义可选的 character-actions 文档：自身identity、精确character引用、稳定actions及技能/命中/输出引用、来源、状态机和具体缺口。durationMs、cancelAfterMs、offsetsMs中的null表示未采用时刻，不能当作零。动作只引用角色伤害与参数；game-data 按实体目录发现实际存在的动作文件。

calculation/state-machine.ts约束event-state修订1。普通值可有单一时效；stacked必须有正整数容量、零清除值和逐层时效。同阶段priority必须唯一，不用ID裁定顺序。条件和时效使用同一BoundFormula，状态更新限于set/add/consume/clear/unknown；独立层数的逐层消耗未声明顺序时拒绝。容量未知可给已核验下界，超过可证明范围保持未知；缺口不会增加默认规则。

请求携带ownerId、targetId、startMs和显式initial。普通状态用expiresAtMs，独立层数用stackExpiries；缺值和缺时效分别保持未知。CombatContext.stateFrames保存对象/eventId/phase的事实快照，字段重复、失效引用或缺来源拒绝。calculationEvent可携带稳定actionId；它不替代skillId、hitId或事件自身身份。
