# P0：社区莫娜格式与搜索适配调查

调查日期：2026-11-06。范围是固定源码的静态阅读；没有安装、编译或执行上游代码，没有复制上游实现或游戏数据。结论不表示本项目已经兼容导入或接入优化器。

## 固定版本与复现

按照 `docs/references/sources.json`，在仓库根运行：

```powershell
git -C .references/mona-community rev-parse HEAD
git -C .references/genshin-db rev-parse HEAD
git -C .references/kqm-tcl rev-parse HEAD
```

实际分别得到 `beaced4d82619aa86920d0054ab6114b5fc5608f`、`8e5badd60b5d894284ccc927a56c9683529d2592`、`7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5`，均与清单一致。以下莫娜路径均相对 `.references/mona-community/`。证据可用固定提交的 [GitHub 源码入口](https://github.com/1803233552/genshin_artifact/tree/beaced4d82619aa86920d0054ab6114b5fc5608f)复查，不依赖分支当前 HEAD。

## 输入格式与单位

`src/types/artifact.ts` 定义 `IArtifactContentOnly`：`setName`、`position`、`star`、`level`、`mainTag: {name,value}` 和 `normalTags: {name,value}[]`。槽位为 `flower/feather/sand/cup/head`；库存对象另有 `id`、`contentHash` 和 `omit`。`src/utils/artifacts.ts::importMonaJson` 实际读取以这五个槽位命名的数组，并可读取每件的 `equip`。这与 Rust/WASM 的输入形状不同，适配时不能直接把导出 JSON 当成 WASM 参数。

`src/utils/converter.ts::convertArtifact` 将槽位映射为 `Flower/Feather/Sand/Goblet/Head`，套装和属性名转换后输出 `set_name/slot/level/star/main_stat/sub_stats/id`；属性是 `[名称, 数值]` 二元组。`convertStat` 原样传递 `stat.value`，不会除以100。`src/utils/artifacts.ts::displayedTag` 明确以 `value * 100` 展示百分数，并给出 `attackPercentage: 0.2 → 20%` 的注释。故百分比/暴击/充能/伤害加成采用比例（20% 为0.2），固定攻击、生命、防御和精通采用属性点。`mona_core/src/artifacts/artifact.rs::ArtifactList` 直接累加主副词条数值，进一步印证该边界。

导入器以完整内容哈希识别已有物品，并用去掉数值的哈希猜测升级；它不保证两件完全同属性实物的独立身份。我们的后续适配应保留实例 ID、导入批次和来源，不能照搬内容去重作为库存唯一性。上游 TypeScript 使用 `number`，Rust `Artifact.id` 为 `u64`；桥接需限制 JS 安全整数或使用可逆字符串映射，禁止无声丢精度。

## 单人目标与算法入口

`mona_core/src/target_functions/target_function.rs::TargetFunction::target` 接收单人的 `SimpleAttributeGraph2`、角色、武器、圣遗物和敌人，返回 `f64`。Rust 层可实现该 trait，但其接口并非本项目完整时间轴、全队候选和来源诊断协议。

`mona_wasm/src/applications/optimize_artifacts/interface_wasm.rs::OptimizeSingleWasm::optimize` 反序列化 `JsValue`，经 `TargetFunctionInterface` 建立预设目标，或在 `use_dsl` 时构造 `TargetFunctionDSL`。输出前100项。它没有接受任意 JavaScript 求值函数的参数。`mona_wasm/src/applications/common.rs::TargetFunctionInterface` 暴露预设枚举、配置及可选 DSL 源码；`target_function/dsl_tf.rs` 运行上游 VM，读取名为 `result` 的变量，并清除局部状态。其 `get_target_function_opt_config` 仍是 `todo!()`，构造/读取结果使用 `unwrap()`，不能据“有 DSL”判断任意输入安全或完整可用。

`applications/optimize_artifacts/algorithm.rs::SingleOptimizeAlgorithmName::get_algorithm` 的实际映射尤其需要核对：`AStar` 指向 `CutoffAlgo2 { accuracy_factor: 1.0 }`，`Naive` 指向 `AStarCutoff`，`Heuristic` 指向混合算法；名字不等于穷举或最优性证明。`algorithms/cutoff_algo2.rs` 建立属性/套装启发式及 super artifact，`is_better_than_current_least` 用代理配置得分乘 `factor_a` 与当前末位比较后剪枝。`weight_heuristic.rs::NaiveWeightHeuristic` 通过基础属性和虚拟装备调用目标来估计权重。

对于可非单调、含阈值、历史、候选相关图结构的自定义轴目标，尚无证据证明这种代理配置是合法上界。需要先用独立微型穷举验证，或更换/禁用不能证明正确的剪枝；不能只把本项目公式翻译成 DSL 就宣称搜索等价。

## 全队占用与全队目标边界

`applications/team_optimize/interface_wasm.rs::TeamOptimizationWasm::optimize_team2` 接收单人接口列表、权重及库存，调用 `team_optimize.rs::optimize_team_multi_single`。`ArtifactSet` 用 `HashSet<u64>` 保存实物 ID，`try_search` 对已占用集合与下一成员候选求交，交集非空则拒绝，因而具备按 ID 防止全队重复占用的机制。重复 ID 或错误合并仍会破坏库存语义，导入时必须先校验。

实际全队分数为单人候选分数的加权和：`current_value + node.value * weights[...]`。`TeamTargetFunction` trait 虽存在于 `mona_core/src/team_target/team_target_function.rs`，但此搜索中对应调用是注释，不能当成已经接通的任意全队回调。

算法先截取单人候选再组合；冲突时排除高冲突 ID 重算，预算耗尽后有贪心 fallback。`hyper_param.rs` 默认 `work_space=1000`、`max_re_optimize=5`、`max_search=200000`、`count=100`。因此即使约束满足，也不是任意全队目标的全局最优保证。队友换装改变目标角色 Buff、快照或累计依赖时，独立单人评分不能一般性分离。另一个细节是 `single_optimize.rs::optimize_single_interface_wasm` 直接调用 `to_target_function`，与独立 WASM 入口的 DSL 分支不同，不能假设 `optimize_team2` 自动支持同样的 DSL 目标。

## 桥接、许可与后续验收

已有 `wasm_bindgen` + `serde_wasm_bindgen` 边界可供设计参考，但本轮不引入 Rust/WASM。后续可选择新增 Rust trait 适配、批量候选生成后由 TypeScript 完整轴求值，或证明等价的受限公式转换；这些都是待验证方案，不能冒充现有能力。逐候选跨语言回调的开销、异常、取消、预算和可序列化版本恢复都尚未测量。

根 `LICENSE` 是 Copyright (c) 2021 wormtql 的 MIT，采用实质代码片段需保留版权及许可文本。该许可检查只确认源码仓库声明，不能推导游戏数据、图片、第三方扫描工具和外部文章具有相同授权。genshin-db 的元数据也不等于玩家账号接口；角色接口尚未选定不阻塞本轮合成输入。

后续 P5/P6 的必要验证：真实导出样本的槽位和单位映射、两件相同词条物品身份、重复导入策略、全队唯一占用、锁定约束、队友候选改变目标依赖、预算终止与最优性声明，以及与独立穷举的目标值逐项对照。本轮仅完成上述固定源码与 SHA 核对，尚未运行上游算法、测量桥接性能或宣称正式兼容。
