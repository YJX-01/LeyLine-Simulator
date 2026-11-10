# F0 实施记录：JSON元数据与目录整理

> 本记录描述上一轮局部实现。用户进一步要求的系统重构见[当前待审阅方案](repository-refactor.md)，其尚未实施；旧内核仍在正式依赖链、角色资料缺少文本等问题已在新方案中明确，不以此记录的局部检查代替后续验收。

2026-11-10，分支`refactor/f0-content-foundation`，起点`65e8544`。用户已明确U1结束，随后将维护格式改为JSON优先，并要求统一角色规范、重新整理目录。本记录以最终JSON方案为准，替代此前YAML布局和“三份规则文件”的说明。当前没有提交或推送，P5尚未启动。

## 实际交付

| 项目 | 当前结果 |
| --- | --- |
| 统一角色元数据 | `data/characters/<id>.json`共140份完整角色文件，琴/行秋/胡桃与旅行者形态都用同一个characterMetadataSchema；包含基础属性、成长、突破、技能、静态修饰、支持状态与来源 |
| 武器与套装 | `data/weapons/`256份、`data/artifact-sets/`63份；各自同一schema，规则直接保存在对应实体中 |
| 统一规范 | 正式元数据严格JSON、两空格、UTF-8无BOM、LF、末尾换行；manifest版本/有序ID、文件名/ID、重复/漏项、字段及有限数值均检查 |
| 消除分散规则 | 移除三份YAML规则输入与content-rules契约，已核验规则合并到实体；删除YAML解析器、跨语言Node桥和直接依赖 |
| 收敛生成目录 | 游戏运行产物只在`game-data/src/generated/{real-game,legacy}/`，web数据和图标索引只在`web/src/generated/`；全部消费者和脚本同步 |
| 来源与历史归属 | 捕获/接口映射在`game-data/data/sources/`，公共表在`tables/`；八份活跃旧表保留在`legacy/`，47份未使用旧角色JSON与名称表归档到`archive/data/` |
| docs纯文档 | 原102份非文档资料已迁出，docs仅51份Markdown；原始迁移路径/哈希保留在`tools/data/migrations/f0.json`，架构检查阻止数据回流 |
| 自定义角色 | 完整元数据复制、名称/倍率编辑、JSON导入导出、显式应用当前轴候选；character字段复用内置元数据schema，原账号与库存独立 |

维护入口集中在[游戏数据README](../../src/game-data/README.md)、[界面图标README](../../src/web/data/README.md)和[格式规范](../architecture/data-format.md)。不再到src/definitions、src/real-data或web的domain/data中查找维护数据。

## 日常修改与来源更新

修改角色直接编辑`src/game-data/data/characters/<id>.json`，然后在根运行`node tools/scripts/data/convert-real-game-data.mjs`和`pnpm data:check`。内置与自定义复用字段语义和校验；未核验角色使用相同结构并明确标注不支持，不填造倍率或规则。

`convert-real-game-data.mjs`现在只校验完整实体并生成确定性分块，保持既有公共加载接口和分块大小；不再拼接零散人工规则或从中文描述推断支持。普通生成离线，不读参考克隆，不覆盖维护输入。

`capture-real-game-data.mjs`是单独的显式来源捕获动作，只刷新`data/sources/genshin-db/`的固定提交证据。维护者随后审阅差异，将核验后的字段合并到实体、核对版本和支持范围，再生成。原始捕获中的旧路径/哈希是当时来源记录，不是docs活跃读取入口。

其他公共表、Enka映射、强化档位、版本目录等继续使用对应维护脚本，完整离线链由`pnpm data:check`覆盖。图标来源与SVG集中在web/data/icons；生成的实际图片仍在public，来源映射移动不改变图片字节。

## 兼容与支持范围

角色定义文件仍是独立kind/schemaVersion 1外壳，包含数据/规则版本、原角色与用户来源、完整character；根来源明确为user且verified为false。界面编辑名称和各技能/命中/天赋倍率，其他字段可经JSON文件修改并校验。P3节点/效果定义库保持原文件，不新增任意脚本或通用规则编辑器。

显式应用只修改当前轴中同来源队员的独立快照，可撤销；校验来源、数据/规则版本与武器类型。候选培养编辑保留角色/原武器/主词条和版本快照，显式换武器才加载目录。账号、穿戴、展柜、配置、组合、实物ID和用户localStorage不自动迁移。

保留项目schemaVersion 1、workbench-v1/workbench-p3、完整RealBuild与既有求值器。不扩大角色机制、命座、武器动态被动、反应或概率范围。GenshinTools仅作研究参考，未导入或运行其应用实现。

## 验证与证据

环境：Node.js25.9.0、pnpm11.3.0、Electron45.2.3。原依赖版本保持，新增YAML直接/传递依赖已移除；锁文件相对基线仅新增game-data到schema的workspace声明。schema维护加载沿用现有Vite方式，未要求Node原生TS。

- `pnpm data:check`通过：492份内容源、459份完整实体、各生成族与不可变历史哈希；`pnpm fixture:check`通过。
- `pnpm architecture:check`、`pnpm typecheck`、`pnpm assets:check`、`pnpm licenses:check`通过。图标仍2050张、26项原缺口；许可196包、12个直接依赖、33包产品闭包。
- `pnpm test:content`四项通过：实际来源字符串/数值、从真实源派生的非法JSON、统一排版往返、已支持/未支持真实角色使用共同schema并拒绝重复技能。
- 相关Vitest31项通过：固定真实目录、真实伤害、旧角色数值、自定义角色复制/导入/候选应用。历史兼容测试不充当新增玩家案例。
- Chromium单worker四条流程通过：角色元数据顺序小数输入/替换保护/导入导出/390px，已记录行秋显式采用配装并保存自定义候选培养，实际458件莫娜库存文件往返，既有角色详情/嵌套选择器契约。
- `pnpm build`、`pnpm build:check`通过；bootstrap gzip34036B、workbench gzip98851B，低于50000/150000B门槛。
- 新桌面包`build-aP3vUk`已生成，`pnpm test:content:desktop`通过实际458件导入、原生导出/打开、保存取消、390px及账号不变检查。稳定入口`artifacts/desktop/Start-LeyLine.cmd`。桌面验证与浏览器串行，隔离临时profile，不干扰用户现有应用。

逐实体对照459份内容，与整理前元数据深比较完全一致，保留数值、来源、支持和规则。核对38份既有游戏/web生成快照，只有正式数据manifest变化，其余字节相同。路径重排及实体源哈希替代旧分散规则哈希是预期的清单变化。

本地证据（忽略产物）：`artifacts/json-foundation-baseline/`、`artifacts/json-foundation-paths.json`、`artifacts/json-foundation-verification.json`、浏览器trace/截图及`artifacts/f0-desktop-validation/`。旧搬迁原始哈希另在tools/data/migrations/f0.json；其历史原文不当作当前维护目录。

## 阶段边界

U1已结束，F0基础实施与当前维护交接已整理；后续顺序为P5 → P6 → P4 → P7 → P8。当前[交接提示](implementation-agent-prompt.md)明确代码与维护入口、P5启动前的实际案例调查，不重做基础搬迁。

实际整队/配装/轴和观测材料的缺口继续留给对应后续工作，不把静态目录或本次重排称为游戏实测，不把无关公开展柜与私有库存混成一个账号。未启动优化器、完整概率系统、视频或数据库项目。
