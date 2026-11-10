# GenshinTools 架构研究

核对日期：2026-11-10。按用户指定引入；当前参考目录统一为 `.references/GenshinTools/`，不参与普通构建。未安装或运行上游依赖、应用、刷新脚本；以下结论来自固定源码阅读，不构成上游数值正确性或本项目机制验收。

- 仓库：<https://github.com/Anyrainel/GenshinTools>
- 分支：`main`。
- 提交：`345edc8b1ade7b57cd47153844cb1abae8c3e415`。
- 提交时间：`2026-11-07T10:22:39-08:00`。
- 本次用途：数据维护、规则注册、属性及公式组织的架构参考，不替换既定莫娜搜索适配方向。

## 已核对的实现

下列完整路径相对上游根目录；表中简写的 `core/`、`impl/` 及 `implModel.ts` 均位于 `src/domain/combat/damage/`（`implModel.ts` 在其 `core/` 下）。可在本地 checkout 或[固定提交目录](https://github.com/Anyrainel/GenshinTools/tree/345edc8b1ade7b57cd47153844cb1abae8c3e415)复查。

| 关注点 | 源码位置 | 观察 |
| --- | --- | --- |
| 数据刷新 | `docs/game-data-refresh.md`、`scripts/refresh_game_data.py` | 外部 HoyoData 导出、目录与映射生成、覆盖与有限数值检查有独立流程；详细伤害实现仍需人工审查，刷新资料不会自动实现角色 |
| 产品数据 | `src/generated/catalog/` | 数值、技能展示文本、资源索引、Enka 映射分别生成；仍大量使用 JSON，并未通过数据库替代静态内容 |
| 数据访问 | `src/domain/reference/stats.ts`、`src/providers/reference/statLoaders.ts` | 类型化访问与具体异步加载配置分开；数值与资料展示分开 |
| 规则组织 | `src/domain/combat/damage/core/registry.ts`、`implModel.ts`、`impl/` | 角色/武器/套装分别注册；基类共用属性读取与天赋处理，具体实现提供效果与公式 |
| 真实角色 | `impl/character5Mondstadt.ts` 中 `Jean`、`impl/character4Mondstadt.ts` 中 `Kaeya` | 角色公式/效果在规则模块中编写；基础数值从独立资料读取，没有塞进通用数据抓取步骤 |
| 属性与效果 | `core/statSheet.ts`、`core/statBuff.ts`、`core/teamStatSheet.ts` | 统一属性访问；效果保存来源、接收者、元素/技能/反应等筛选条件；属性修正有一致性约束 |
| 伤害与表达式 | `core/damageFormula.ts`、`core/expr.ts`、`core/formulaCompiler.ts` | 公式有结构化表达式与编译路径，计算/展示共享公式入口；优化器将允许变化的属性映射为变量 |
| 内容就绪检查 | `tests/domain/combat/damage/entityReadiness.test.ts` | 检查目录、资料、注册实现和求值路径的连接，避免仅登记空实现；这类检查本身仍不能证明所有机制正确 |

## 可借鉴的工程做法

1. 将生产内容及其生成输入归入 `src/game-data/`，`docs/` 只负责说明与证据；使用显式类型和校验统一数据边界。
2. 分开游戏数值、展示资料、计算规则和玩家实例；规则按角色/装备组织，通用求值器不承担内容转换。
3. 共用属性与伤害表达式，并保留来源、适用条件及可解释结果；内容资料覆盖和计算能力分开声明。
4. 建立可复现的离线生成与就绪检查，避免目录增加后默认为机制可执行。

## 需要按本项目要求调整的地方

- 上游主要通过 TypeScript 类、装饰器和模块副作用注册规则。直接复制这套方式，不能使自定义角色的完整规则自然导出；本项目使用显式注册和可序列化定义，TypeScript 仅作为类型化编写工具。
- 上游存在默认连招/次数组合和计算选项；本项目继续由真实轴记录决定时间、命中与条件，不能把默认连招当作玩家实际操作。
- 上游编译器会折叠被认为固定的面板/效果。本项目有跨角色换装、时刻捕获、历史与未知条件，只有证明与候选变量及时间上下文无关时才能常量折叠；本轮不接入其编译器或优化器。
- 上游数值访问使用有限等级档位，武器访问含90级专用入口。本项目保留既有等级/突破精度与合法性，不能套用档位近似改变低等级输入。
- 未发行资料、默认条件与已有实现不直接成为本项目正式支持范围；逐项核对来源、版本及独立期望。
- 当前固定提交的根目录及受跟踪文件列表中未找到明确的 LICENSE/COPYING/NOTICE 文件。本次仅记录设计观察；若以后复用源码或数据，先确认其适用许可与来源。本次没有复制上游实现进产品。

## 与实施方案的关系

本仓库只是参考样本，其类/注册器、目录和编译器不是行业规范。本项目的取舍须接受[工程审查](../../archive/docs/planning/content-foundation-review.md)，对应[F0方案r3](../../archive/docs/planning/content-foundation.md)已撤回缺少实际需求的包平台、新轴格式和通用求值改造前置。随后已实施输入归位、每实体JSON与统一元数据schema、共享契约和现有规则抽离，见[F0记录](../../archive/docs/planning/f0-implementation.md)；未照搬参考项目的运行架构，也未扩充完整伤害机制。
