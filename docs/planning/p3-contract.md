# P3 契约 r1

基线：1af5778（3315a09 后仅文档整理），工作区干净。主 agent 持有 schema、公共分派、版本策略、最终验收与文档；内核 agent 持有 engine/workbench/p3.ts 和真实公式适配；UI agent 持有 P3Panel.vue、domain/p3-project.ts 和 WorkspaceShell 接线；验证 agent 持有 P3 fixture、独立单测、浏览器与桌面新流程。共享入口单一所有者。

## 版本与端口

schemaVersion 仍为 1。旧 workbench-v1 使用原求值器，拒绝 P3 字段/节点；新增 workbench-p3 明确选择新规则，不静默升级。evaluateWorkbench 是唯一公开端口，Worker、文件和 CLI 原样传递项目。结果 plan 保留原始输入，派生实例/读取轨迹仅在结果中，不回写记录。

## 受控节点

- attribute: actor（省略为当前角色）、key、unit，可带 at 记录 ID 和 phase before/after（默认 before）；无 at 为当前查询时刻。输入属性加该属性效果；真实角色 attack 从 resolveRealBuild 读取。damageBonus 为 scalar 初值0。
- capture: at 记录 ID、value 节点、phase before/after。在该记录时刻/阶段求值 value；角色上下文保持引用者。效果 captureAt 为 source 时，该效果 value 在触发动作的 before 阶段捕获，动态为默认。捕获排除自身实例，其他效果递归查询。
- history: mode sum/count、startMs/endMs 左闭右开、可选 actor/definition、initial（默认0）、cap、resetAt 记录ID数组、includeCurrent（默认false）。观察 damage 记录，sum 递归读取伤害、count 计数；resetAt 按记录顺序重置，查询只读最近已发生重置后的窗口。同刻仅观察查询之前记录；includeCurrent 显式允许当前记录进入（仍须满足区间），用于检测真正自引用。

## 效果

旧 effect 字段保留。新增 recipient（self/team/角色ID，默认self）、attribute（默认damageBonus）、unit（默认scalar）、group、policy add/replace/stack（默认add）、maxStacks（默认1）、captureAt dynamic/source。实例来自每名角色装备定义和显式 action；区间相对触发动作，左闭右开，同刻动作须先于读取。replace 同组最后实例覆盖；stack 保留最后 maxStacks 实例，各自独立到期，刷新规则为新实例替换最旧层，add 全部相加。组按接收者+属性划分，不同组相加。条件未知不静默取零。

稳定身份为 JSON.stringify([owner, equipmentSlot, definitionId, definitionVersion, effectId, actionId或null])。effectRevisions 保存 instanceId、disabled、可选 value（有限数量）；来源替换/删除/版本变化后报告 stale-revision 待核对，不重新附着。definitionVersions 与装备身份均参与匹配。

## 顺序、依赖、预算

记录按(timeMs,order,id)排序。before 不含当前动作效果；after 包含。属性/捕获/伤害/历史共用递归依赖和 active-key 环检测；跨角色循环、缺失来源、未知条件分别诊断。每次求值独立状态，最多100000访问、128深度、最多10000记录；预算终止报告 budget，绝不输出近似完整值。目标筛选只在结果统计时应用。

轨迹记录 actor、key、unit、timeMs、phase、recordId、instanceId（如有）、value 和依赖标识。候选效果列表含实际来源、区间、禁用/覆盖情况。真实伤害继续使用 evaluateRealDamage 的原公式，仅注入公共属性读取的 attack 和 damageBonus，保留其他乘区与诊断。

## 可解析样本与独立期望

fixtures/workbench/p3-*.json 为生产契约样本。辅助基础1000+短时500在1秒捕获20%=300；输出3秒捕获2000+300=2300，7秒动态增伤0.5，乘2=6900。辅助基础1200得7020；转换动态读取则7秒辅助1000，输出捕获2200得6600。历史1秒100、4秒200、6秒900；6秒结算[1000,6000)×0.5=150，前两项120/240则180。真实三角色原独立期望继续保留，并验证跨角色攻击增益按原倍率重求值。

## r2 集成修订

真实角色/武器快照的定义 ID 在换装后可能保持不变，故真实实例身份在上述六段后追加 [realBuild[slot].id, dataVersion]，人工修订 ID 上限2000字符。合成实例身份不变。历史/捕获也生成读取轨迹，依赖分别指向伤害记录和捕获节点；历史筛选引用未知角色/定义须诊断缺失，不能静默求零。新增基准工具按现有 Vite 归属规则登记到架构检查，不放宽计算模块依赖。

## r3 覆盖与刷新边界

同组规则及stack上限必须一致，冲突输入诊断invalid-input。replace/stack按历史触发顺序推进槽位，过期清空，新层超限永久驱逐最旧实例；新层提前过期不使被驱逐旧层复活。排除效果自身只屏蔽数值依赖，不恢复已驱逐层。add已过期实例无需再读取条件；replace/stack的未知历史触发保守partial，以避免猜测其是否已驱逐其他层。
