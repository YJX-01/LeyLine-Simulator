# LeyLine-Simulator

## TypeScript 重写预览

新版本采用 Vue 3 + TypeScript，独立计算模块通过 Web Worker 在浏览器运行。
当前已完成阶段4的首批真实内容接入：琴、行秋、胡桃、阿贝多、雷电将军，1—90级成长、突破、天赋/命座、8把武器及选定五星圣遗物效果。使用固定数据快照和明确的单目标规则范围，不宣称覆盖全部游戏机制。

运行后进入“真实角色队伍验证”（`/#team`）：默认运行行秋/阿贝多/琴/胡桃两轮24秒循环，也可加载琴和雷电示例。当前JSON编辑器是内容验收入口；玩家配队表单、图表与保存属于下一阶段。

**阶段3战斗机制已验收**：统一战斗入口支持1—4个测试面板、增益/快照、冷却、切人、命中产球与能量、周期/协同召唤物、标准附着ICD及正反蒸发/融化。启动后点击“综合战斗机制验证”（`/#combat`），可运行人工基准并比较快照与动态面板。

阶段4验收包括149个单元测试、14个本机Edge浏览器用例，以及真实循环逐事件独立伤害核算和能量/生命审计。仍未完成产品界面、方案保存和发布验收。

需要 Node.js 22.12+（建议 24 LTS）和 pnpm 11.3.0。

```sh
pnpm install
pnpm dev
```

验证命令：`pnpm typecheck`、`pnpm test`、`pnpm build`。

数据及场景一致性：`pnpm data:check`、`pnpm fixture:check`。均使用Node，不需要Python运行时。

浏览器测试：先执行 `pnpm exec playwright install chromium`，再执行 `pnpm test:e2e`。

- [实施计划](docs/rewrite-plan.md)
- [迁移状态与下一步](docs/architecture/migration-status.md)
- [内容支持矩阵](docs/architecture/content-support.md)
- [琴战技数据依据与差异](docs/mechanics/jean-tap.md)
- [阶段3验收记录](docs/architecture/stage-3-acceptance.md)
- [统一战斗规则与人工算例](docs/mechanics/combat-v1.md)
- [阶段4验收记录](docs/architecture/stage-4-acceptance.md)
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
