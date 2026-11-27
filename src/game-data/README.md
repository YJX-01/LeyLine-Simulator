# game-data

`data` 下的角色、武器、圣遗物套装和可选动作各有目录，文件名即实体 ID。列表先按文件名排列基础实体，再按游戏发布顺序追加旅行者形态。公共表在 `data/tables`，目录版本取软件版本。

角色维护与交换共用[角色元数据契约](../schema/README.md#结构化内容与配装契约)。天赋 `parameters` 保存各级数值，`hits.scaling` 绑定属性、倍率及可选计数，`outputs` 指定伤害族和条件。`progression.curveIds` 引用共同成长曲线，`support` 描述已采用的计算范围。`src/character-metadata.mjs` 和 `src/character-hits.mjs` 负责装配。

Vite 的 `catalog-plugin.mjs` 向列表提供索引字段，按需加载所选实体。`src/link-content.mjs` 以完整身份解析依赖，离线工具使用同一加载路径。`pnpm data:check` 编译正式目录并直接核对来源数值。`node tools/scripts/data/audit-calculation-coverage.mjs --json` 输出逐条覆盖范围、来源、缺口、命中绑定和效果。支持输出需有已采用的证书及可达依赖。`--require-complete` 用于检查正式目录是否全部闭合。

角色专属模板和规则写入角色文件的 `formulas`、`effects`，装备专属定义维护在各自的 `calculation.bundle`，由 `ruleIds` 引用。跨实体的模板配置、反应参数、等级表和来源集中在 `data/calculation/common.json` 和 `reactions.json`，由 `tools/lib/calculation-library.mjs` 装配。算法及固定常数由引擎的 TypeScript 模板维护。独立反应按需读取等级或精通，直接月星分支使用各自参数。

交换文件引用已安装的公共曲线与模板，自定义曲线保存在文件内，通过相应版本的共同求值器离线复算。引擎的 `collectCalculationRoots` 按规定的根取得可达定义与来源。角色更新候选保留该实体的专属计算所有权。

可选动作按完整 `DefinitionRef` 关联角色，`getCharacterActions` 在版本不匹配时返回 `null`。装配时共同编译动作及其所选角色，动作时序、规则和来源在独立文件维护。具体动作和缺口见[计算支持与验证资料](../../tools/data/README.md#计算支持与验证资料)。

[套装简称表](data/tables/artifact-set-short-names.json)、`enka-catalog.json`、`mona-set-aliases.json`、`character-effective-stats.json` 和 `effective-roll-basis.json` 提供展示、导入映射和有效条数的运行数据。`artifact-main.json` 分别保存四星 17 项与五星 21 项主词条值。套装 `rarities` 保存合法星级集合，目录 `rarity` 展示其最高值。

[内容规范](../../docs/content.md)维护通用语义，[资料与来源](../../tools/data/README.md#内容采用与精度核对)记录使用的来源及数值、文本和星级采用。

## 逐角色核对计算器卡片

运行 `node tools/scripts/data/review-calculator-cards.mjs varesa` 查看瓦雷莎的伤害和增益清单。把参数换成另一个角色 ID 即可继续核对。清单列出实际伤害类型、来源、编号和置顶顺序，同一技能下的不同命中或增益可凭 ID 区分。

在对应角色 JSON 的 `calculator` 中逐项填写。可以每次只改一项，保存后用 `node tools/scripts/data/review-calculator-cards.mjs <角色 ID>` 复看，用 `pnpm data:check` 校验正式目录。[瓦雷莎示例](data/characters/varesa.json)

| 字段 | 用法 |
| --- | --- |
| `hits`、`buffs` | 用本定义的命中或增益 ID 作键，按需填写 `code`（编号）、`alias`（别名）、`note`（介绍）。角色天赋、固有天赋、命座授予的条目都可引用。装备条目写入武器或套装自身的 JSON。 |
| `pinnedHits` | 按想看到的顺序列出角色命中 ID，这些卡片只在「常用」显示一次。 |
| `groups` | 按该角色的常用程度排列类型，每项用 `type` 指定分组、`expanded` 指定默认展开状态。已配置顺序时，省略的类型排在后面并折叠。 |

清单和伤害页按具体效果筛选战斗增益。通用的攀爬、游泳、滑翔等数值会自动排除。仅用于探索的增益若使用移动速度等通用属性，在对应的 `buffs` 条目标注 `"scope": "exploration"`。含战斗效果的同名天赋按各条增益独立处理。

可排序的类型为 `skill`、`burst`、`normal`、`charged`、`plunge`、`other`、`weapon`、`set`、`reaction`、`scene`。卡片的正式名取自所属定义，倍率随实际配装计算。尚未核对的角色使用通用顺序，展开首个有条目的类型。
