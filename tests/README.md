# 测试入口

unit按schema、game-data、engine、web镜像实现，integration提供跨模块、文件及原始资料检查；browser区分development/production，desktop和performance独立。helpers提供操作与核对能力，真实输入直接读取.references获授权原件。

| 命令 | 用途 |
| --- | --- |
| pnpm test | Vitest单元及TypeScript集成 |
| pnpm test:content | Node内容和文件检查 |
| pnpm test:ui | Chromium单worker真实库存流程 |
| pnpm test:ui:contracts | Chromium单worker实际样式、焦点与窄屏 |
| pnpm test:e2e | 开发浏览器矩阵 |
| pnpm test:production | 根路径与子路径生产检查 |
| pnpm test:desktop、test:ui:desktop | 独立profile桌面库存与原生文件 |
| pnpm test:content:desktop | 桌面元数据文件往返 |
| pnpm perf:engine | 真实录存Build求值与空轴聚合 |

原件为.references/artifacts_mona.json及已授权enka响应，具体登记见[验证资料](../tools/data/README.md#验证资料与独立计算记录)。原件缺失时对应检查明确跳过；历史构造场景、固定输入目录及专用辅助/归档副本已退出维护。

current-format使用实际录存的明确版本标签派生副本，检查版本拒绝、存储命名空间及当前恢复。保存、撤销、取消等行为使用当前空文档或原件派生副本。机制期望按来源独立推导，游戏观测单独记录。

浏览器与桌面串行单worker，只管理本次创建的服务与实例。通用规则见[测试规范](../docs/evidence-and-validation.md#测试与验证)，性能预算见[测量入口](performance/README.md)。
