# 地脉工作台 LeyLine

本地原神配装资料与时间轴工作台。账户库存、轴项目、内容定义库独立保存；当前支持范围见[能力说明](docs/architecture/content-support.md)。

## 开发

Node.js 22.12+、pnpm 11.3.0；CI使用Node.js 24。在仓库根执行：

```sh
pnpm install --frozen-lockfile
pnpm data:build
pnpm dev
```

`pnpm build`构建网页；`pnpm desktop:build`生成独立桌面包。日常选择相关测试，最终验收见[部署与验证](docs/guides/deployment.md)。

## 目录与职责

| 目录 | 维护内容 |
| --- | --- |
| `src/schema` | Zod契约及其推导类型，含角色、配装、账号、项目、文件适配与Worker协议 |
| `src/game-data` | 正式JSON内容及加载器；`data`可编辑，`generated`由命令生成 |
| `src/engine` | 配装属性、单次伤害、效果依赖图、时间轴求值；只依赖schema |
| `src/web` | 页面、组件、纯业务操作、状态、Worker、桌面与本地网络服务 |
| `assets` | 唯一可维护图像、矢量、装饰及资源索引 |
| `tests` | 单元、集成、浏览器、桌面、性能测试，及helpers和固定输入 |
| `tools` | 分类维护脚本、共享工具、采集原件与依赖补丁 |
| `docs` | 现行规范、架构、指南、机制、研究与当前计划；仅Markdown |
| `licenses` | 许可原件、依赖清单与声明 |
| `archive` | 退休内核、旧表、工具与历史文档；任何默认命令都不读取 |
| `.references` | 忽略的本地参考仓库、私有原件；普通构建不依赖 |
| `.cache` / `artifacts` | 忽略的可重建缓存 / 验证记录与本地交付包 |

详细边界见[仓库地图](docs/architecture/repository-map.md)，维护入口见[文档导航](docs/README.md)。U1已由用户确认结束；当前结构重构按[批准方案](docs/planning/repository-refactor.md)实施，状态记录在[实施记录](docs/planning/repository-refactor-implementation.md)。
