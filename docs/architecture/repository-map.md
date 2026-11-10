# 仓库地图与维护分工

| 目录 | 职责及边界 |
| --- | --- |
| `src/schema/src/common` | ID、有限数值、单位与通用声明 |
| `src/schema/src/content` | 属性、技能参数、角色、武器、套装；按内聚概念拆分，类型从Zod推导 |
| `src/schema/src/account` | 配装、实物、角色培养与展柜、账号文件及穿戴完整性 |
| `src/schema/src/project` | 表达式、效果、队员引用、敌人、条件、轴与目标 |
| `src/schema/src/exchange` | 当前定义库/文件契约与统一JSON序列化 |
| `src/schema/src/protocol` | 求值结果、属性读取/效果实例及Worker任务标识 |
| `src/game-data/data` | `characters`、`weapons`、`artifact-sets`每实体一份正式JSON；`tables`公共表，`manifest.json`内容版本与ID顺序 |
| `src/game-data/src` / `generated` | 公共查询加载器 / 只读运行分块；业务只经包公开入口获取内容 |
| `src/engine/src/attributes` | 同一配装快照的基础属性、装备、静态修饰和直接伤害 |
| `src/engine/src/effects` | 属性依赖、效果选择、捕获、历史累计与计数；每次求值独立状态 |
| `src/engine/src/timeline` | 当前唯一时间轴求值入口，校验版本与计算配置 |
| `src/web/src/pages` | 工作区与各业务页面 |
| `src/web/src/components` | 共享控件、图标与角色说明；不拥有业务文件格式 |
| `src/web/src/domain` | 无Vue/Pinia依赖的操作、适配、草稿计划与内容格式化 |
| `src/web/src/stores` / `composables` | 持久状态及命令 / 页面生命周期与导航协作 |
| `src/web/src/platform` / `workers` | 浏览器/桌面边界 / 后台求值进程 |
| `src/web/desktop` / `server` | Electron主进程与preload / 网页和桌面共用的本地Enka服务 |
| `src/web/generated` | 外部映射及目录投影；角色技能卡片投影从正式角色JSON生成 |
| `assets/game` / `ui` / `sources` | 游戏图标 / 应用装饰 / 资源维护依据；统一`manifest.json` |
| `tests/unit` / `integration` | 按包镜像的纯单元 / 跨模块、文件和真实录存回归 |
| `tests/browser` / `desktop` / `performance` | 网页开发与生产 / 桌面 / 性能测量 |
| `tests/helpers` | 仅测试辅助；不保存固定输入，真实资料直接读取获授权的.references原件，缺失时明确跳过 |
| `tools/scripts` | data、assets、checks、build、release、dev、licenses分类入口 |
| `tools/lib` / `data` / `patches` | 已复用的工具函数 / 来源原件和审计 / 依赖补丁 |
| `docs` / `archive/docs` | 现行文档 / 历史方案与退休机制记录 |
| `archive/retired-simulator` | 退休内核源码、旧数据及关联资料；历史场景、专用测试和已废弃工具已删除，不属于工作空间或默认检查 |
| `licenses` | 许可原件及分发清单；构建副本不能手工编辑 |

依赖方向为web → engine/schema/game-data，engine → schema，game-data → schema，schema无业务包依赖。共享包不读取浏览器、文件系统、UI或archive。跨包使用`@leyline/*`公开入口；包内才使用相对导入。

内容维护负责JSON与参数/规则绑定；引擎维护负责公式、能力约束与独立预期；界面维护负责交互和文件确认；工具维护负责确定性生成、版本和分发。改变契约需同时迁移消费者及适用文件边界。目录归位不代表扩充了角色机制支持。
