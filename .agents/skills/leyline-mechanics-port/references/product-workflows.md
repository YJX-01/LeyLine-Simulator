# 产品功能与数据归属

## 账号、装备与文件

| 操作 | 入口和必须保留的语义 |
| --- | --- |
| Enka 展柜导入 | 在 `src/web/src/domain/enka-import.ts` 找预览与确认，在 `src/web/src/domain/showcase-inventory.ts` 查库存匹配。查询、预览、勾选、确认分阶段进行，确认时复核账号和相关快照。默认合并仅替换所选角色的五部位引用，缺槽清空，保留旧库存及其他引用。“仅快照”和单件入库有各自的写入范围。 |
| Mona 库存导入 | `src/web/src/domain/mona-import.ts` 的 `previewMonaImport` 与 `confirmMonaImport` 共用于文件及粘贴。区分重复、来源身份冲突和用户确认更新。穿戴备注保留为来源信息。 |
| 选装、保存配置、应用组合、删除实物 | 从 `src/web/src/domain/account-configurations.ts`、`src/web/src/domain/artifact-combinations.ts` 和 `src/web/src/domain/artifact-references.ts` 追引用关系。多份方案可引用同一件实物。应用配置或组合先更新目标角色草稿；删除库存后，既有方案保留脱库快照。 |
| 保存、取消、旧文件、跨账号 | 当前文件契约见 `src/schema/README.md` 和 `docs/files-and-state.md`。账号、轴项目、内容定义库分别持久化，跨域传独立快照。版本不匹配时保留当前编辑和原文件。异步保存只确认实际写出的快照，写入期间的新编辑仍是草稿。 |

**例：两件圣遗物显示值相同，导入后数量不对。** 先区分展柜匹配与 Mona 来源身份。展柜合并逐项比较套装、部位、稀有度、强化、主词条和值及有序副词条；消除百分数换算尾差，保留有意义的精度和顺序。复用合适的库存 ID，保留显式副本与跨账号隔离。原始协议和确认规则以 `src/web/README.md` 的“外部导入协议”为准。

**例：同一组合换角色后，有效条数不同。** 先查 `src/web/src/domain/effective-roll-basis.ts`。平均条数用保存的副词条值除同稀有度四档单次值的平均。生命、攻击、防御的有效条数先将固定副词条除对应白值，与比例副词条合并。独立组合保存创建时的分母；应用后的角色草稿按目标角色及武器重算。显示舍入只在展示层处理。完整口径见 `src/web/README.md` 的“平均条数与有效条数”。

## 独立计算器、时间轴与 Worker

- **独立计算器。** 从 `src/web/src/pages/DamageCalculator.vue` 到 `src/web/src/domain/damage-calculator.ts`。`calculator-hits.ts` 管命中选择，`calculator-buffs.ts` 管增益选项，二者同属 `src/web/src/domain`。载入账号或展柜后在计算副本上编辑。独立计算器保有自己的配装、候选和基准，重新打开已保存的设定时从输入复算。
- **同轴换装。** 时间轴项目的候选编辑在 `src/web/src/pages/TeamLoadoutEditor.vue`。固定同一条轴，分别重算基准和候选。伤害变化、能量是否够用、攻速及持续窗口能否执行，需要各自的证据。
- **事件和未知输入。** `src/web/src/pages/TimelineEditor.vue` 录入动作、命中与观察，`src/web/src/domain/real-project.ts` 构造项目记录。核对主体、时间、同刻顺序和目标；施放、命中和造盾是不同事件。锁面板还要检查捕获来源和时刻。缺参数或模板是定义错误，缺战斗事实看 `requiredInputs`，两种问题交给不同入口处理。
- **结果过时。** 沿 `src/web/src/domain/axis-task.ts`、`src/web/src/workers/axis.worker.ts` 和 `src/web/src/stores/axis-workspace.ts` 区分发出的请求、引擎读数和页面采纳的结果。检查会话、任务和修订标识，编辑和取消后的迟到结果须丢弃。公式和支持范围以 `docs/calculation.md` 为准。
