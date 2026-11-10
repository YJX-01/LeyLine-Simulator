# P2.5 真实游戏数据快照

版本：genshin-db-8e5badd-real-v1。来源固定为 theBowja/genshin-db 提交 `8e5badd60b5d894284ccc927a56c9683529d2592`；正式元数据在 `src/game-data/data/characters/`、`weapons/`及`artifact-sets/`（统一JSON/schema），原始捕获证据在 `tools/data/sources/catalog/genshin-db/`，产品快照在 `src/game-data/generated/`。目录为该固定快照中的 126 个角色、256 件武器、63 套圣遗物，不声称是游戏当前最新数量。

## 数据内容与精度

- 角色基础生命/攻击/防御、固有暴击/暴伤、突破属性与分属性成长曲线来自 `src/data/stats/characters.json` 和 `src/data/curve/characters.json`，分别保留基础值、曲线、突破增量；不把显示面板倒推成原始值。
- 武器基础攻击、副属性、各自曲线及突破增量来自 `src/data/stats/weapons.json` 和 `src/data/curve/weapons.json`。低星武器的突破数组只有五阶段，不能假造90级属性；由配装校验明确拒绝超上限。
- 天赋参数来自 `src/data/stats/talents.json`，中文技能名来自 `ChineseSimplified/talents/`。首批执行琴点按战技、凯亚战技、行秋战技两段，各段保留十五级数值；角色等级/突破决定当前合法天赋上限。其他技能仅列资料名称，执行支持明确为否，不将未映射参数冒充可执行倍率。
- 行秋突破4的固有水伤20%以通用静态 modifier 保存，依据本地中文技能资料“虚实工笔”；不写进引擎角色特判。
- 首批武器无锋剑、银剑、西风剑、祭礼剑、旅行剑、黎明神剑、腐殖之剑支持伤害面板。西风产球、祭礼冷却重置和旅行剑治疗不模拟、不自动生成命中。黎明按明确生命比例严格高于90%判断；腐殖增伤及暴击只对战技生效。
- 套装静态2件效果按中文原文和数值明确映射；未知条件、4件效果及目前单位模型无法表示的效果保留不支持原因，不能冒充完整伤害。

圣遗物五星0—20级主词条来自 `src/game-data/data/legacy/ArtifactStat.json`，百分数在转换边界转为小数，固定生命/攻击和精通不缩放。该表精度按字段保留：例如20级攻击46.6%、暴击31.1%、生命4780、攻击311；精通保留186.5，不能按界面取整为187。百分比不能假称取得更高精度原值。攻击、暴击、生命等20级值已与固定莫娜社区提交 `beaced4d82619aa86920d0054ab6114b5fc5608f` 的 `mona_core/src/common/stat.rs::artifact_main_stat_max_value` 对照一致；精通为明确差异，莫娜max表187采用显示取整，本项目保留旧原表186.5，导入只容忍对应显示舍入、不覆盖计算值。缺失精度不靠补零或插值伪造。

`src/game-data/data/legacy/SkillConfig.json` 仍可作旧版本交叉参考。例如琴E旧表为2.9200000762939453，本快照原始数字为2.92；保留各自来源，不把二进制浮点尾数当作更高可信度，也不混合不同版本参数。旧 P2 合成定义不改值。

## 维护、生成与校验

普通生成与校验均只读取仓库 canonical 输入：

```powershell
node tools/scripts/data/convert-real-game-data.mjs
node tools/scripts/data/convert-real-game-data.mjs --check
pnpm exec vitest run tests/unit/game-data/real.test.ts
```

只有显式维护动作 `node tools/scripts/data/capture-real-game-data.mjs` 读取本地 `.references/genshin-db`，并要求HEAD恰好为上述固定SHA，提取所用字段与原始文件SHA-256。原始哈希在捕获目录的`sources.json`；捕获仅更新证据，须审阅并合并到正式实体JSON后生成。生成器记录每个正式元数据文件和产品分块的LF归一化SHA-256。更新来源必须核对差异并升级版本，不能默默重贴旧版本标签。

数据通过异步公共入口 `@leyline/game-data/real` 按块加载，角色每10条、武器每40条、套装每30条；基础目录和主词条表独立。getter返回深副本，用户修改不污染内置库和旧轴；产品运行、测试和普通构建不从 `.references` 导入或联网抓取。

上游 MIT 许可原文保留在 `licenses/sources/genshin-db/LICENSE`。软件许可与游戏内容权利分别看待；游戏名称及数值权利归其原权利方。没有复制角色故事、长篇文章或上游可执行脚本，也没有安装或执行上游依赖。
