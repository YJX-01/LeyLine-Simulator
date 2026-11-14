# engine

当前属性与直接伤害在attributes，效果依赖求值在effects，时间轴校验及求值入口在timeline。只依赖schema，并只计算调用者提供的快照。退休模拟器不从包入口导出。公式及边界见[直接伤害](../../docs/calculation.md#伤害计算)。

| 入口 | 维护职责 |
| --- | --- |
| resolveStaticBuild | 成长、装备与静态修饰 |
| resolveBuild | 通过共同依赖图求属性 |
| evaluateDamage | 独立单点上下文与共同伤害公式 |
| evaluateTimeline | 当前项目校验、状态及事件顺序求值 |
| compareTimelineLoadouts | 同轴完整Build替换，各候选独立装配 |

combatRules复用项目表达式，支持减法、min/max、比较、分支、精炼参数、天赋参数和战斗状态读取。项目事件在装配时关联，正式规则以自身及接收者、动作/命中技能选择器表达关系。单位相加与比较须相容，转换先归一化来源单位，再乘目标单位系数。

效果实例身份保留所有者、来源实体及修订、规则与触发事件。常驻效果显式permanent，在合法最大查询时刻3600000毫秒仍常驻；触发效果使用左闭右开区间和before/after。修订中的禁用、固定值及失效引用按现有语义执行，完整五类修订的接入状态登记于[计算资料](../../tools/data/README.md#计算支持与验证资料)。
