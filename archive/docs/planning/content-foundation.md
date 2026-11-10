# F0：内容基础整理（r3，JSON优先）

> 本文件保留上一轮基础整理的方案与范围。用户随后提出完整schema拆分、旧内核退出、统一测试/素材和完整角色定义要求；当前系统重构以[新的待审阅方案](repository-refactor.md)为准。本轮尚未执行这些后续迁移，不能将此前局部实现标记为本次重构完成。

修订日期：2026-11-10。用户最新决定覆盖此前YAML选型：JSON优先，所有角色元数据使用同一规范，并重新整理目录。此前r2收紧的范围继续有效：保留当前项目快照、求值器和四包边界，不增加包平台、数据库或新的计算IR。工程取舍见[方案审查](content-foundation-review.md)，实际交付见[F0记录](f0-implementation.md)。U1已由用户确认结束，P5尚未启动。

## 目标与目录

角色的完整数值、已核验静态规则、支持声明和来源放在同一个JSON中。所有角色复用`schema/src/content-metadata.ts`中的`characterMetadataSchema`；自定义角色导出的character字段也复用该schema。

| 资料 | 唯一维护入口 |
| --- | --- |
| 角色 | `src/game-data/data/characters/<id>.json` |
| 武器 | `src/game-data/data/weapons/<id>.json` |
| 圣遗物套装 | `src/game-data/data/artifact-sets/<id>.json` |
| 公共表/统计口径/简称 | `src/game-data/data/tables/` |
| 数据版本与有序ID清单 | `src/game-data/data/manifest.json` |
| 上游捕获及接口映射 | `tools/data/sources/catalog/`，按来源分组 |
| 仍在使用的旧表 | `src/game-data/data/legacy/` |
| 不参与构建的旧角色参考 | `archive/data/` |
| 图标来源、选择规则与矢量 | `src/web/data/icons/` |
| 游戏运行快照 | `src/game-data/src/generated/{real-game,legacy}/` |
| web运行索引 | `src/web/generated/` |

维护入口说明集中在[game-data README](../../src/game-data/README.md)和[web数据README](../../src/web/data/README.md)。不保留`src/definitions`、`src/real-data`或web的`domain/data`等平行数据目录。docs只保存文档。

## 生成与规则

正式实体JSON → schema/ID/格式校验 → 现有确定性分块 → 公共加载入口 → 当前engine。

`convert-real-game-data.mjs`只校验和打包正式元数据，不重新从原始捕获与零散规则拼接角色，不按中文描述判断效果是否支持。规则维护在实体的skills/modifiers/effects/support字段。来源刷新用单独的`capture-real-game-data.mjs`，只更新原始证据；随后审阅、合并正式实体并核对版本，禁止自动覆盖人工核验内容。

普通生成不联网、不读取参考克隆。字符、武器、套装和原数值保持；角色/武器/套装目录覆盖与完整伤害支持分别声明。格式统一不扩大技能、命座、反应或概率支持。

## 文件、边界与兼容

严格JSON、两空格、UTF-8无BOM、LF、末尾换行。字段、单位、支持范围及错误行为见[格式规范](../architecture/data-format.md)。公共契约由schema导出，game-data复用类型并保持平台独立。

自定义角色复制完整元数据，生成新ID并保留来源；当前界面可编辑名称和各技能/命中/天赋倍率，完整字段可通过JSON文件编辑并校验。显式导入导出与应用到轴内候选，不写账号或库存；取消和错误不覆盖草稿。P3节点/效果仍使用原定义库，未新增任意脚本能力。

项目schemaVersion 1、workbench-v1/workbench-p3、RealBuild完整快照、原求值入口和用户存储保持。候选培养编辑继续保留携带的元数据。未增加快照去重、新轴格式、内容包安装、通用编译器或数据库。

## 工作与验证

| 增量 | 工作与出口 |
| --- | --- |
| F0.1 契约 | 统一角色/武器/套装元数据schema，明确版本、单位和唯一维护入口 |
| F0.2 归位 | 每实体一个JSON，来源/生成/历史分开，同步全部直接消费者 |
| F0.3 规则 | 已核验规则合并到实体，保留原支持边界和计算结果 |
| F0.4 定义往返 | 内置复制、自定义编辑、JSON导入导出、显式轴内应用与取消保护 |
| F0.5 收口 | 全量元数据校验、原输出等价、相关兼容/真实资料路径、构建与清晰交接 |

新增案例使用可追溯真实角色、装备及资料；自定义变动标明试配，不编造库存、游戏轴或观测。输入迁移跑生成/check、架构、类型和受影响单测；相关浏览器/桌面流程串行单worker。独立公式与游戏观测分开记录。

后续P5 → P6 → P4 → P7 → P8。快照去重、新文件版本、数据库、远端包管理、所有属性动态化等，只有实际案例暴露问题且具备兼容依据时再设计，不属于本次整理前置。
