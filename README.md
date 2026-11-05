# LeyLine-Simulator

## TypeScript 重写预览

新版本采用 Vue 3 + TypeScript，独立计算模块通过 Web Worker 在浏览器运行。
当前实现单次攻击公式验证台、可编辑动作序列、限时伤害增益和事件日志，并部分支持琴的点按战技（天赋1—10）。角色面板手动输入，技能采用仓库旧数据，尚未核实当前游戏版本，不代表完整角色模拟。

**阶段3战斗机制已验收**：统一战斗入口支持1—4个测试面板、增益/快照、冷却、切人、命中产球与能量、周期/协同召唤物、标准附着ICD及正反蒸发/融化。启动后点击“综合战斗机制验证”（`/#combat`），可运行人工基准并比较快照与动态面板。

这不是完整游戏计算器：真实角色/武器/套装批量迁移属于阶段4，产品配队界面、图表和方案保存属于阶段5。

需要 Node.js 22.12+（建议 24 LTS）和 pnpm 11.3.0。

```sh
pnpm install
pnpm dev
```

验证命令：`pnpm typecheck`、`pnpm test`、`pnpm build`。

浏览器测试：先执行 `pnpm exec playwright install chromium`，再执行 `pnpm test:e2e`。

- [实施计划](docs/rewrite-plan.md)
- [迁移状态与下一步](docs/architecture/migration-status.md)
- [内容支持矩阵](docs/architecture/content-support.md)
- [琴战技数据依据与差异](docs/mechanics/jean-tap.md)
- [阶段3验收记录](docs/architecture/stage-3-acceptance.md)
- [统一战斗规则与人工算例](docs/mechanics/combat-v1.md)

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
