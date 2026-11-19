# game-data

正式输入在data/characters、weapons、artifact-sets，每实体一份JSON；可选动作在data/actions，每角色至多一份。tables保存公共表，manifest.json版本2维护版本和有序ID。src/catalog.ts提供加载器，generated提供只读运行分块。

pnpm data:build经共同schema校验后离线生成，pnpm data:check直接比较来源、模板与派生结果。内置与自定义角色共用CharacterDefinition，文本、参数、命座加级及规则由相同定义提供；配装消费自身快照。

套装简称位于[data/tables/artifact-set-short-names.json](data/tables/artifact-set-short-names.json)，有效属性与白值基准分别在character-effective-stats.json、effective-roll-basis.json。生成器输出运行索引，具体清单由正式JSON维护。

来源原件和调查在[资料入口](../../tools/data/README.md)，精度与文本采用在[内容核对](../../tools/data/README.md#内容采用与精度核对)，计算能力在[支持记录](../../tools/data/README.md#计算支持与内容绑定)。通用语义见[内容规范](../../docs/content.md)。

角色、武器与套装的专属参数、模板配置和效果集中到自身文件的calculation.bundle及ruleIds；其中formulas字段是数据配置列表，不含运算图。没有专属定义时不声明该字段。维护来源可引用共享定义；物理路径不进入定义身份，不再维护逐公式、效果或聚合碎片文件。

角色文件的talents保存各技能的原始参数及hits。每个命中具有稳定id、基数绑定、捕获槽及命名输出，输出可声明适用条件。生成器为共同v3契约装配并校验可达的定义与来源。交换文件携带闭合的计算数据，支持离线求值。

薇斯纳revision=4包含34个命中身份、35个普通及直接星扩散输出，单次查询覆盖C0–C6的已审阅条件。正式目录有106个带明确范围的输出。输出、装备条件及复核范围见[计算支持与验证资料](../../tools/data/README.md#计算支持与验证资料)。

跨实体定义集中到data/calculation/common.json和reactions.json。common保存通用模板选择及属性配置；reactions保存反应模板选择、聚合参数、来源和精确等级表。算法由engine/calculation中的TypeScript模板及聚合函数实现。tools/lib/calculation-library.mjs装配这些输入，tools/lib/content-linking.mjs生成逐实体闭包。calculation-formulas.json供离线工具核验，产品按需读取闭合的实体分块。

`pnpm data:coverage`报告正式内容的角色、技能、命中、被动、命座、武器精炼和套装件数分支。`--json`列出逐输出scopes、命座范围、来源与缺口，`--candidates`在内存中制备并编译审阅副本。supportedOutputs只计已有采用证书及可达依赖的明确范围。`--require-complete`要求正式内容全部条目闭合。报告由生成器维护。

规则与静态修饰的采用依据保存在tools/data/sources/calculation-effects。实体calculation.ruleIds指定实际规则根，产品通过同一求值器读取生成的v3快照。

reaction-level-multiplier通过精确版本lookup读取共同等级表，不重复维护等级数列。独立反应查询可将该输出与当前角色精通绑定到固定剧变模板；直接月/星分支不依赖此表。

公共反应库保存月感电、月结晶和星扩散的逐人公式引用与名次权重。tools/lib/calculation-closure.mjs的collectFormulaClosure按明确根导出可达定义及来源；交换文件包含全部所需数据和模板精确版本，不携带编译程序或运算节点；必须由支持该版本的离线运行时求值。

`pnpm data:prepare-structured`显式生成当前目录的审阅副本，默认输出artifacts/content-candidates/structured-damage。命令沿用正式schema和装配校验，输出按原始成长、参数数列和稳定命中身份核验，未变文件复用原字节。

公共TS模板计算单/多属性基数、按次数启用的分项、明确暴击模式、元素抗性及合法增幅/激化模式；JSON仅选择模板并提供缩放项与参数。无反应和非暴击分支按需读取，不因未用到的精通、等级表或条件暴击属性而变成未知。来源审阅固定版本发生变化时须先复核采用记录，再制备候选。

维护与交换JSON保留实体和定义身份、原始数值以及有意义的数组顺序。data/actions中的独立动作文件引用角色的稳定伤害身份。generated由离线生成器更新。

data/actions/vesna.json维护15个动作、6类状态及14条转换，精确关联薇斯纳revision=4。时效从角色参数或来源描述读取，原倍率数组仍只在角色文件。普通生成共同编译动作与所选角色，generated/actions.json只保存闭合运行快照；getCharacterActions接收完整DefinitionRef，不匹配时返回null，不选择最新修订。公共算法配置仅在其原所有者维护，导出快照按需携带副本。

当前动作支持显式事件、资源及独立过期；动作时长、取消和命中偏移仍为null。剑气未知容量、确切消耗及部分C6转换见[动作来源与缺口](../../tools/data/sources/calculation-hits/vesna-actions.json)。这不构成自动轮转、完整动作可执行性或生产界面接通。

tables/artifact-main.json按星级保存四星17项和五星21项精确表；套装实体rarities保留完整合法星级集合，目录rarity只展示最高值。四星新增表、词条池、强化规则与来源缺口见[采用记录](../../tools/data/sources/artifact-rarity/adoption.json)。普通生成不覆盖作者定义；角色更新候选保留自身calculation，不从基础形态复制专属计算所有权。

反应固定常数仅在TS的standardReactionParameters维护；rules快照只保存algorithmRevision、等级表和来源，旧常数字段拒绝。数值审计对TS常数及JSON参数直接核对固定来源；普通生成不把运算图写回JSON。
