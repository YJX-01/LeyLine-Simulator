# P2.5 最小契约与文件所有权

基线：6736ab1。修订：real-game-v1。范围：本地固定快照目录、真实配装面板、琴/凯亚/行秋零命战技独立命中、莫娜圣遗物导入。原 P2 文件规则保持不变。

共享类型已发布在 src/schema/src/real-game.ts，schema 公共导出已接入。轴保留 schemaVersion 1 / workbench-v1，兼容扩展 actor.realBuild、record.realDamage、project.enemy 和受控 game-damage 节点。真实配装携带完整采用的数值快照，离线不查当前库。旧节点与旧数值不升级。

- 主 agent：共享 schema/公共导出/根配置、RealGamePanel.vue 与 WorkspaceShell 集成、表达式中文显示、最终测试和文档。
- 数据 agent：src/game-data/src/real.ts、src/game-data/src/real-data/**、docs/constant/real-game/**、tools/scripts/convert-real-game-data.mjs、对应测试及 docs/references/p2-5-data.md。不改 package.json/index。real.ts 导出异步 loadRealCatalog/getRealCharacter/getRealWeapon/getRealSet 及同步版本常量；独立数据类型结构兼容 schema，不依赖 schema。目录返回 {version,characters:[{id,name,element,weaponType,supported,reason}],weapons:[{id,name,weaponType,rarity,supported,reason}],sets:[{id,name}]}；另导出异步 getArtifactMain(): Promise<Record<RealStat,number[]>>。JSON 按块分割，不能引入大于现有预算的 JS。正式 canonical 输入在 docs/constant/real-game，构建不读 .references。
- 引擎 agent：src/engine/src/real-game.ts、src/engine/src/real-game.test.ts、src/engine/src/workbench/index.ts 及相关测试。公开 resolveRealBuild(build) => {status:'complete'|'partial'|'invalid',stats:Record<RealStat,number>,contributions:[{source,stat,value}],diagnostics:string[]}；evaluateRealDamage(build,damage,enemy,extraBonus=0) => 同状态、value:number|null、panel、parts:{attack,multiplier,bonus,crit,defense,resistance}（各 number|null）、diagnostics。主统一 engine index 导出。未知暴击/反应不静默假定，不支持装备/命座/技能不得完整计算；existing区间增伤应与真实增伤相加，不能乘两次。无旧模拟器角色回调。
- 账号导入 agent：domain/account.ts / account*.test.ts / mona*.ts、stores/account.ts、AccountLibrary.vue、ArtifactEditor.vue、MonaImport.vue 及测试/fixtures/mona/**。AccountCharacter 可选 realBuild: RealBuild；AccountArtifact 可选 real: RealArtifact；parseAccount 兼容旧格式且校验新字段。莫娜预览/确认后写库存，身份与重复导入策略明确，不静默转移装备。真实角色/配装 UI 由主写 RealGamePanel，传入 props mode: 'account'|'axis'、accountCharacterId?:string（账号栏已有选择）；主自行接入调用。

首批伤害范围：琴点按 E、凯亚 E、行秋 E 两段，普通/爆发资料可查但未核验命中标不支持。零命；支持静态固有属性（包括行秋突破4的水伤20%）。初始配装默认等级90/突破6、武器90/突破6、天赋技能9（可按合法突破调整）、明确无反应和不暴击、标准目标90级各抗性10%。武器至少无锋剑/银剑/西风剑/祭礼剑具备伤害计算支持（产球/重置不模拟，明确不生成额外命中）；可增加已核对静态武器。套装优先静态2件效果，未核验4件效果明确部分支持。

验收：三套真实配置独立计算、成长/突破边界、行秋分段、换装/天赋变化、未知/不支持保护；莫娜单位/精度/身份/重复导入/转移预览；旧四例及10560保持；账号/轴/定义快照隔离；桌面/网页/Worker/CLI往返，原检查和预算不变。

## 集成补充

real-game-v1 兼容扩展：RealArtifact 可携带 inventoryAccountId，单件优先于 build 的默认账号，防止切账号混合候选丢失身份范围。引擎输出另含 issues 与 categoryModifiers，按技能类别应用已核验武器属性。异步角色/装备/导入均校验原对象或修订；保存签名忽略 JSON 对象字段顺序、保留数组顺序，兼容旧恢复记录。原 schemaVersion 与 CLI 入口不变。
