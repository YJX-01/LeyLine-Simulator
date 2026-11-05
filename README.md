# LeyLine-Simulator

## TypeScript 重写预览

新版本采用 Vue 3 + TypeScript，独立计算模块通过 Web Worker 在浏览器运行。
当前已完成阶段6的性能、三内核兼容与本地交付准备：支持琴、行秋、胡桃、阿贝多、雷电将军，1—90级成长、突破、天赋/命座、8把武器及选定五星圣遗物效果。使用固定数据快照和明确的单目标规则范围，不宣称覆盖全部游戏机制。

运行后默认进入队伍工作区（`/` 或 `/#workbench`）：配置角色与装备、编排动作、运行 Worker 模拟，检查伤害/能量图表和逐事件结算，再固定两次结果进行对比。默认加载行秋/阿贝多/琴/胡桃两轮24秒循环。草稿自动保存在本机浏览器，方案支持保存、载入、复制、重命名、删除和 JSON 导入导出；重要方案请导出备份。

原开发验证工具保留于 `/#tools`、`/#team` 和 `/#combat`，与玩家配置流程分开。

**阶段3战斗机制已验收**：统一战斗入口支持1—4个测试面板、增益/快照、冷却、切人、命中产球与能量、周期/协同召唤物、标准附着ICD及正反蒸发/融化。启动后点击“综合战斗机制验证”（`/#combat`），可运行人工基准并比较快照与动态面板。

阶段6验收通过170个单元测试，以及Chromium、Firefox、WebKit的75个开发流程和18个生产用例。已建立性能基线、构建体积预算，验证根路径/子路径、Worker、缓存更新恢复和禁用存储，并可生成带源码指纹及文件哈希的本地候选。没有push、外部部署或正式发布。

需要 Node.js 22.12+（建议 24 LTS）和 pnpm 11.3.0。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

验证命令：`pnpm typecheck`、`pnpm test`、`pnpm build`。

数据及场景一致性：`pnpm data:check`、`pnpm fixture:check`。均使用Node，不需要Python运行时。

浏览器测试：先执行 `pnpm exec playwright install chromium firefox webkit`，再执行 `pnpm test:e2e`。单独验证一个内核可使用 `pnpm test:e2e --project=chromium`；仅Chromium项目可通过环境变量 `PLAYWRIGHT_CHANNEL=msedge`改用本机Edge。

性能与生产验收：`pnpm perf:engine`、`pnpm build:check`、`pnpm build:subpath`、`pnpm test:production`。完整矩阵通过后，`pnpm release:prepare`生成本地候选，`pnpm release:verify --dir=候选路径`校验文件。具体流程与缓存要求见部署指南。

- [实施计划](docs/rewrite-plan.md)
- [使用与故障恢复](docs/user-guide.md)
- [构建、验证和本地交付](docs/deployment.md)
- [迁移状态与下一步](docs/architecture/migration-status.md)
- [内容支持矩阵](docs/architecture/content-support.md)
- [琴战技数据依据与差异](docs/mechanics/jean-tap.md)
- [阶段3验收记录](docs/architecture/stage-3-acceptance.md)
- [统一战斗规则与人工算例](docs/mechanics/combat-v1.md)
- [阶段4验收记录](docs/architecture/stage-4-acceptance.md)
- [阶段5验收记录与界面结构](docs/architecture/stage-5-acceptance.md)
- [阶段6验收记录与性能结果](docs/architecture/stage-6-acceptance.md)
- [首批角色范围](docs/mechanics/first-characters.md)
- [装备效果范围](docs/mechanics/supported-equipment.md)
- [真实四人循环独立审计](docs/mechanics/first-team-cycle.md)

以下为旧 Python 项目说明，代码保留于 `src/`，作为迁移参考。

地脉模拟器 | LeyLine Simulator - a Genshin Impact combat system simulator - simple user input, rich data analysis and visualization

## 目的 Propose

The propose of this project is to calculate different kinds of data in GI combat system, and to visualize it. Also, we hope to find more hidden characteristic of the team-build.

项目旨在精准计算战斗系统中的各种数据，并进行可视化。我们希望从中发掘更多有趣的细节。

## 使用 Usage

You can use simple command to build combat environment and action list. For more details:

使用简单的字符输入就可以进行模拟，详见：

[Usage](https://github.com/moon-xu37/LeyLine-Simulator/blob/main/docs/dict/usage.md "Usage")

## 参考 Reference

[Reference](https://github.com/moon-xu37/LeyLine-Simulator/blob/main/docs/dict/reference.md "Reference")

## 鸣谢 Thanks

[Thanks](https://github.com/moon-xu37/LeyLine-Simulator/blob/main/docs/dict/thanks.md "Thanks")
