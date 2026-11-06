# P0 + P1 实施记录与 v1 语义

2026-11-06。本文为 P0/P1 历史记录，描述当时无界面普通伤害切片、v1 语义与验收。此后的 P2/P2.5 扩展见[实施路线](implementation-roadmap.md)及[P2.5 记录](p2-5-implementation.md)，下文“未实现”和“下一步”均指当时阶段，不作为当前状态。

公开入口为 `@leyline/engine` 的 `evaluateWorkbench(input: unknown)`；文件校验为 `@leyline/schema` 的 `workbenchProjectSchema`。最小样本见 `fixtures/workbench/ordinary.json`。本地调用：

```sh
node tools/scripts/evaluate-workbench.mjs fixtures/workbench/ordinary.json
node tools/scripts/evaluate-workbench.mjs fixtures/workbench/ordinary.json --benchmark
```

工具使用现有 Vite SSR 读取 TypeScript，无需浏览器、网络、视频和 simulateCombat；关闭目录监听及依赖扫描，避免扫描本地外部参考库。输出包含逐点值、完整轴总值、筛选目标值、结构化根/效果引用、来源、诊断及可直接序列化后复算的 plan。plan 保留完整定义和候选输入，公式引用通过 plan 中节点解析，不是独立的字符串公式或闭包。CLI 遇到 partial/invalid 以非零状态退出，JSON 结果仍可读取。

## 冻结语义：workbench-v1

- `schemaVersion: 1`、`rulesVersion: workbench-v1` 精确匹配；不相容版本拒绝进入当前解释器。定义副本同时保存 ID、version 和 source。以后修改运算语义必须另立规则版本，不原地改变 v1。
- 项目、候选、角色、记录和定义由调用者提供稳定 ID；插入/排序不生成新 ID。定义 ID、角色实例 ID、记录 ID 分别唯一；节点和效果 ID 在定义内唯一。引用使用 ID，不使用显示名。重复 ID 报 invalid。
- 时间为 0–3600000 的整数毫秒。效果区间为非空 `[startMs,endMs)`；无 action 时是轴绝对时间，有 action 时相对当前角色的匹配动作。每个匹配动作产生一个独立效果实例，窗口重叠时相加，不做覆盖或层数推断。只影响拥有该定义的角色；跨角色 Buff 是后续能力。
- 记录按 `(timeMs, order, id)` 排序，ID 用确定性字符串顺序兜底。同刻动作须先于伤害才可触发该伤害读取的效果；开始端点包含、结束端点排除。轴不被排序或求值原地修改，不生成伤害或动作。
- 数值须有限；比例/倍率均为 scalar（20% 写 0.2），固定攻击为 attack，伤害为 damage。加法同单位；乘法至少一侧 scalar；除法右侧 scalar 或两侧同单位。伤害根允许 attack 或 damage，表示本切片显式的攻击倍率基础伤害；scalar 根非法。效果必须 scalar，最终伤害为 `root × (1 + 所有有效区间效果之和)`。未声明暴击、反应、敌人减免，不能据此宣称支持真实游戏完整伤害。
- 常量、候选角色具名输入、加乘除和条件节点组成受控节点表；不执行用户代码。每次调用重新绑定角色/武器并推导效果，不缓存旧 Buff。预设与用户定义只在 source 元数据上有区别，没有角色名分支。
- 条件为 true / false / null，缺失等同未知。已知条件只读取选定分支；未知条件不代入 false 或 0。输入缺失产生 unknown，缺失节点/定义产生 missing-reference，循环、单位错误、非法运算分别诊断。仅访问实际求值分支的节点，不因未选分支缺输入阻塞。
- points 中 null 表示未得到有效伤害，diagnostics 给出原因与记录/定义/节点路径。status 为 complete / partial / invalid。全轴有未知时 totalValue 为 null；目标已知时 objectiveValue 可独立有效，status 仍为 partial。结构或引用错误时整体 invalid，汇总值不发布。空目标数组明确表示求和零项，而省略 damageIds 表示全轴。
- 表达式限制每定义 1000 节点、递归深度 128、每次调用 100000 次节点访问；超预算报告 unsupported，不偷偷截断或近似。限制不是复杂历史/概率引擎的能力承诺。
- snapshot/history/probability 只接受显式 unsupported 能力标记并诊断。未设计未来全量 AST；历史累计、快照、跨角色属性、人工覆盖、概率、库存搜索及充能均未实现。本切片候选为已经规范化的理论属性快照，不宣称完成真实装备解析或优化准入。

## 并行与范围

A（主代理）持有 schema、engine 实现、公共导出、工具与架构规则；D 在该契约发布后独立写 fixtures、手算期望及 colocated 测试；C 仅写莫娜调查；B 仅写视频调查与独立探针。四条工作流实际并行，未共同修改共享文件。集成时先确定契约/样本，再验证内核和调用工具。

内部接口较提案收敛为单一纯函数和可重建的节点表解释计划，未提前新增 prepare/compile/evaluate 的多层公开 API。原因是 P1 没有历史图、缓存和 Worker 消费者，单入口足以验证候选重绑定和保存语义；未来可在其内部引入编译图，不把静态面板做成未来系统约束。

三例独立期望与能力状态见 [算例记录](p0-samples.md)：普通例已运行，快照例 6900/7020/6600、累计例 150/180 仅保存未来输入/参考，明确不支持。莫娜源码与许可证据见 [专项调查](p0-mona-investigation.md)，视频实测见 [定位调查](p0-video-investigation.md)。账号角色接口未指定，未伪称已接通。

## 验证

环境 Node v25.9.0、pnpm 11.3.0（仓库要求 Node 22.12+，CI 使用 24）。数据检查、fixture 检查、架构检查、typecheck、全量 Vitest 21 文件 187 测试、生产构建及构建预算均通过。新内核 17 项独立回归覆盖普通手算、换装、目标筛选、同路定义、动作区间、稳定顺序、状态隔离、未知/false、分支惰性、引用/单位/循环、序列化与未支持能力。构建仅有现有 Zod 注释消除提示，不影响通过。

本轮没有 UI/Worker 修改，不运行产品浏览器回归；视频探针另行实际启动 Chromium 验证媒体能力。新增内核性能用上述 benchmark 命令测量，只作为合成切片基线，不能替代后续真实轴及搜索性能预算。

实测普通双命中 100 次求值中位约 0.027ms、p95 约 0.133ms；1000 条合成记录全量求值约 4.71ms，结果 complete。测量包含校验与结果构造，不含 Vite 启动，不是跨硬件性能保证。正式搜索基准仍待 P6；旧自动模拟算法未变，本轮不以其性能测试冒充新内核性能。

## 文件清单

- 契约/实现：`src/schema/src/workbench/index.ts`、`src/engine/src/workbench/index.ts`，两个包的 `src/index.ts` 增加公开导出。
- 样本/测试：`fixtures/workbench/ordinary.json`、`fixtures/workbench/future-samples.json`、`src/engine/src/workbench/workbench.test.ts`。
- 工具：`tools/scripts/evaluate-workbench.mjs`、`tools/scripts/probe-video-timing.mjs`；`tools/scripts/check-architecture.mjs` 为调用工具登记精确的 Vite 动态加载规则。
- 记录：本文、`p0-samples.md`、`p0-mona-investigation.md`、`p0-video-investigation.md`，均在 `docs/planning/`。

下一步应评审 v1 的单位/结果/来源契约，再进入 P2 编辑保存或 P3 跨角色效果和快照；莫娜正式桥接须独立证明目标等价和剪枝边界，不直接嫁接单人静态评分。
