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

参考 https://github.com/TwiceDrop/genshin_artifact，版本 7.2.02，固定提交 `589ac6919057709924c0c20d5a9d673fe9b0be1a`，唯一本地检出为 `.references/mona-community`。运行期使用的[套装别名表](../../src/game-data/data/tables/mona-set-aliases.json)与[Enka 目录映射](../../src/game-data/data/tables/enka-catalog.json)以及 `character-effective-stats.json`、`effective-roll-basis.json`、`artifact-set-short-names.json`、`catalog-release-metadata.json` 均直接在 `src/game-data/data/tables/` 中维护。

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

当前实物接受四星与五星，三星以下实物暂缓。schema、两条求值路径、Mona/Enka、展示、保存快照和手动表单均按实物星级取表；四星0–16、五星0–20。套装合法部位见[固定来源字段](sources/artifact-rarity/set-slots.json)。

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

首份调查记录位于 artifacts/content-candidates/artifact-rarity-2026-11-13/analysis.json。普通生成使用已采用输入。

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

全目录报告的 `singleHitModifiers` 遍历普攻、重击、下落、战技与爆发的各个直伤段。每段都按相同的配装表核对攻击、生命、防御、暴击、元素和伤害类型加成，并对照同区相加和跨区相乘。相同两件套原文的其他套装，在每种实际存在的伤害类型、元素与倍率属性组合上各取样核验。武器按可用类型加入，班尼特领域与持有者套装分别开关。期望取自本地倍率和效果原文。[套装效果](sources/catalog/genshin-db/sets.json) · [武器精炼效果](sources/catalog/genshin-db/weapons.json)

通用矩阵使用一级零命、无反应和明确的当次条件。水主的生命阈值、消耗层数、满层项和玛薇卡战意有逐档输入。未纳入的命中会在 `unsampled` 逐项给出原因，包括锁面板、可变元素及历史事件依赖。角斗士另保留全形态普攻首段，以及两件和四件在其他伤害段的差分对照。数值不符或缺必要输入会使验收失败。

### 计算支持与内容绑定

`node tools/scripts/data/audit-calculation-coverage.mjs --report artifacts/round-after.json --gaps artifacts/round-after.md` 遍历正式角色、武器、套装的伤害菜单、解锁门槛、受益对象和条件控件。JSON 的 `calculator` 保存逐项入口，`evaluatedHits` 保存实际值、独立期望、关闭增益后的基础对照和排除情形。各专项的 `rows` 保存具体设定与结果，`verified` 按实体和字段记录已经核验的条款。武器、套装、场景与共鸣使用各自的来源表。运行 `--check --require-complete` 另外检查完整机制与证据缺口。

`currentClauseInventory` 按原文字段和修饰项记录证据，`currentSceneGaps` 列出仍影响当次数值的场景字段。`--require-current` 在计算器专项仍有缺项时返回非零退出码。惊蛰的范围增加 100%，匠理等场地满五层增加 0.3 抗打断参数。传播到哪些目标及最终是否中断仍需位置和受击记录。哥伦比娅的复苏以受益者生命上限为基数，每级好感取 10%。[场地条款](sources/catalog/battle-scenes.json) · [月的守望复苏配置](sources/catalog/columbina-revival.json)

19 条秘境冲击可按输入的 `ElementLevelCo` 复核减伤前数值。固定系数表分别保留环境与角色两列。山脊守望 IV 的旧录像可辨 8419 白字，仍需改变目标抗性与防御的独立对照，以及关卡实际读取等级的证据。[秘境冲击系数与结算证据](sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/scene-hit-settlement-evidence.json)

芬德尼尔之顶的严寒和平台、太山府的阴燃之火、菫色之庭的稚雷珠共 32 条说明指向空的关卡能力入口。已固定各阶的秘境与场景 ID。通用严寒、暖源与持续火伤配置仅作排查参考，当前场景仍需对应的区域或机关绑定。太山府 1.5 版测得开战后 3 秒首次附着、此后每 30 秒再次附着，当前版本的每跳伤害和间隔仍待证。菫色之庭 IV 的两份公开画面分别显示 50 级凯亚和 80 级班尼特触发后出现 74208 雷伤。凯亚画面发表于 2.0 期间，班尼特画面发表于 2022 年 7 月且游戏版本不明。两图可辨难度 IV 与 88 级敌人，日程和各伤害数字对应的敌方身份未能核定。[固定配置与实战来源](sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/scene-environment-amount-facts.json)

独立剧变伤害在精通与反应加成后计入固定加值，再应用适用的暴击和目标抗性。绽放等反应的暴击率和暴击伤害来自对应角色的明确授予。

尼可的战技按施放时可用于转化的攻击力封顶。米提亚六命对稳态炉心归属的技能基数施加 1.15 倍率，固定反应加值另行计算。久岐忍的安心之所按施救者精通加算治疗。一心传名刀的祟灵治疗按实际武器版本取持有者攻击力。[尼可战技取值](sources/catalog/nicole-kenosis.json) · [米提亚稳态炉心](sources/meropide/combat-facts.json) · [条件治疗依据](sources/catalog/conditional-healing-sources.json)

沃雅妮莎四命治疗严格低于 40% 生命的受益者时，固定值和生命倍率先乘 1.5，再应用常规治疗加成。芭芭拉六命的复苏治疗量含溢出并计入两项治疗加成，实际恢复至多回满。七七六命的复苏已核验施救者治疗加成，受益者自身常驻受治疗加成仍缺对照。塔利雅及哥伦比娅的复苏动作确认了生命上限比例，两项治疗加成交互仍需核验。[固定动作与复苏观测](sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/character-healing-facts.json) · [月的守望复苏配置](sources/catalog/columbina-revival.json)

法尔伽狂飙突进的常规重击中，右手使用 `param12`，左手使用 `param13`。左手始终造成风伤，右手按火、水、雷、冰的队伍优先级转化。队伍无对应元素且武器未获得外部元素时，右手为物理伤害。独立数值对照覆盖五种右手伤害、普攻左右手以及旧事件的出手侧输入。[固定配置](sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/varka-charged-hands.json)

数值审计核对 TS 固定算法和 JSON 参数。防御、抗性、增幅、激化、剧变及月/星公式常数统一采用 Meropide 机制与公式事实，模板常数通过 `describeCalculationTemplate` 核对；具体页面快照由 `node tools/scripts/data/capture-meropide.mjs` 保存至 `.references/meropide/`。[Meropide 公式事实](sources/meropide/formulas.json)

`node tools/scripts/data/audit-calculation-coverage.mjs --json` 编译正式目录的依赖闭包，按输出列出证书命座范围、来源和缺口。完整命座、角色和装备分支分别判断，外部 `declared` 证据仍待本地采用，未闭合条目标记 `unavailable`。报告同时包含命中绑定和效果，`--require-complete` 用于全目录验收。[内容包说明](../../src/game-data/README.md)

逐项报告可用 `node tools/scripts/data/audit-calculation-coverage.mjs --report artifacts/roster-calculation-acceptance.json --gaps artifacts/roster-calculation-gaps.md --check --require-complete` 生成。每个命中保留本地倍率的独立算式期望和引擎结果。有非零增益的命中另存关闭增益后的对照。祝赐覆盖持有者属性、受益队员、伤害族以及封顶前后，共鸣覆盖队伍人数、触发对象和到期。场景与装备分别记录持续时间和合法精炼或件数门槛的结果。角斗士与乐团按五类武器测试，冰风按命中前的附冰或冻结判定，深林按命中的敌人和八秒有效期判定。千岩四件核对战技命中护盾时的零伤害、后台触发及两名持有者刷新同一增益。花海四件按持有者实际受伤逐层计时。守护之心按队伍元素去重并区分四元素共鸣自身的抗性。[战斗条款](sources/catalog/combat-lifecycle.json)

菲林斯在 90 级零命、十级爆发、一级精一新手长枪、无圣遗物和敌方 10% 雷抗的条件下，攻击力为 374.8372196，固有天赋按攻击力的 8% 提供 29.986977568 元素精通。满辉且附近有雷暴云时，计入满辉的 20% 月感电增伤后，两段非暴击对照值约为 1677.438474、2439.910509。再计入月兆祝赐每 100 攻击力增加的 0.7% 月感电基础伤害，两段分别约为 1721.452121、2503.930358。关闭附近雷暴云条件仅排除额外一击。

伊法的每点救援要义对扩散和感电提供 1.5% 增伤，对月感电提供 0.2%，对星扩散提供 0.24%。冒险家四件套的固定配置给出 1 秒间隔和每次 6% 生命上限，五秒全程的基础总量为 30%。这两项按实际受益人核验。装备回复与治疗加成的交互仍缺独立记录。[救援要义](sources/catalog/ifa-rescue-reactions.json) · [冒险家回复配置](sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/equipment-healing-facts.json)

共同效果的[采用对应](sources/calculation-effects/retained-rules.json)关联现有内容规则、静态修饰与新的直接JSON定义。[固定来源字段](sources/calculation-effects/catalog-facts.json)保留原精炼字符串和套装效果文本；数值审计直接比较所有精炼档、静态数值、被动阈值/上限和持续时间。百分比按十进制指数解析为比例，避免转换时增加一次二进制除法舍入。绑定、属性、状态及捕获组件的独立计算检查见tests/unit/engine/calculation/context.test.ts；这些明确计算设定不声称为玩家配装或实录战斗。

tests/unit/engine/calculation/reaction-events.test.ts按真实技能参数独立核算事件的多个输出、独立剧变与明确多人聚合，并检查单输出选择、未知合计和共享预算。库存占用检查直接读取获授权的Mona原件并派生共享引用，原件不存在时明确skip；不生成替代库存或伪造实际穿戴。此处的数学组件检查不表示正式目录的角色绑定、机制和全流程已全部闭合。

tests/unit/engine/calculation/bound-aggregate.test.ts使用薇斯纳、冰旅行者及兼容武器的实际目录成长值，独立核算配装绑定的星扩散贡献、逐状态排序和换装重算；黎明神剑按精一14%暴击率及生命阈值验证条件读取。独立/联合模型、未知资格、捕获协议派生、事件合计与共享预算分别检查。捕获协议派生不宣称星扩散实际采用该捕获策略，这些组件检查不提升完整角色覆盖。

[普通输出采用范围](sources/calculation-hits/ordinary-bindings.json)记录固定来源、命中身份及证书命座范围。`tests/unit/engine/calculation/build-context.test.ts` 用固定参数表核算天赋等级加成、条件暴击、增幅、生命转攻击、真实库存共享和未知队友机制。

`tests/integration/calculation-coverage.test.mjs` 检查目录加载后保留原始数值、命中和解锁分支，并核对覆盖证书缺失时的报告。

[薇斯纳定义](../../src/game-data/data/characters/vesna.json)登记薇斯纳的状态、单段规则、来源和C0–C6边界。tests/unit/engine/calculation/stellar-character.test.ts从固定成长与原天赋参数独立推导856组可用条件，另检查未知或不满足条件、层数越界、无突破门槛的星耀祝礼、队友元素身份和离线闭包。角色JSON的talents.hits集中维护34个命中及35个输出。

[星伤装备采用](sources/calculation-effects/stellar-equipment.json)记录蝶变的两种风及血红之证的套装增益。获授权的Enka展柜原件覆盖薇斯纳90级C2、天赋8/10/10、蝶变精一及血红之证四件。`tests/integration/vesna-production-chain.test.ts`和`tests/browser/development/vesna-production-chain.spec.ts`核验同一真实配装经确认导入、显式补足战斗条件、同步和Worker复算、精炼比较、保存重开及角色参数重导入。展柜证明配装，战斗条件属于明确输入，游戏内伤害观测仍待补。原件缺失时跳过对应检查。

[动作采用记录](sources/calculation-hits/vesna-actions.json)保留同版本天赋/命座原文与风翎机制研究的来源关系。data/actions/vesna.json维护15个动作、6类状态和14条转换；18项源条件软件检查核对整肃独立过期、入场清除/C2满层、最高境界次数/C1首次免费、C6独立窗口、资源不足及阶段快照。5项动作导入检查核对独立文件、离线闭包、精确版本和不修改已有快照。数值审计另直接比较14项动作规则，并检查持续/能量参数的来源单位。

动作时长、取消和命中偏移没有录制依据，保持null。剑气以六分之一层为整数单位；每次明确风翎产生可恢复一单位，无须伤害命中，但自动产生时刻仍未接入。资源容量只知来源可证明的下界，非免费消耗必须明确提供；C6是否增加整肃及重复使用规则保持缺口。辉映优先级、能量/冷却可执行性及自动派生事件仍待实现。这些数学和协议检查没有产生玩家轴或录制；实际游戏观测继续单独登记。

无元素旅行者的 [普通攻击单位核对](sources/character-text/traveler-normal-units.json)补齐固定 LunaGC 原表的7条描述键及9项ratio单位，参数数值保持。该记录只确认参数与文本，不扩大机制支持。

月/星公式按 [Meropide 公式与符号记录](sources/meropide/formulas.json)维护直接/反应分支、固定加值插入点及独立乘区，精通比例以小数存储；纯公式组件的独立核算与实体绑定、事件及多人聚合的覆盖分别报告。系统验收按公式完整性、全目录覆盖度与软件检查执行，开发者后续手动进行实际游戏测试。

同一展柜中瓦雷莎「大火山崩落」引用爆发的 param5，按下落攻击伤害匹配增益。类别依据为[瓦雷莎天赋 combat3 原文](sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/talents/varesa.json)。时间轴和独立计算器可用同一普通直伤求值器，保留所选输出相关的机制缺口。流浪乐章和追忆之注连四件套的效果范围按固定说明限定至装备者。薇斯纳与瓦雷莎、菲林斯、雷电将军组成的四人试配另核对三位非冰风队员提供的75点精通，数值对照见 `tests/helpers/recorded-vesna.ts`。

#### 分项输入

分项输入采用本地天赋、命座与 KQM 机制资料。绫人的浪闪按战技、命中、退场及到期更新。二命从三层起改变生命上限和后续瞬水剑伤害。突破四在后台且能量低于 40 点时每秒恢复 2 点。六命的两次追加瞬水剑各取 450% 攻击力，按各自记录的时刻结算。缺少时刻时保留已知小计。雷电将军的愿力参与首刀及后续刀击的独立倍率计算。优菈光降之剑可按给定层数求值。各角色尚待核验的条件列在逐项报告。

#### 锁面板

香菱「旋火轮」的起手第一、二段读取本击面板。第三段与后续旋转命中可关联时间轴上玩家记录的爆发捕获点，读取当时的攻击力、暴击率、暴击伤害、火元素伤害加成及增幅反应用的元素精通。敌人的抗性按各次命中时刻结算。本地 KQM TCL 的 `docs/characters/pyro/xiangling.md` 记录了各段和施放后约 46 帧的实测时机。[香菱定义](../../src/game-data/data/characters/xiangling.json) · [命中属性捕获](../../docs/calculation.md#命中属性捕获)

#### 捕获、基础加值与内容规则

海染砗磲的泡沫持续 3 秒，累计创建者的治疗量，含溢出，上限 30,000。七七与珊瑚宫心海同时装备时，全队只允许一个泡沫，每人独立计算 3.5 秒的生成冷却。套装验收交换两人次序，核对套装件数、创建时刻和物理抗性结算。命中半径 5.5 米内的多个目标尚待接入。[本地机制记录](sources/catalog/combat-lifecycle.json)

武器的固定数值贡献从各精炼档原文中按对应属性和条款取值。薙草之稻光精一将超出 100% 的充能效率乘 28%，攻击力加成上限为 80%。施放爆发后的 12 秒内另加 30% 充能，这部分充能同时参与武器和绝缘之旗印的换算。腐殖之剑在同一次授予中分别提高战技伤害与暴击率。[精炼条款对照](sources/catalog/equipment-modifier-checks.json)

辰砂之纺锤取持有者命中时的防御力。战技在首次造成伤害时获得加值，随后 100 毫秒内的战技命中可共享加值，经过 1,500 毫秒可以再次触发。五个精炼档均核对场上、后台、其他队员、其他攻击类别与时间边界。旧版记录中刹那之花打盾后被动失效的情形缺少当前修订的复核。云堇的基础加值按受益队员分别扣除次数。

#### 反应、状态与入口

命中查询覆盖蒸发、融化、超激化、蔓激化及薇斯纳已审阅的直接星扩散输出。独立计算器和时间轴均可新建剧变反应事件。延迟或持续反应的自动生成、元素附着历史推演仍有缺口。反应公式见[公式依据](sources/meropide/formulas.json)，1–100 级角色等级系数暂保留于[角色等级表](sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/player.json)（待第 4 步切换至 `AnimeGameData`）。

战斗记录可指定敌方生命比例、元素附着、站场、护盾、生命变化、受伤、施予治疗和接受治疗。治疗事件可包含溢出量。受伤记录使用实际扣除的伤害值，生命消耗使用单独的生命变化记录。

玛拉妮的技能可分别选择撕咬和单枚鲨鲨飞弹。目标数填 1、2 或 3，3 表示三名及以上。飞弹还需确认锁定了另一名有标记的敌人。目标数回归用例在三层浪势下核对零命和一命、三档目标数及飞弹的触发条件。[天赋原文](sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/talents/mualani.json) · [多目标系数的独立实现](https://github.com/genshinsim/gcsim/blob/main/internal/characters/mualani/attack.go#L138-L160)

在时间轴的“战斗事件记录”选择“创造护盾”，由当前选中队员在光标处记一次造盾。祭星者之望、尘光七谕和碧落之珑从这个时刻计算效果持续时间。碧落之珑也接受其持有者施放爆发的记录。[武器精炼原文](sources/catalog/genshin-db/weapons.json)

逐技能验收列出治疗量和护盾吸收量的每个详情字段。治疗的数值对照从本地天赋原始精度、角色和武器白值独立计算，并在施救者和受益人之间交换少女与游医二件套。施放治疗另核对受益人数、已有记录去重和海染泡沫伤害。擢升验收分别计算本人和队友的增幅，逐命座核对哥伦比娅与六命菲林斯、奈芙尔的月曜擢升相加；其他来源组合仍按各自证据核验。逐项报告记录原文字段、相关输入、验过的分支及待补证据。[战斗条款](sources/catalog/combat-lifecycle.json) · [机制与擢升依据](sources/meropide/combat-facts.json)

菲林斯爆发中间段和最终段、哥伦比娅月露涤荡单段及兹白月转时隙第四段额外伤害已绑定相应月伤模板。单段倍率与伤害类别来自固定天赋表。时间轴接入明确贡献者的月感电、月结晶与星扩散聚合，以及薇斯纳明确动作和初始状态求值。配装比较保留覆盖诊断。记录完整性、自动次数与冷却、完整修订类型和全目录机制仍待接入。

菲林斯与哥伦比娅的双人月感电期望伤害核验暂缓。该记录缺少影响暴击率与伤害的装备、角色条件。按未触发或零层补齐后，四种暴击组合均可展开，引擎的加权结果与用例的独立计算仍有差异。[月感电回归用例](../../tests/integration/vesna-production-chain.test.ts) · [当前计算范围](../../docs/product-direction.md)

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
