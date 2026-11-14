# 地脉工作台 LeyLine

本地原神配装资料、伤害核验与时间轴工作台。账号库存、轴项目和内容定义库独立保存，独立计算器复用共同求值器。

## 开发

Node.js 22.12+、pnpm 11.3.0，CI使用Node.js 24。在仓库根执行：

```sh
pnpm install --frozen-lockfile
pnpm data:build
pnpm dev
```

pnpm build构建网页，pnpm desktop:build构建桌面。操作与交付见[应用指南](src/web/README.md#地脉工作台使用说明)及[交付步骤](tools/README.md#构建托管与本地交付操作)。

## 目录

| 目录 | 维护入口 |
| --- | --- |
| src/schema | [共享契约与校验](src/schema/README.md) |
| src/game-data | [正式JSON、运行投影与加载](src/game-data/README.md) |
| src/engine | [属性、伤害、效果与时间轴](src/engine/README.md) |
| src/web | [页面、状态、领域及平台适配](src/web/README.md) |
| assets | [图片、矢量、装饰与来源](assets/README.md) |
| tests | [单元、集成、浏览器、桌面与性能](tests/README.md) |
| tools | [维护脚本、来源、审计及补丁](tools/README.md) |
| docs | [设计思路、规范与流程](docs/README.md) |
| licenses | 许可原件、清单与声明 |
| archive | 已退出的实现与历史资料，隔离于默认命令 |
| .references | 忽略的参考检出与获授权原件 |
| .cache、artifacts | 可重建缓存、运行记录与本地交付包 |

[产品方向](docs/product-direction.md)维护目标，[支持判定](docs/calculation.md#计算支持判定)维护方法，[具体计算支持](tools/data/README.md#计算支持与内容绑定)维护实体与路径。
