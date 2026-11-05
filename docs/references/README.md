# 本地参考资料与来源

核对日期：2026-11-06。参考目录为仓库根下的 `.references/`，由根 `.gitignore` 的 `/.references/` 忽略。只将来源清单和研究结论纳入本项目 Git，不提交外部源码、网页或它们的嵌套 Git 仓库。

本次已经下载三个浅克隆和 Meropide 的少量网页快照。没有安装上游依赖或执行上游应用；这些资料不是本项目的运行或构建依赖。准确分支、提交与本地位置见[来源清单](sources.json)。

## 1. 来源及分工

| 来源 | 本地目录 | 主要用途 |
| --- | --- | --- |
| [莫娜社区分叉](https://github.com/1803233552/genshin_artifact) | `.references/mona-community/` | 圣遗物格式、单人/全队搜索、Buff、属性转换与自定义目标参考 |
| [genshin-db](https://github.com/theBowja/genshin-db) | `.references/genshin-db/` | 角色、天赋、命座、武器、套装、敌人及多语言字段参考 |
| [KQM TCL](https://github.com/KQM-git/TCL) | `.references/kqm-tcl/` | 机制说明、快照/动态取值、敌人机制及证据记录 |
| [梅信心 / Meropide](https://meropide.cn/chs/) | `.references/meropide/` | 中文角色资料、机制研究和数值/公式交叉核对；由用户推荐 |

genshin-db 是静态游戏数据资料，不能替代“读取某个玩家拥有的角色”的账号接口；后者仍需另选具体服务。机制文章也不是可直接执行的角色定义。

## 2. 为什么选择这个莫娜分支

选择的是 `1803233552/genshin_artifact` 社区分叉，非 `wormtql/genshin_artifact` 官方仓库。默认 `main` 当前提交为 `beaced4d82619aa86920d0054ab6114b5fc5608f`。

本次通过 GitHub API 核对分支真实提交，而非仅看仓库 `pushed_at`：该社区仓库 `main` 提交于2025-10-11，`dev` 提交于2024-08-31，因此使用更新的 `main`。同时比较了 SophieZ22、Michael18811380328、grey047 等分叉的默认分支；SophieZ22 当前指向相同提交。

这是本次核实后选定的社区参考，不声称覆盖所有分叉，也不能因仓库2026年有推送就称代码覆盖2026年的游戏版本。后续内容以数据来源、机制依据和独立算例校验为准。

YAS 扫描工具子模块没有初始化；莫娜计算/格式源码已经拉取。当前任务不需要安装扫描工具，也没有将外部仓库接入 pnpm workspace。

## 3. 建议从哪里开始读

### 莫娜社区代码

- `mona_core/src/attribute/`、`buffs/`、`damage/`：属性、效果及伤害组织。
- `mona_core/src/character/`、`weapon/`、`artifacts/`：内容和配装定义。
- `mona_core/src/target_functions/`、`team_target/`：目标函数与全队目标参考。
- `mona_wasm/src/applications/optimize_artifacts/algorithms/`：候选搜索实现。
- `mona_wasm/src/applications/team_optimize/`：全队优化入口。
- `src/wasm/`、`src/workers/`、`mona_dsl/`、`mona_dsl_book/`：调用边界、任务与自定义表达式参考。

首先研究其搜索如何调用目标函数、在哪些条件下剪枝、全队如何处理装备占用。文件中有 A-star 或 heuristic 名称不构成对我们任意自定义轴目标的正确性/最优性保证；需要桥接和参考搜索验证。

### genshin-db

- `docs/data/characters.md`、`talents.md`、`constellations.md`：字段说明。
- `docs/data/weapons.md`、`artifacts.md`、`enemies.md`：装备和敌人数据说明。
- `src/data/ChineseSimplified/`、`English/`：具体数据交叉对照。

只挑需要的字段建立适配，不直接让全部源数据进入浏览器包。数值单位、等级与版本单独核对，不将文本描述视为已验证的执行规则。

### KQM TCL

- `docs/combat-mechanics/snapshot-and-dynamic.md`：快照与动态读取。
- `docs/combat-mechanics/damage/`、`elemental-effects/`、`enemy-mechanics/`：伤害、反应及敌人规则。
- `docs/characters/` 与 `docs/evidence/`：角色资料及机制证据。

先读取机制条目，再核对对应证据、上下文和版本；不能只取一个结论而忽略其适用条件。

### Meropide

已保存首页、速查索引、投稿说明、角色索引及伤害公式、二次转化统计、队伍加成页面。来源 URL、抓取时间和 SHA-256 记录于本地 `.references/meropide/manifest.json`；HTML 位于 `pages/`。

本次检查页面链接并搜索 GitHub，尚未识别到与该网站相对应的公开源码仓库。因此这里是少量网页快照，不是源码克隆，不声称已取得整个网站数据库或原始文章文件。网站内容的公开可读性也不等于授权整体再分发。

## 4. 如何更新与复现

当前 checkout 是浅克隆，分支和 SHA 均已记录。其他开发环境可以先按来源清单的 URL/branch 克隆到相同目录，再核对 SHA；如分支已变化，需要显式 fetch 清单所指提交，再定位到该提交，而不是默默使用新 HEAD。

日常更新先读取状态确认无本地研究修改，再显式 fetch 和查看差异。记录新 SHA、数据版本、发生变化的规则及验证情况后更新来源清单，不自动更新正式游戏快照或已有用户项目。

本地快照不是离线网页镜像，外部媒体和资源未整体下载。需要更多文章时按具体研究主题增补 URL 与时间记录，不在构建期间抓取网页。

## 5. 使用与并行研究约定

- 外部 checkout 保持参考用途，不从 `.references/` 导入生产、测试或构建脚本。
- 正式采用的规则写成我们自己的版本化定义与独立算例，并注明来源、提交/文章地址、单位、支持边界及许可证要求。
- 莫娜与 genshin-db checkout 中存在 MIT 许可文件；代码、游戏数据与文章内容的使用范围分别核对。KQM checkout 未发现根许可文件，不假定其文章可按 MIT 再分发。
- 四条并行工作流使用同一份来源清单，避免各自研究不同 HEAD；规则冲突记录证据，不凭“最新”二字自动覆盖。
- 来源/格式研究可与内核、UI 和独立算例并行；正式接入仍遵守[实施路线的契约及集成顺序](../planning/implementation-roadmap.md#11-并行工作流)。
