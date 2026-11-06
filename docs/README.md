# 文档导航

项目方向是**对照视频分层打轴，根据动作生成 Buff，结合伤害点构建公式，用于组队与配装优化**。P0/P1 普通伤害内核及桌面可操作验收已实现；桌面与网页共用界面，原自动战斗模拟器保留独立入口，复杂机制仍按阶段推进。

## 规划讨论

| 文档 | 用途 |
| --- | --- |
| [产品方向](planning/product-direction.md) | 用户已明确的需求、目标流程，以及尚待确定的边界 |
| [模块设计原则](planning/module-design.md) | 已认可的模块边界、扩展方式与计算契约原则 |
| [总体设计草案](planning/overall-design.md) | 模块数据流、核心契约、求值流程、三个独立算例和范围划分 |
| [核心代码方案](planning/core-implementation.md) | 模块目录、契约、表达式/效果/快照/概率/优化的实现方式 |
| [分层实施路线](planning/implementation-roadmap.md) | 依赖顺序、可运行交付、阶段验收和产品目标对齐矩阵 |
| [实施 Agent Prompt](planning/implementation-agent-prompt.md) | 桌面 UI 优先的交接范围、并行分工与验收边界 |
| [桌面实施调整](planning/desktop-implementation.md) | 桌面与网页共用的方案、D0 → P2 → P3 顺序 |
| [侧栏与功能分区讨论](planning/ui-navigation-discussion.md) | 参考莫娜的导航证据、D1 分区提案及待决事项 |
| [桌面打开与验收](planning/desktop-delivery.md) | 双击入口、界面检查步骤、实际验证及剩余限制 |
| [P0/P1 内核记录](planning/p0-p1-implementation.md) | v1 语义、普通算例、来源与诊断、无界面验证 |
| [讨论提纲](planning/discussion-agenda.md) | 按依赖顺序讨论工作流、标注模型、Buff、公式和优化 |

先明确用户如何记录和使用数据，再确定架构与实现。设计建议不能视为已确认需求，历史实现也不构成新产品必须保留的约束。

## 当前实现

以下文档用于理解、运行和核对现有代码，不是新产品的设计方案。

| 文档 | 用途 |
| --- | --- |
| [使用指南](user-guide.md) | 现有配队、动作编辑、运行与结果对比 |
| [架构与模块边界](architecture/overview.md) | 当前 workspace、依赖方向和模块职责 |
| [内容支持矩阵](architecture/content-support.md) | 当前角色、装备与机制的支持范围 |
| [事件时间约定](architecture/event-time.md) | 当前各验证入口的调度和时间边界 |
| [构建与交付](deployment.md) | 当前构建、浏览器验证和本地交付流程 |
| [性能基线](performance/README.md) | 已保存的测量方法、预算与报告；不是本次重新测量 |

## 机制参考

这些文档记录当前规则版本和计算假设。后续可以据此评估公式、属性解析和 Buff 等能力的复用价值，不能直接据此决定新产品也要自动推演所有战斗事件。

| 文档 | 内容 |
| --- | --- |
| [直接伤害](mechanics/direct-hit.md) | 单次伤害计算及乘区 |
| [通用战斗规则](mechanics/combat-v1.md) | 现有 Buff、快照、能量及战斗结算合同 |
| [内容与反应](mechanics/content-reactions.md) | 现有附着和反应模型 |
| [五角色规则](mechanics/first-characters.md) | 当前角色动作、天赋、命座及限制 |
| [装备规则](mechanics/supported-equipment.md) | 当前武器与套装效果 |
| [四人循环参考](mechanics/first-team-cycle.md) | 固定示例的独立计算依据 |
| [琴点按验证](mechanics/jean-tap.md) | 保留验证入口的数据冲突与适用范围 |
| [内容数据审计](mechanics/content-audit.md) | 数据来源、单位、转换与已知冲突 |

## 数据资料

本地外部参考见[来源与阅读指南](references/README.md)及[固定版本清单](references/sources.json)。源码和网页保存在被 Git 忽略的 `.references/`，不作为构建依赖。

- `constant/`：数据转换脚本的规范输入，修改后需要重新生成并检查快照与哈希。
- `characters/`：角色资料和来源参考；文件存在不代表机制已经验证或实现。
- `unifiedname.txt`：既有命名对照资料。
- `performance/*.json`：当前模拟实现的历史测量证据，与性能说明配套读取。

数据资料保持原路径，避免影响生成脚本与已有引用。

## 维护约定

- 新的产品需求与讨论结论放入 `planning/`，明确区分已确认、建议与待讨论事项。
- 当前实现说明放入 `architecture/`，规则与计算依据放入 `mechanics/`。
- 旧重写计划、迁移流水账、阶段验收及旧专项审查已经删除，不再作为后续任务清单。
- 测试数量和性能数字必须注明对应记录；历史通过不代表新版本已验证。
