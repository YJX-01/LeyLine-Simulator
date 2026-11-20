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

主题规范和已采用决定见[文档导航](../../docs/README.md)及各模块 README。整理前的调查原文可用 `git show d497a7e:docs/<原路径>` 查阅。

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

角色、装备及模板配置以稳定身份关联规则和支持记录。下表及对应的采用记录负责追溯仓库、提交、网站与原始数值。展柜、库存与用户输入各自保留实际记录身份。

| 数值族 | 固定来源与采用位置 |
| --- | --- |
| 角色基础、成长、突破及天赋参数 | genshin-db `8e5badd60b5d894284ccc927a56c9683529d2592`；sources/catalog/genshin-db 及 sources/genshin-db 原件 |
| 武器基础、副属性、曲线与突破 | 同一 genshin-db 固定版本 |
| 主词条与副词条档位 | LunaGC `b0501c5d89767ead5f647869a2412521447f7682` 的 ReliquaryLevel、ReliquaryAffix 原表 |
| 角色原始技能配置及参数补充 | 同一 LunaGC 的 AvatarExcel、ProudSkill；文本采用摘录另存 |
| 命中反应公式及等级曲线 | KQM TCL `7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5` 的公式与 player.json |

[数值审计](audits/numeric-precision.json)记录基线逐字段差异与来源限度，日常 `pnpm data:check` 直接读取当前输入比较。新增机制的系数、阈值、绑定与规则另做来源和独立公式核对。

四星主词条采用源level1至17，五星采用源level1至21，显示强化等级均为源level−1；精通20级原值186.5，游戏或扫描显示可为187。扫描值按来源显示精度和记录容差核对。原表的固定防御行按主词条合法池判断，主词条表行与合法物品分开校验。

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

资源来源、别名、转换和许可集中在[资源入口](../../assets/README.md)。覆盖从当前正式定义及索引计算，实际解码和可见像素按浏览器路径验证；当前统计由检查输出。采集时使用的固定版本、地址和覆盖位于 sources/asset-capture。

### 圣遗物稀有度调查

当前实物接受四星与五星，三星以下实物暂缓。schema、两条求值路径、Mona/Enka、展示、保存快照和手动表单均按实物星级取表；四星0–16、五星0–20。已采用来源及保守输入边界见[采用记录](sources/artifact-rarity/adoption.json)，套装合法部位见[固定来源字段](sources/artifact-rarity/set-slots.json)。

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

addPropLevels为5/9/13/17/21，按物品maxLevel截断。appendPropNum含非玩家生成模板，不能扩大正式rarityList。已采用KQM的初始条目与每四级强化语义；合法部位来自匹配固定genshin-db提交的实际piece字段，不依据效果件数或图标猜测。旧LunaGC缺heartofthefurnace、scarletproof掉落配置，不以旧模板证明新套装掉落规则。

候选工具为 `node tools/scripts/data/prepare-artifact-rarity.mjs --out=artifacts/content-candidates/<新目录>`，输出analysis.json；首份审阅位置为 artifacts/content-candidates/artifact-rarity-2026-11-13。普通生成使用已采用输入。

#### 直接消费者

| 消费者 | 当前行为 | 核对范围 |
| --- | --- | --- |
| schema/account/artifact | 四星0–16、五星0–20 | 四星初始2/3条，单条及完整记录总量校验 |
| manifest、account/build | 按星级/属性/等级的17/21项表 | 旧单表拒绝，不跨星级补配 |
| artifact-set | rarities、slots及件数效果 | 最高星级仅展示，原始字段逐项核对 |
| engine/attributes、calculation/build-context | 读取自身星级表 | 校验套装星级/部位及各星级副词条边界 |
| Mona | 保留star与扫描值，先预览再确认 | 指纹包含星级与有序词条；源ID及无ID出现顺序保留 |
| Enka | rankLevel为4/5、level减一 | 核对主词条表、套装、源affix编号及展示舍入 |
| artifact-rolls | 使用自身401/501池及初始条数 | 联合枚举是推定，不称为观测历史 |
| account-presentation、showcase-inventory | 按星级显示与匹配 | 保留有序词条及各自表快照 |

手动表单、筛选、组合、角色配置、文件和项目复制沿这些直接消费者核对。有效条数白值、组合冻结、物品身份和现有去重策略分别保持。

当前458件Mona原件均为五星，四星玩家导入原件仍缺失。功能检查读取原件；四星数值表、格式边界和读取分派使用固定来源及明确派生设定核对，不生成四星玩家文件替身。

## 计算支持与验证资料

### 计算支持与内容绑定

数值审计核对 TS 固定算法和 JSON 参数。防御与抗性常数采用 KQM 公式事实，增幅与激化采用 reaction-facts，模板常数通过 `describeCalculationTemplate` 核对。[KQM 公式事实](sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/calculation-formula-facts.json)

`pnpm data:coverage --json` 编译正式目录的依赖闭包，按输出列出证书命座范围、来源和缺口。完整命座、角色和装备分支分别判断，外部 `declared` 证据仍待本地采用，未闭合条目标记 `unavailable`。报告同时包含命中绑定和效果，`--require-complete` 用于全目录验收。[内容包说明](../../src/game-data/README.md)

共同效果的[采用对应](sources/calculation-effects/retained-rules.json)关联现有内容规则、静态修饰与新的直接JSON定义。[固定来源字段](sources/calculation-effects/catalog-facts.json)保留原精炼字符串和套装效果文本；数值审计直接比较所有精炼档、静态数值、被动阈值/上限和持续时间。百分比按十进制指数解析为比例，避免转换时增加一次二进制除法舍入。绑定、属性、状态及捕获组件的独立计算检查见tests/unit/engine/calculation/context.test.ts；这些明确计算设定不声称为玩家配装或实录战斗。

tests/unit/engine/calculation/reaction-events.test.ts按真实技能参数独立核算事件的多个输出、独立剧变与明确多人聚合，并检查单输出选择、未知合计和共享预算。库存占用检查直接读取获授权的Mona原件并派生共享引用，原件不存在时明确skip；不生成替代库存或伪造实际穿戴。此处的数学组件检查不表示正式目录的角色绑定、机制和全流程已全部闭合。

tests/unit/engine/calculation/bound-aggregate.test.ts使用薇斯纳、冰旅行者及兼容武器的实际目录成长值，独立核算配装绑定的星扩散贡献、逐状态排序和换装重算；黎明神剑按精一14%暴击率及生命阈值验证条件读取。独立/联合模型、未知资格、捕获协议派生、事件合计与共享预算分别检查。捕获协议派生不宣称星扩散实际采用该捕获策略，这些组件检查不提升完整角色覆盖。

[普通输出采用范围](sources/calculation-hits/ordinary-bindings.json)记录固定来源、命中身份及证书命座范围。`tests/unit/engine/calculation/build-context.test.ts` 用固定参数表核算天赋等级加成、条件暴击、增幅、生命转攻击、真实库存共享和未知队友机制。

`tests/integration/calculation-coverage.test.mjs` 检查目录加载后保留原始数值、命中和解锁分支，并核对覆盖证书缺失时的报告。

[星伤命中采用范围](sources/calculation-hits/stellar-bindings.json)登记薇斯纳的状态、单段规则、来源和C0–C6边界。tests/unit/engine/calculation/stellar-character.test.ts从固定成长与原天赋参数独立推导856组可用条件，另检查未知或不满足条件、层数越界、无突破门槛的星耀祝礼、队友元素身份和离线闭包。角色JSON的talents.hits集中维护34个命中及35个输出。

[星伤装备采用](sources/calculation-effects/stellar-equipment.json)记录蝶变的两种风及血红之证的套装增益。获授权的Enka展柜原件覆盖薇斯纳90级C2、天赋8/10/10、蝶变精一及血红之证四件。`tests/integration/vesna-production-chain.test.ts`和`tests/browser/development/vesna-production-chain.spec.ts`核验同一真实配装经确认导入、显式补足战斗条件、同步和Worker复算、精炼比较、保存重开及角色参数重导入。展柜证明配装，战斗条件属于明确输入，游戏内伤害观测仍待补。原件缺失时跳过对应检查。

[动作采用记录](sources/calculation-hits/vesna-actions.json)保留同版本天赋/命座原文与风翎机制研究的来源关系。data/actions/vesna.json维护15个动作、6类状态和14条转换；18项源条件软件检查核对整肃独立过期、入场清除/C2满层、最高境界次数/C1首次免费、C6独立窗口、资源不足及阶段快照。5项动作导入检查核对独立文件、离线闭包、精确版本和不修改已有快照。数值审计另直接比较14项动作规则，并检查持续/能量参数的来源单位。

动作时长、取消和命中偏移没有录制依据，保持null。剑气以六分之一层为整数单位；每次明确风翎产生可恢复一单位，无须伤害命中，但自动产生时刻仍未接入。资源容量只知来源可证明的下界，非免费消耗必须明确提供；C6是否增加整肃及重复使用规则保持缺口。辉映优先级、能量/冷却可执行性及自动派生事件仍待实现。这些数学和协议检查没有产生玩家轴或录制；实际游戏观测继续单独登记。

无元素旅行者的 [普通攻击单位核对](sources/character-text/traveler-normal-units.json)补齐固定 LunaGC 原表的7条描述键及9项ratio单位，参数数值保持。该记录只确认参数与文本，不扩大机制支持。

月/星公式按 [KQM原图与符号记录](sources/kqm-web/2026-11-15/reaction-formulas.json)维护直接/反应分支、固定加值插入点及独立乘区，精通比例以小数存储。原图采集在忽略的审阅目录；纯公式组件的独立核算与实体绑定、事件及多人聚合的覆盖分别报告。系统验收按公式完整性、全目录覆盖度与软件检查执行，开发者后续手动进行实际游戏测试。

同一展柜中瓦雷莎「大火山崩落」引用爆发的 param5，按下落攻击伤害匹配增益。类别依据为[瓦雷莎天赋 combat3 原文](sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/talents/varesa.json)。时间轴和独立计算器可用同一普通直伤试算，保留所选输出相关的机制缺口。流浪乐章和追忆之注连四件套的效果范围按固定说明限定至装备者。薇斯纳与瓦雷莎、菲林斯、雷电将军组成的四人试配另核对三位非冰风队员提供的75点精通，数值对照见 `tests/helpers/recorded-vesna.ts`。

#### 分项输入

来源为固定 genshin-db 天赋、命座与 KQM 机制页，[事实摘要](sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/count-scaling-facts.json)保留逐项依据。输入表达分项事实，自动积攒、跨命中施放关联和可达性状态为待接入。绫人、雷电、优菈的完整角色依赖继续按各自支持状态处理。

#### 捕获、基础加值与内容规则

[基础加值事实](sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/base-damage-bonus-facts.json)采用固定 genshin-db 与 KQM 的武器、云堇机制依据。云堇基础组件按独立公式核对，完整支持仍待上述依赖。

#### 反应、状态与入口

命中查询已接入蒸发、融化、超激化、蔓激化及薇斯纳已审阅的直接星扩散输出。独立剧变与月星多人聚合在引擎中具有显式事件入口。延迟或持续反应、元素附着历史推演及普通页面的多人反应入口待接入。[反应事实](sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/reaction-facts.json)及player.json保存来源公式和等级系数。

战斗状态支持生命比例、站场和护盾区间、命中覆盖及读取来源；敌方状态、受击、有效治疗和自动触发待接入。生命比例由黎明神剑等既有条件读取。

菲林斯爆发中间段和最终段、哥伦比娅月露涤荡单段及兹白月转时隙第四段额外伤害已绑定相应月伤模板。单段倍率与伤害类别来自固定天赋表。时间轴接入明确贡献者的月感电、月结晶与星扩散聚合，以及薇斯纳明确动作和初始状态求值。试算比较保留覆盖诊断。记录完整性、自动次数与冷却、完整修订类型和全目录机制仍待接入。

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

官方接口为 https://enka.network/api/uid/618285856/。当前 `official-example.json` 的 SHA-256 为 `e41b52d6abe70e2d571ac1da7505a09e209391c01dfbce7c8bdbe99fd971ea45`。伤害计算、战斗状态和快照回归使用其中的六命行秋与班尼特五件宗室。11 月 13 日的摘要仅标识当次响应。公开示例和用户 Mona 库存各自保持账号来源。

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
