# 现行规范清单

用户确认优先于历史设计稿。U1已结束；本次结构整理保持认可的交互和主题。

| 约定 | 唯一说明位置 | 代码执行位置 | 检查与状态 |
| --- | --- | --- | --- |
| 四包与三数据领域 | [仓库地图](../architecture/repository-map.md) | 各包公开入口；web domain/store/platform | `architecture:check`；已实施 |
| JSON、共同角色模型、单位与精度 | [内容规范](content.md) | schema/content、game-data/data；engine/attributes | `data:check`、`test:content`；精度限度见审计 |
| 主题、字号与控件 | [界面规范](../design/visual-language.md) | palette.ts与共享控件 | 相关页面检查；保留已认可范式，色板v1仍待体验反馈 |
| 导入、快照、穿戴与脱库 | [文件与状态](files-and-state.md) | schema/exchange及web domain/stores | 版本拒绝、当前格式往返与实际库存回归；已实施 |
| 培养资料与战斗条件 | [边界复查](../architecture/import-and-calculation-boundaries.md) | Build、damage.conditions、目标草稿及面板状态 | 菲林斯实际响应与命中条件隔离检查 |
| 实际案例与独立期望 | [证据规范](evidence.md) | tests及录存manifest | 私有资料缺失明确跳过；历史构造场景及专用回归已删除 |
| 测试组织与检查选择 | [测试规范](testing.md) | tests、根命令、CI | `test` / 浏览器与桌面串行；已实施 |
| 采集、生成与工具维护 | [工具指南](../guides/tools.md) | tools分组与package.json | `--check`只读，采集显式；已实施 |

本清单只指向权威文档，不复制其中的长期规则表。后续变更在同一说明中记录原因与影响，状态不得用“测试通过”代替用户决定。
