# P2 最小契约与文件所有权（2026-11-06）

基线 HEAD：0679d59bf19dfbccc10b089d25a763d2b3c96074。契约修订 P2-local-v1。

- 轴继续使用 schemaVersion 1 / workbench-v1，不改变 CLI 文件协议；定义及角色的可选 name 仅作为显示元数据，由主集成者统一扩展 schema。
- 账号与定义库使用独立 schemaVersion 1 文件，分别标记 kind: account / definition-library；不嵌入轴，显式复制时才写入候选或定义快照。每个装备有稳定实例 ID、部位、归属；转移须明确确认。
- 定义库条目为现有轴 definition 结构的深副本；版本更新不传播旧轴。受控节点仍由 engine 求值。
- Worker 请求/回包绑定任务 ID、项目身份和内容修订；取消使旧任务失效。编辑历史与恢复只记录项目输入，不持久化计算结果。
- 主 agent：共享 schema/exports、WorkspaceShell.vue 集成、根配置、桌面桥、文档与最终验证。
- 账号 agent：domain/account*、stores/account*、AccountLibrary.vue 及其测试；不修改共享文件。
- 定义 agent：domain/definition-library*、stores/definition-library*、DefinitionLibrary.vue、AxisCreation.vue 及其测试；不修改共享文件。组件自行使用 axis store.project，提供队伍创建及定义快照复用。
- 编辑执行 agent：stores/axis-workspace.ts 及测试、domain/axis-*、axis.worker.ts；公开 undo/redo/canUndo/canRedo/recover/recoveryAvailable/cancelRun/runState，保留现有 store API。不修改共享文件。

验收依赖：先完成共享 name 元数据兼容，再集成组件；保留独立数值 4400/4000/4840/2000/10560。P3 样本仍不支持。


集成修订 P2-local-v1.1：角色可选 accountSnapshot 保存 accountId、characterId、武器备注及最多五件 {id,name,slot,attack} 实物副本。文件校验拒绝同账号实物在队伍重复占用、同角色同部位多件；旧 v1 文件省略该字段仍可打开。消费者为账号复制、轴文件、Worker/CLI；计算继续读取规范化 inputs，不重复叠加来源快照。
