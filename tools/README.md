# 工具索引

| 目录 | 职责 |
| --- | --- |
| scripts/data | 内容生成、显式采集、候选更新和数值审计 |
| scripts/assets | 资源采集、统一构建副本与索引 |
| scripts/checks | 架构、文档、来源、固定输入、资源及体积约束 |
| scripts/build | 构建插件与桌面打包 |
| scripts/release | 本地候选与分发完整性 |
| scripts/dev | 开发启动、本地预览、受限清理 |
| scripts/licenses | 许可采集与生成副本 |
| lib | 多处复用的JSON、TS加载、指纹和产物定位 |
| data | 采用的原始字节、映射参考与审计 |
| patches | 已登记的依赖补丁 |

应用运行代码在src/web/desktop和server，功能测试在tests；已废弃脚本直接删除，不保留归档副本。根pnpm命令是正式入口，输入/输出/联网/写入范围见[工具指南](../docs/guides/tools.md)。逐脚本与文档去留见[迁移清单](../docs/planning/repository-migration-map.md)。
