# 资料与来源

| 入口 | 内容 |
| --- | --- |
| [references.json](references.json) | 参考仓库、固定版本和本地位置 |
| sources | 已采用的原始字节、身份映射和机制事实 |
| [数值审计](audits/numeric-precision.json) | 直接数值比较记录 |

- [参考项目与资料入口](#参考项目与资料入口)
- [内容与装备来源](#内容与装备来源)
- [计算支持与验证资料](#计算支持与验证资料)

正式内容在[游戏内容包](../../src/game-data/README.md)，资源在[资源根](../../assets/README.md)。原始玩家资料由检查直接读取忽略目录.references，运行报告进入artifacts。

讨论过程与已结束方案通过Git查询。整理前原文可用 `git show d497a7e:docs/<原路径>` 检索，重整前完整快照为37ab994。最终结论维护在[主题文档](../../docs/README.md)及对应模块说明中。

## 参考项目与资料入口

固定版本统一登记在[参考清单](references.json)，已采用输入在 sources；本地检出统一使用 .references。

### GenshinTools

参考仓库为 https://github.com/Anyrainel/GenshinTools，固定提交 `345edc8b1ade7b57cd47153844cb1abae8c3e415`，本地路径 `.references/GenshinTools`。研究采用静态源码阅读，许可状态记录在参考清单中。

| 关注点 | 上游路径 | 采用的结论 |
| --- | --- | --- |
| 内容组织 | src/domain/models.ts、src/domain/reference/stats.ts | 技能、被动、命座、成长和等级参数完整建模；本项目统一为可导出 JSON |
| 数据刷新 | docs/game-data-refresh.md、scripts/refresh_game_data.py | 来源更新、候选与正式生成分开，数值和规则分别审查 |
| 访问与加载 | src/providers/reference/statLoaders.ts、src/generated/catalog | 类型化内容访问与运行加载配置分开 |
| 属性与效果 | src/domain/combat/damage/core/statSheet.ts、statBuff.ts、teamStatSheet.ts | 共同属性入口、来源、接收者和命中筛选 |
| 表达式与伤害 | 同目录 damageFormula.ts、expr.ts、formulaCompiler.ts | 公式和属性读取共用，候选变量及时间依赖决定常量折叠条件 |
| 内容连接 | tests/domain/combat/damage/entityReadiness.test.ts | 分别检查目录、资料、规则及实际求值路径 |
| 实体实现 | src/domain/combat/damage/impl/character5Mondstadt.ts、character4Mondstadt.ts | 琴、凯亚的参数读取与机制实现相互关联 |

本项目采用显式、可序列化规则，保持内置与自定义共同契约；规则绑定、来源和求值各自有明确入口。逐级培养精度、人工记录的动作及命中、未知状态和跨角色候选属于本项目的计算条件。通用编译器、模块副作用注册、数据库及插件平台的采用以实际需求为依据。搜索适配继续参考 Mona 社区实现。

### Mona 社区版

参考 https://github.com/TwiceDrop/genshin_artifact，版本 7.2.02，固定提交 `589ac6919057709924c0c20d5a9d673fe9b0be1a`，唯一本地检出为 `.references/mona-community`。目录与中文身份采用记录见[目录快照](sources/catalog/mona-community/catalog.json)。

套装按精确中文名对应，社区导出键作为别名。社区中的石英大剑、琥珀玥、黑檀弓属于待核对目录差异。生成目录和中文词典提供身份及图片线索，机制规则单独审查。

`_gen_artifact.js` 的 HeavensGift、nameLocale=925 对应“天之美赐”，本项目 ID 为 celestialgift。来源物品 `3648921719734070` 的身份核对使用原指纹与整件快照复核；经手动修改的内容保持待核对。具体流程见[导入协议](../../src/web/README.md#外部导入协议)。

Mona 的 average 使用显示舍入后的四档值；本项目平均条数采用已登记原表精度。优化与默认连招分别按本项目库存、约束、记录和时间语义审查。

### 用户指定的计算网站

下表保留首次调查结果，访问状态随实际后续调查更新；来源采用先核对实体、形态、游戏版本、参数单位和许可。

| 入口 | 已记录的访问结果 | 研究用途 |
| --- | --- | --- |
| https://db.gensri.wiki/characters/ | 入口可读，详情抓取停留在导航与版本加载 | 角色、武器、套装资料 |
| https://gi.nanoka.cc/ | 首页返回 403，角色详情读取待补 | 参数与机制交叉核对 |
| https://lunaris.moe/char | 列表正文读取待补；检索可定位宵宫详情；gi.lunaris.moe 有 Live/Beta 比较入口 | 版本与成长差异；域名关系待确认 |
| https://gi.yatta.moe/chs/archive/avatar | 页面和脚本可读取，正文抓取曾返回403；已核对实际属性SVG | 天赋、被动、命座、参数与属性图标 |
| https://alioth.wiki/gi/char | 已读取纳西妲、胡桃、那维莱特详情及倍率、被动、命座和附着条目 | 逐路径机制阅读，显示取整另行核对 |

详情入口包括 https://lunaris.moe/char/10000049、https://gi.yatta.moe/chs/archive/avatar/10000073/nahida、https://alioth.wiki/gi/char/73、https://alioth.wiki/gi/char/46、https://alioth.wiki/gi/char/87。各站访问记录的原始讨论可从 Git 的原 calculation-web-sources 文档查询。

## 内容与装备来源

### 内容采用与精度核对

#### 数值来源

| 数值族 | 固定来源与采用位置 |
| --- | --- |
| 角色基础、成长、突破及天赋参数 | genshin-db `8e5badd60b5d894284ccc927a56c9683529d2592`；sources/catalog/genshin-db 及 sources/genshin-db 原件 |
| 武器基础、副属性、曲线与突破 | 同一 genshin-db 固定版本 |
| 主词条与副词条档位 | LunaGC `b0501c5d89767ead5f647869a2412521447f7682` 的 ReliquaryLevel、ReliquaryAffix 原表 |
| 角色原始技能配置及参数补充 | 同一 LunaGC 的 AvatarExcel、ProudSkill；文本采用摘录另存 |
| 命中反应公式及等级曲线 | KQM TCL `7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5` 的公式与 player.json |

[数值审计](audits/numeric-precision.json)记录基线逐字段差异与来源限度，日常 `pnpm data:check` 直接读取当前输入比较。新增机制的系数、阈值、绑定与规则另做来源和独立公式核对。

五星主词条源 level1 对应强化0，level21对应强化20；精通20级原值186.5，游戏或扫描显示可为187。扫描值按来源显示精度和记录容差核对。原表的固定防御行按主词条合法池判断，主词条表行与合法物品分开校验。

原表与退休显示表的125处差异包含百分比单位换算尾数及原显示表缺项。正式计算保留采用原表精度，保存文件使用自身表快照。基础属性已与固定 AvatarExcel 原表交叉核对，武器及曲线沿固定来源精度维护；游戏逐步 float32 运算对照状态为待补。

KQM 反应等级曲线收录1至100级，0级为 null。与固定 Mona 社区1至90级交叉比较最大差值约0.00004825，95与100级一致；其余中间级有估计差异，正式曲线采用固定 KQM 原值。

#### 基础形态与文本

[采用摘录](sources/character-text/base-and-manekin.json)保留18份绑定、原技能库与技能行，以及411条引用文本；完整下载位于忽略目录 `.references/metadata/text-completion`。

| 定义 | 配置内容 |
| --- | --- |
| 空、荧基础形态 | 技能库501/701；普通攻击“故去的追忆”，男女参数分别采用；其余技能、被动和命座为空 |
| 男女奇偶基础形态 | 普通攻击“外域剑术·安谨守望”及三个固有天赋；战技和爆发为空 |
| 男女奇偶各七元素形态 | 普通攻击、战技“戒惩轰击”、对应元素爆发“禁入限区”和三个固有天赋；命座为空 |

配置和数值采用固定 LunaGC 技能库、技能及 ProudSkill；文本补充来自 Dimbreath `433284d22ef1a704e9d49ae22fb96cf7a245828e` 的 TextMapCHS 与 TextMap_MediumCHS，逐字段按原文本哈希关联。技能文本哈希在两份固定 AvatarSkill 来源中一致。游戏版本取自对应来源记录。

受控颜色和斜体标记转为安全文本，换行和风味说明保留语义。文本、参数与结构化命座加级由同一定义提供，列表投影确定性生成；角色与培养页的展示遵循已确认交互。

#### 培养等级

角色合法等级为1至90、95、100；95和100沿用第六次突破及其属性加值，天赋基础培养上限10，命座加级另计。武器依自身稀有度和突破范围选择，最高90级。成长曲线按0至100索引保存。

版本依据为[更新说明](https://bbs.4399.cn/thread-view-tid-50524833)的“砺行修远”条目，成长系数来自固定 genshin-db 的 src/data/curve/characters.json。班尼特原展柜90级的明确培养变体用于浏览器与独立面板核对，95/100级原始玩家展柜及观测材料状态为待补。

#### 资源核对

资源来源、别名、转换和许可集中在[资源入口](../../assets/README.md)。覆盖从当前正式定义及索引计算，实际解码和可见像素按浏览器路径验证；当前统计由检查输出。资源来源与显式覆盖统一维护于 assets/manifest.json。

### 圣遗物稀有度调查

生产实物契约为五星。扩展目标包含四星与五星，三星以下实物暂缓；来源研究、候选审阅和真实原件检查分别登记。

#### 原始关联

固定 LunaGC 提交为 `b0501c5d89767ead5f647869a2412521447f7682`。采用原件位于 sources/lunagc 同版本目录，候选关联原表位于 `.references/metadata/artifact-rarity/<提交>`。

| 来源 | 已取得内容 |
| --- | --- |
| genshin-db sets.json | rarityList：46套[4,5]、14套[3,4]、3套[1,2,3] |
| ReliquaryLevelExcelConfigData | 101行；rank0一行、rank1十六行、rank2至5各二十一行 |
| ReliquaryAffixExcelConfigData | 350行；depot101/201/301/401/501分别20/30/40/40/40条 |
| ReliquaryExcelConfigData | 4292行，物品到星级、等级上限、属性池及部位关联 |
| ReliquaryMainPropExcelConfigData | 66行 |
| ReliquarySetExcelConfigData | 64行 |

正式副词条表采用401、501两个depot。主词条合法性须关联实际物品与属性池，套装部位按原始配置判定；rank0及其他depot逐项确定用途。

| 星级 | 物品maxLevel | 强化上限候选 | 关联主词条行数 | 普通depot档位数 |
| --- | --- | --- | --- | --- |
| 1 | 5 | 4 | 5 | 20 |
| 2 | 5 | 4 | 5 | 30 |
| 3 | 13 | 12 | 13 | 40 |
| 4 | 17 | 16 | 17 | 40 |
| 5 | 21 | 20 | 21 | 40 |

addPropLevels为5/9/13/17/21，按物品maxLevel截断后得到源等级候选。appendPropNum有0至4模板，部分模板星级超出正式rarityList；实际生成、掉落、初始条目和升级语义仍待核对。该版本缺heartofthefurnace、scarletproof配置，当前版本相容性与两套部位资料待补。

候选工具为 `node tools/scripts/data/prepare-artifact-rarity.mjs --out=artifacts/content-candidates/<新目录>`，输出analysis.json；首份审阅位置为 artifacts/content-candidates/artifact-rarity-2026-11-13。普通生成使用已采用输入。

#### 直接消费者

| 消费者 | 当前行为 | 扩展所需处理 |
| --- | --- | --- |
| schema/account/artifact | rarity=5，level≤20，rolls≤6 | 按来源星级、强化、总量校验 |
| schema/content/manifest、account/build | 每属性21项主词条 | 按星级索引并保存复算表快照 |
| schema/content/artifact-set | 件数效果，投影最高稀有度 | 完整稀有度集合与合法部位分别维护 |
| engine/attributes/build | 按属性及等级取主词条 | 同时按实物星级寻址及校验 |
| web/domain/mona-import | 仅五星，源0至20级 | 保留star并核对星级表、显示精度及有序词条 |
| Mona来源指纹 | 已有身份按五星内容计算 | 扩展加入星级，保留源ID及无ID出现顺序，先核对冲突 |
| web/domain/enka-import | rankLevel=5，level减一 | 核对逐星级等级映射、附加词条ID |
| web/domain/artifact-rolls | 4/5星档位；初始3/4条、每4级强化 | 按对应来源规则枚举联合合法历史 |
| account-presentation、showcase-inventory | 主词条单表；内容匹配含星级 | 展示、排序、回查及精确匹配口径一致 |

手动表单、筛选、组合、角色配置、文件和项目复制沿这些直接消费者核对。有效条数白值、组合冻结、物品身份和现有去重策略分别保持。

GenshinTools 的 src/domain/build/artifact/solver.ts 可供四/五星分支比较，采用规则以原表关联及独立核对为准。升级/初始词条语义、当前版本差异和非五星真实导入原件处于待补状态。

## 计算支持与验证资料

### 计算支持与内容绑定

逐项定义以 src/game-data/data 为准，运行索引位于 src/game-data/generated/damage-paths.json 与 combat-rules.json；`node tools/scripts/data/audit-damage-paths.mjs` 输出当前绑定摘要。

#### 已审阅单次查询

圣遗物实物契约为五星。四星处于来源调查与候选阶段，三星以下实物暂缓，详情见[稀有度调查](#圣遗物稀有度调查)。

#### 分项输入

来源为固定 genshin-db 天赋、命座与 KQM 机制页，[事实摘要](sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/count-scaling-facts.json)保留逐项依据。输入表达分项事实，自动积攒、跨命中施放关联和可达性状态为待接入。绫人、雷电、优菈的完整角色依赖继续按各自支持状态处理。

#### 捕获、基础加值与内容规则

[基础加值事实](sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/base-damage-bonus-facts.json)采用固定 genshin-db 与 KQM 的武器、云堇机制依据。云堇基础组件按独立公式核对，完整支持仍待上述依赖。

#### 反应、状态与入口

命中反应已接入蒸发、融化、超激化与蔓激化。独立剧变、延迟/持续反应、月反应和附着历史推演处于待接入状态。[反应事实](sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/reaction-facts.json)及 player.json 保存公式和等级系数。

战斗状态支持生命比例、站场和护盾区间、命中覆盖及读取来源；敌方状态、受击、有效治疗和自动触发待接入。生命比例由黎明神剑等既有条件读取。

独立计算器已提供手动配装、本地/展柜读取、复制轴、已实现条件、独立捕获和同轴比较。现有时间轴的完整条件与区间编辑入口、记录完整性、初始状态、自动次数/冷却、完整修订类型及全目录主要机制仍待接入。

来源调查、独立公式、真实资料功能检查和游戏观测分别登记。完整实录队伍战斗轴与全面游戏伤害观测材料状态为待补；现有公开展柜提供配装和文件/Worker检查材料。

### 验证资料与独立计算记录

原件由检查直接读取 .references 中已有的获授权文件，读取前确认存在；缺失时对应检查跳过。这里登记来源和核对依据，原始响应、玩家文件及派生副本保留各自用途。

#### 原件登记

| 原件 | 已登记事实 |
| --- | --- |
| .references/artifacts_mona.json | 用户授权的Mona库存，历史登记458件、55个穿戴备注角色；备注提供来源穿戴文字 |
| .references/enka/official-example.json | Enka官方示例UID 618285856；登记响应含安柏、班尼特、甘雨、行秋；2026-11-06记录SHA-256为9252b9a42f2d57c636d46d633222e1e2b1e451ea38f3c5fdd62438852596d026 |
| .references/enka/official-example-2026-11-13.json | 同一官方UID另次响应；SHA-256为044745aeea79e7530b09d1999eaaa5671a2d8f4f84c2d7e2f0a8a12990b24fd7 |
| .references/enka/uid-107590923.json | 用户授权的12角色展柜；映射适配和有效条数检查使用此原件 |

官方接口为 https://enka.network/api/uid/618285856/。每次录存保留自身版本与字节；历史摘要与当前原件在使用时重新核对。公开示例和用户Mona库存各自保持账号来源。

Mona备注缺武器、命座、培养和战斗状态；用户确认的满级培养作为明确计算设定单独记录。公开展柜提供培养与装备，目标、战斗时间轴和伤害观测材料状态为待补。

#### 已有真实资料核对

- Mona物品8770563143816081：保存的副词条 .058/.11/.109/.179，联合推定重复强化0/1/2/2；平均档数1.2/2.0/3.3/2.7。
- Mona物品3965604424477510：期望按当前“总数较小的合法解”重新推导，原较大解属于历史记录。
- Mona物品3648921719734070：HeavensGift按固定中文词典匹配celestialgift，原身份、数值与穿戴备注分别保留。
- UID107590923的菲林斯：攻击比例副词条36.2%、固定攻击52、攻击白值1025.9267578125，`(0.362 + 52 / 1025.9267578125) / 0.04955 = 8.32867567`，显示8.3条。
- 同一响应薇斯纳羽毛34.2%暴伤，接口记录4次重复强化；移除历史元数据后，以原实值联合推定仍选择4次。
- 该12角色响应的薇斯纳、奥黛特、桑多涅、沃雅妮莎、哥伦比娅天赋分别为8/10/10、2/10/7、10/8/10、2/10/2、2/10/9，映射采用固定来源名称匹配。

#### 明确计算配置

上述条目分别用于来源核对、独立公式或软件功能检查。游戏伤害观测、完整实录队伍轴和原始95/100级展柜的材料状态为待补。运行结论与截图按源码版本保存在 artifacts。
