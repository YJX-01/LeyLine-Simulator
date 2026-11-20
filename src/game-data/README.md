# game-data

`data` 下的角色、武器、圣遗物套装和可选动作各有目录，文件名即实体 ID。列表先按文件名排列基础实体，再按游戏发布顺序追加旅行者形态。公共表在 `data/tables`，目录版本取软件版本。

角色维护与交换共用[角色元数据契约](../schema/README.md#结构化内容与配装契约)。天赋 `parameters` 保存各级数值，`hits.scaling` 绑定属性、倍率及可选计数，`outputs` 指定伤害族和条件。`progression.curveIds` 引用共同成长曲线，`support` 描述已采用的计算范围。`src/character-metadata.mjs` 和 `src/character-hits.mjs` 负责装配。

Vite 的 `catalog-plugin.mjs` 向列表提供索引字段，按需加载所选实体。`src/link-content.mjs` 以完整身份解析依赖，离线工具使用同一加载路径。`pnpm data:check` 编译正式目录并直接核对来源数值。`pnpm data:coverage --json` 输出逐条覆盖范围、来源、缺口、命中绑定和效果。支持输出需有已采用的证书及可达依赖。`--require-complete` 用于检查正式目录是否全部闭合。

角色专属模板和规则写入角色文件的 `formulas`、`effects`，装备专属定义维护在各自的 `calculation.bundle`，由 `ruleIds` 引用。跨实体的模板配置、反应参数、等级表和来源集中在 `data/calculation/common.json` 和 `reactions.json`，由 `tools/lib/calculation-library.mjs` 装配。算法及固定常数由引擎的 TypeScript 模板维护。独立反应按需读取等级或精通，直接月星分支使用各自参数。

交换文件引用已安装的公共曲线与模板，自定义曲线保存在文件内，通过相应版本的共同求值器离线复算。引擎的 `collectCalculationRoots` 按规定的根取得可达定义与来源。角色更新候选保留该实体的专属计算所有权。

可选动作按完整 `DefinitionRef` 关联角色，`getCharacterActions` 在版本不匹配时返回 `null`。装配时共同编译动作及其所选角色，动作时序、规则和来源在独立文件维护。具体动作和缺口见[计算支持与验证资料](../../tools/data/README.md#计算支持与验证资料)。

[套装简称表](data/tables/artifact-set-short-names.json)、`character-effective-stats.json` 和 `effective-roll-basis.json` 提供展示和有效条数的运行数据。`artifact-main.json` 分别保存四星 17 项与五星 21 项主词条值。套装 `rarities` 保存合法星级集合，目录 `rarity` 展示其最高值。

[内容规范](../../docs/content.md)维护通用语义，[资料与来源](../../tools/data/README.md#内容采用与精度核对)记录使用的来源及数值、文本和星级采用。
