# 文档导航与交接

历史P3实现基线：`1d9e72f`。当前U1增量见[实施记录](planning/u1-implementation.md)。P0/P1、D0、D1、P2、P2.5、P3 已完成，U1界面与交互重构已开始实施，尚未通过阶段验收；之后按P5 → P6 → P4 → P7 → P8推进，均未完成。P3历史功能验收不表示当前交互体验已获认可。新轴工作台和保留的自动模拟器各有实现，不能互相折算支持能力。

## 从哪里开始

| 用途 | 入口 | 内容边界 |
| --- | --- | --- |
| 当前阶段与下一步 | [实施路线](planning/implementation-roadmap.md) | 阶段状态的统一入口 |
| 交给下一位 agent | [U1 实施 prompt](planning/implementation-agent-prompt.md) | 可直接执行的任务、阅读顺序、代码入口、验收与提交要求 |
| U1当前增量 | [交互契约](planning/u1-interaction-contract.md)、[实施记录](planning/u1-implementation.md) | 账号优先、新库存与队伍/轴工作区、真实材料和待验收项目 |
| 用户操作与桌面入口 | [桌面整合记录](planning/desktop-integration.md) | 当前共用界面、保存边界；末尾按阶段保留历史证据 |
| 当前机制验收 | [P3验收记录](planning/p3-implementation.md) | 通用效果、属性捕获、历史依赖、来源修订和完整验收证据 |
| 真实数据验收 | [P2.5 验收记录](planning/p2-5-implementation.md) | 从空轴建角色、配装、导入、保存重开及独立数值 |
| 后续案例与验收 | [真实案例规范](planning/real-case-validation.md) | 禁止新增模拟例子；真实资料、独立期望与当前缺口 |
| 支持范围 | [内容支持矩阵](architecture/content-support.md) | 新轴与旧模拟器分开列出，目录数据不等于全部机制可算 |
| 数据来源与精度 | [P2.5 数据记录](references/p2-5-data.md) | 固定 SHA、canonical、生成快照、单位、精度差异与许可 |
| 构建与运行验证 | [部署及本地验证](deployment.md)、[性能说明](performance/README.md) | 本地包、根/子路径、预算和证据要求；不自动发布 |

## 设计与实际实现

[产品方向](planning/product-direction.md)记录用户目标，[模块设计](planning/module-design.md)记录已认可的边界；[总体设计](planning/overall-design.md)和[核心方案](planning/core-implementation.md)包含尚未实现的接口提案。实现能力以阶段验收、支持矩阵及代码为准，不把设计类型名当作现有 API。

当前公开求值入口为 `@leyline/engine.evaluateWorkbench`；UI 保存的轴可由 `node tools/scripts/evaluate-workbench.mjs <项目.json>` 复算。文件格式仍为 `schemaVersion: 1`；规则明确分派 `workbench-v1` / `workbench-p3`，旧轴不自动升级。P2.5的数据/定义版本副本与P3的战斗时刻属性捕获分别保存和求值。

## 历史记录与契约

- [P0/P1 实施记录](planning/p0-p1-implementation.md)：普通伤害 v1 的初始语义和当时验收，不作为当前全部支持清单。
- [独立算例](planning/p0-samples.md)：普通伤害、快照6900/7020/6600、累计150/180均已接入生产契约；原手算依据保留。
- [P2 契约](planning/p2-local-contract.md)、[P2.5 契约](planning/p2-5-contract.md)：对应阶段冻结的最小契约、文件所有权与集成修订，P3当前契约见[p3-contract](planning/p3-contract.md)。
- [莫娜调查](planning/p0-mona-investigation.md)、[视频调查](planning/p0-video-investigation.md)：固定来源的研究证据；调查不等于算法或视频功能接入。
- [参考资料](references/README.md)：`.references/` 的来源索引。普通构建/运行不依赖该目录；只有显式数据维护使用固定 checkout。

`architecture/event-time.md` 与 `mechanics/` 中的战斗调度说明主要描述旧模拟器。新轴采用 `(timeMs, order, id)`；P3捕获阶段、历史与同刻语义已单独冻结在[P3契约](planning/p3-contract.md)，不能套用旧调度优先级。

修改规则时同步维护阶段验收、支持矩阵及来源说明；历史结果保留阶段标签，避免出现多个互相冲突的“当前状态”。未完成阶段仍保持明确边界，不将设计提案当作已实现能力。

## 保留的模拟器与机制参考

[旧模拟器使用指南](user-guide.md)说明 `/#workbench` 的配队、动作循环和结果对比；[架构说明](architecture/overview.md)区分两条执行入口。以下机制文档用于核对既有规则和独立算式，不代表新轴已支持其全部行为：

| 参考 | 内容 |
| --- | --- |
| [直接伤害](mechanics/direct-hit.md)、[通用战斗规则](mechanics/combat-v1.md) | 原模拟器乘区、Buff、捕获、能量及结算 |
| [内容与反应](mechanics/content-reactions.md)、[五角色规则](mechanics/first-characters.md) | 原模拟器附着、反应、动作、天赋与命座限制 |
| [装备规则](mechanics/supported-equipment.md)、[四人循环](mechanics/first-team-cycle.md) | 原模拟器武器/套装和固定循环独立依据 |
| [琴点按验证](mechanics/jean-tap.md)、[内容数据审计](mechanics/content-audit.md) | 旧验证入口、数值来源、单位及已知冲突 |
| [当前莫娜社区版](references/mona-community.md) | 7.2.02 来源、目录覆盖、套装身份与旧库存修复 |
| [UI 素材](references/ui-assets.md) | 当前主题图片来源、许可说明、压缩与预算 |

数据资料保持原路径：`constant/` 为 canonical，`characters/` 和 `unifiedname.txt` 为既有参考，`performance/*.json` 为对应阶段历史测量。角色资料存在不等于规则已验证；生成快照应与 canonical、版本及哈希一起审查。[固定来源清单](references/sources.json)保留外部 checkout 依据。

## 当前界面规范与新增输入

- [视觉设计语言](design/visual-language.md)：七元素 21 色、语义分配、操作与状态规范；设置中可预览，v1 待体验反馈。
- [Enka 导入说明](references/enka-import.md)：UID 公开展柜、来源固定版本、快照与实物边界、部署条件及真实验证。
