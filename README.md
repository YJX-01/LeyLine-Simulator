# LeyLine Simulator

原神队伍战斗模拟器，使用 Vue 3 + TypeScript 构建。计算在浏览器 Web Worker 中运行，可配置角色与装备、编排动作、查看伤害与能量事件、对比运行结果，并通过 JSON 导入导出方案。当前应用无需 Python 或后端服务。

远期方向已调整为视频打轴与配装优化工作台，详见[产品方向记录](docs/planning/product-direction.md)与[文档导航](docs/README.md)。下文介绍当前实现；后续架构将依据新方向重新设计。

## 快速开始

开发环境使用 Node.js 22.12+ 和 pnpm 11.3.0；CI 使用 Node.js 24。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开终端显示的本地地址。默认进入队伍工作区，加载行秋、阿贝多、琴、胡桃的两轮循环。方案和草稿保存在当前浏览器中，重要方案请导出备份。开发验证页面位于 `/#tools`、`/#team` 和 `/#combat`。

## 当前支持范围

支持琴、行秋、胡桃、阿贝多、雷电将军的选定技能与命座，1—90 级成长、突破、天赋、8 把武器及选定五星圣遗物效果。使用固定仓库数据快照，按明确的单目标规则计算；尚未覆盖全部角色、多目标传播、敌人攻击与位移、动作取消、草反应等机制。

详细范围和条件见[内容支持矩阵](docs/architecture/content-support.md)及[装备说明](docs/mechanics/supported-equipment.md)。

## 目录与架构

```text
src/
  web/           Vue 页面、状态、图表与 Worker 入口
  engine/        战斗计算、事件调度及机制实现
  schema/        输入校验、版本化合同与 Worker 消息类型
  game-data/     游戏内容定义和生成的数据快照
tools/           开发工具（下列目录均位于 tools/）
  scripts/       数据转换、架构检查、构建验证、清理与交付
  patches/       需要随依赖安装应用的补丁
tests/           开发及生产浏览器测试
fixtures/        可重复的场景与性能输入
docs/            使用说明、架构、规则依据与源数据
archive/python/  旧 Python 实现及历史资料
.github/         GitHub Actions 自动检查
```

四个 workspace 由 `pnpm-workspace.yaml` 的 `src/*` 管理。依赖方向为 `web → engine/schema/game-data`、`engine → schema/game-data`；跨模块使用 `@leyline/*` 公共入口。`schema` 与 `game-data` 不依赖其他 workspace。

`docs/constant/` 仍是数据生成输入，`docs/characters/` 保留数据依据；它们不属于废弃文件。生成数据位于 `src/game-data/src/generated/`，修改源数据后执行 `node tools/scripts/convert-repo-data.mjs`，不要单独手改生成结果。详见[架构与扩展指南](docs/architecture/overview.md)。

## 当前依赖

以下列出所有直接外部依赖；“锁定版本”来自当前 `pnpm-lock.yaml`，安装时以锁文件为准。间接依赖由 pnpm 自动解析，无需逐个安装。

### 运行依赖

| 包 | 声明范围 | 锁定版本 | 用途 / 所属 workspace |
| --- | --- | --- | --- |
| `vue` | `^3.5.0` | `3.5.44` | 页面组件与响应式状态 / web |
| `pinia` | `^4.1.0` | `4.1.0` | 工作区、方案及结果状态 / web |
| `echarts` | `^6.1.0` | `6.1.0` | 伤害、能量等结果图表 / web |
| `zod` | `^4.1.0` | `4.6.7` | 配置与消息合同校验 / schema |

### 开发与验证依赖

| 包 | 声明范围 | 锁定版本 | 用途 |
| --- | --- | --- | --- |
| `typescript` | `^5.9.3` | `5.9.3` | TypeScript 类型检查及源码解析 |
| `vite` | `^7.2.0` | `7.3.7` | 本地开发与生产构建 |
| `@vitejs/plugin-vue` | `^6.0.0` | `6.0.10` | Vite 的 Vue 单文件组件支持 |
| `vue-tsc` | `^3.1.0` | `3.3.14` | Vue 模板与脚本类型检查 |
| `vitest` | `^3.2.4` | `3.2.7` | 单元测试 |
| `@playwright/test` | `^1.64.1` | `1.64.1` | Chromium、Firefox、WebKit 回归测试 |
| `@types/node` | `^24.19.2` | `24.19.2` | 开发脚本与配置的 Node.js 类型 |

`vite` 和 `@vitejs/plugin-vue` 声明在 web，其余开发工具声明在根目录。仓库内部包为 `@leyline/web`、`@leyline/engine`、`@leyline/schema`、`@leyline/game-data`，通过 `workspace:*` 连接，不从 npm 下载。

当前另有一个针对间接依赖 `@vue/devtools-kit@8.2.1` 的补丁，防止浏览器拒绝 `localStorage` 时启动白屏。冻结安装会自动应用；确认上游修复并通过回归后可移除。见[补丁说明](tools/patches/README.md)。

## 常用命令

在仓库根目录执行：

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动开发服务 |
| `pnpm architecture:check` | 检查目录、包边界、循环依赖及归档隔离 |
| `pnpm data:check` / `pnpm fixture:check` | 检查生成数据和场景一致性 |
| `pnpm typecheck` / `pnpm test` | 类型检查 / 单元测试 |
| `pnpm build` / `pnpm build:check` | 生产构建 / 体积预算检查 |
| `pnpm preview` | 本地查看已构建的 `src/web/dist/` |
| `pnpm perf:engine` | 引擎性能预算检查 |
| `pnpm test:e2e` | 三内核开发流程测试 |
| `pnpm build:subpath` / `pnpm test:production` | 子路径构建 / 根路径及子路径生产测试 |

首次运行浏览器测试前执行 `pnpm exec playwright install chromium firefox webkit`；Linux 系统依赖安装方式见[交付指南](docs/deployment.md)。可用 `pnpm test:e2e --project=chromium` 单独验证 Chromium。

完整浏览器矩阵通过后，`pnpm release:prepare` 生成本地候选，`pnpm release:verify --dir=<候选路径>` 校验文件。打包会拒绝缺失或陈旧的浏览器证据，不自动对外部署或推送。

## 生成目录与清理

`node_modules/` 及 workspace 内同名目录由 pnpm 管理；`.cache/` 是本地下载缓存和临时补丁工作区。`artifacts/`、`test-results/`、`src/web/dist/` 和 `src/web/dist-subpath/` 是生成产物，均不提交。

- `pnpm clean:outputs --dry-run`：预览产物清理清单。
- `pnpm clean:outputs`：清理构建、报告、测试输出及本地交付候选；需要保留的候选请先移出 `artifacts/`。
- `pnpm clean:cache`：清理缓存，不删除已安装依赖；先保存尚未完成的临时补丁修改。

清理后，构建和验证命令会重新生成所需目录。预览和生产测试需要先构建；发布候选需要重新运行完整浏览器验证。

## 维护入口

- [贡献与代理工作规范](AGENTS.md)
- [架构与扩展指南](docs/architecture/overview.md)
- [使用与故障恢复](docs/user-guide.md)
- [构建、验证和本地交付](docs/deployment.md)
- [开发工具与依赖维护](tools/README.md)
- [Python 历史归档](archive/python/README.md)
