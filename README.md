# LeyLine Simulator

轴与配装工作台，使用 Vue 3 + TypeScript 构建，桌面与网页共用界面及计算内核。默认进入已整合的侧栏工作台，可编辑候选配装、动作与伤害点、条件及目标，查看公式来源，并保存、重新打开轴项目。原自动队伍模拟器保留在 `/#workbench`。

产品方向见[产品方向记录](docs/planning/product-direction.md)，阶段状态见[实施路线](docs/planning/implementation-roadmap.md)，实施交接统一使用[交接指令](docs/planning/implementation-agent-prompt.md)。视频打轴、快照、累计和优化搜索仍为后续能力。工作台和公式工具已使用中文展示，P2 新增流程继续中文优先；文件字段与版本保持原值。

## 桌面打开与验收

Windows 本地构建的稳定双击入口为 `artifacts/desktop/Start-LeyLine.cmd`，不需要输入命令、启动 Vite 或浏览器。它指向最新构建的 `releases/build-*/LeyLine-win32-x64/LeyLine.exe`；也可直接打开该 exe，移动程序时保留整个所在目录。实际路径记录于 `artifacts/desktop/latest.json`。

原神配色、凯尔特结纹和分组侧栏现为默认界面。项目页提供四个独立验收模板，参考目标为 4400、4000、4840、2000；队伍、时间轴、分析、定义快照及公式工具共用同一项目。详细步骤见[正式整合记录](docs/planning/desktop-integration.md)。

账号资料、角色及圣遗物库存尚未接入，页面明确显示未支持；不能在这些页面保存真实账号。其 7 张示意图透明 WebP 合计约 22.8 KiB，来源与压缩记录见[素材说明](docs/references/ui-assets.md)；`pnpm assets:check` 校验图片哈希和体积预算。

开发者重新生成桌面程序：`pnpm exec install-electron` 安装匹配的运行时，`pnpm desktop:build` 打包，`pnpm test:desktop` 实际窗口验收，`pnpm desktop:start` 打开最新程序。每次打包保留独立目录，成功后更新启动入口，不覆盖运行中的旧版本。程序为本地未签名便携版本，生成产物不纳入 Git。

## 快速开始

开发环境使用 Node.js 22.12+ 和 pnpm 11.3.0；CI 使用 Node.js 24。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开终端显示的本地地址，默认进入与桌面共用的伤害轴工作台。`/#axis` 为主入口，旧 `/#design` 兼容至同一界面；`/#annotation` 为共享当前项目的公式验收工具。原队伍工作区位于 `/#workbench`；其方案和草稿仍保存在当前浏览器中。开发验证页面位于 `/#tools`、`/#team` 和 `/#combat`。

agent 可继续调用 `node tools/scripts/evaluate-workbench.mjs <轴项目.json>`，读取 UI 保存的相同 v1 项目，无需桌面窗口。

## 原自动模拟器支持范围

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
  desktop/       Electron 主进程与受限文件桥
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
| `electron` | `^45.2.3` | `45.2.3` | 桌面运行时 |
| `@electron/packager` | `^20.3.0` | `20.3.0` | 桌面便携程序打包 |
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
