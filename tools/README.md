# 工具索引

| 目录 | 职责 |
| --- | --- |
| scripts/data | 内容生成、显式采集、候选与数值审计 |
| scripts/assets | 资源采集、构建副本与索引 |
| scripts/checks | 架构、文档、来源、资源及体积检查 |
| scripts/build | 构建插件与桌面打包 |
| scripts/release | 本地候选与分发校验 |
| scripts/dev | 启动、本地服务与清理 |
| scripts/licenses | 许可采集、同步与核对 |
| lib | 实际复用的JSON、TS加载、指纹及产物定位 |
| data | 来源原件、参考索引、审计与具体研究 |
| patches | 依赖补丁 |

- [工具命令](#工具命令)
- [构建、托管与本地交付操作](#构建托管与本地交付操作)

根package.json提供正式命令。本页集中维护命令、输入输出及交付操作；[资料入口](data/README.md)集中维护具体来源与核对。

应用运行代码位于src/web/desktop和server，功能检查位于tests。通用维护规则见[工具流程](../docs/development-and-delivery.md#工具维护流程)。

## 工具命令

计算定义由lib/calculation-library.mjs装配实体calculation与两个公共库；源所有权重复即失败。数值审计从同一维护位置读取，通过引擎模板描述同时核对TS算法常数和JSON参数，直接与固定采用资料比较，不依赖生成快照或旧碎片路径。numericAudit为异步入口，调用者须await。prepare-character-update保留本实体专属定义，基础形态的所有权不会复制到其他形态。

content-linking按精确身份解析角色命中、参数绑定及输出条件，装配逐实体的运行闭包。生成器读取维护JSON并写出派生分块。数值审计直接核对星伤倍率、层数阈值、队伍增益、基础增益上限、命座参数及已采用的装备效果。

manifest.actions枚举可选动作文件。convert-real-game-data逐份核对角色精确版本、状态守卫、参数单位及命中/输出引用，生成actions.json的闭合快照并再次离线编译。共同库包含各动作拥有的定义，但角色单次闭包不会因目录存在动作而自动带入。数值审计另核对状态容量、独立时效、资源来源下界、命座入口及退出次数；未知动作时刻不生成占位调度。

仓库根使用Node.js 22.12+、pnpm 11.3.0，CI使用Node.js 24。依赖安装为 `pnpm install --frozen-lockfile`，安装按供应链策略执行。Python及Pillow用于显式维护采集。

| 根命令 | 输入、输出与写入范围 |
| --- | --- |
| data:build | 正式JSON与资源，写game-data/generated、web/generated、.cache/public；离线、复用相同字节并移除废弃派生物 |
| data:check | 直接数值、模板及生成结果比较，只读 |
| data:capture | 显式读取固定.references/genshin-db，原字节写新artifacts/content-candidates子目录 |
| data:prepare-characters --out artifacts/content-candidates/<新目录> | 当前来源与规则生成待审角色定义和差异 |
| data:audit | 逐字段比较数值族，更新tools/data/audits摘要 |
| assets:check、architecture:check、docs:check | 资源、模块依赖、文档内容与链接、命令检查 |
| dev、build、build:subpath | 先离线生成，再启动Vite或写src/web/dist、dist-subpath |
| desktop:build、desktop:preview:build | 临时工作区构建，共用artifacts/desktop/releases两版成功包 |
| desktop:start | 启动最新本地产物 |
| typecheck、test、test:content | TypeScript、Vitest单元与集成、Node内容文件检查 |
| test:e2e、test:ui、test:ui:contracts | 全浏览器、真实库存、实际样式与焦点规格；单worker |
| test:desktop、test:ui:desktop、test:content:desktop | 桌面库存与文件、同流程别名、元数据原生文件；独立临时profile |
| test:production | 串行根路径与/leyline/生产输出检查，先构建二者 |
| build:check、perf:engine | 体积预算、原始公开展柜Build求值；报告artifacts/performance |
| project:evaluate <项目.json> | 调用者当前项目求值，stdout输出 |
| licenses:capture | 显式读取安装依赖并更新licenses声明，元数据核验可能联网 |
| licenses:sync、licenses:check | 离线复制.cache/public/licenses、只读核对原件 |
| preview | 当前网页与Enka本地服务，127.0.0.1，--port、--base、--dir |
| release:prepare、release:verify --dir=... | 当前完整三浏览器证据下生成或核对本地交付候选 |
| outputs:prune --dry-run | 两版成功包保留预览；移除dry-run才处理更早成功包 |
| clean:outputs --dry-run、clean:cache --dry-run | 解析路径、目录链接与tracked文件核对及清理预览；移除dry-run执行 |

`data:build --check`与普通检查只读，失败指出来源、字段或产物。套装简称维护于src/game-data/data/tables/artifact-set-short-names.json，运行投影由data:build生成，简称清单以正式JSON为准。

`node tools/scripts/data/audit-damage-paths.mjs`只读输出绑定摘要；完整索引与内容规则清单由正式生成写入game-data/generated。文档维护独立于数据生成。

素材工具位于tools/scripts/assets：capture-stat-vectors.py --out准备矢量候选，capture-ui-icon-sources.py刷新忽略的上游树缓存，sync-game-icons.py --out按assets/manifest.json准备待审图片；普通构建从assets复制与生成索引。

`clean:outputs`处理generated、资源缓存、网页构建、报告和旧中转；最终两版包、内容候选、基线备份和用户原件保留。`clean:cache`显式处理.cache，执行中的打包工作区由清理检查保护。进程按本次创建记录管理。

工具源码分工见[工具索引](README.md)，构建与缓存操作见[交付步骤](#构建托管与本地交付操作)。

## 构建、托管与本地交付操作

通用约定见[交付规范](../docs/development-and-delivery.md#构建与交付)。网页和桌面运行WorkspaceShell，原生桌面入口位于src/web/desktop，Enka共用服务位于src/web/server。

### 构建与验证

1. `pnpm install --frozen-lockfile`、`pnpm data:build`准备依赖和运行分块，执行数据、架构、类型及相关行为检查。
2. `pnpm build`、`pnpm build:check`、`pnpm perf:engine`检查网页、体积和真实输入性能。
3. `pnpm exec playwright install chromium firefox webkit`准备浏览器，再执行`pnpm test:e2e`；Linux按需要使用`--with-deps`安装系统库。
4. `pnpm build:subpath`、`pnpm test:production`验证根路径及/leyline/。报告位于artifacts/playwright，trace分别在test-results/development与production。
5. 桌面先`pnpm exec install-electron`准备匹配运行时，再`pnpm desktop:build`、`pnpm test:desktop`。真实输入读取.references/artifacts_mona.json，独立profile与浏览器串行。
6. `pnpm release:prepare`生成网页本地候选，核对当前源码指纹、完整用例清单及开发/生产三内核报告。证据须成功且无跳过、flaky或陈旧指纹；最后`pnpm release:verify --dir=<目录>`核对每项SHA-256、长度与文件清单。

日常按实际改动选择上述检查，最终交付遵循冻结源码与匹配证据。CI在Linux执行对应检查和浏览器矩阵，实际远端执行状态由工作流运行记录提供。

默认网页输出为src/web/dist，子路径为src/web/dist-subpath。其他base使用`pnpm --filter @leyline/web build --base=/<路径>/`并按相同base验证。

### 桌面与产物管理

桌面稳定入口为artifacts/desktop/Start-LeyLine.cmd，最新指针artifacts/desktop/latest.json，成功包位于releases。desktop:preview:build复用正式桌面流程与目录，版本读取根package.json。

桌面在.cache/build独立工作区直接构建并打包，成功或失败均清理本次中转。网页候选也在临时目录完成后登记。两个交付家族各保留最新及上一次成功包，验证完成后原子更新latest.json，再处理更早包；仍在运行的旧桌面包留待用户关闭。

离线Electron归档目录通过LEYLINE_ELECTRON_ZIP_DIR指定，归档名为electron-v<版本>-<平台>-<架构>.zip，版本须匹配已安装依赖。默认模式按packager下载流程执行。

`pnpm outputs:prune --dry-run`预览旧成功包清理；`pnpm clean:outputs`处理生成与中间目录，保留最终包、原件和候选；`pnpm clean:cache`显式清理整个缓存。每项路径检查解析绝对位置、链接与tracked状态。

### 托管与缓存

| 对象 | 配置 |
| --- | --- |
| 页面 | HTTPS或localhost，hash导航，构建base与部署子路径一致 |
| index.html | Cache-Control: no-cache |
| 带摘要assets | 长期max-age与immutable |
| 失败资源 | no-store，返回正确错误状态与MIME |
| Worker及懒加载分块 | 同源、正确JavaScript类型，完整版本资源一起分发 |

先上传新资源再切换入口，旧版分块保留过渡期，回滚使用整版站点。浏览器存储按origin隔离，更换地址前导出资料。

serve-dist.mjs仅绑定127.0.0.1，检查路径、隐藏文件与未知资源，提供正确MIME及缓存头。本地查看执行`node tools/scripts/dev/serve-dist.mjs --dir=site`，通过HTTP入口访问。.vite/manifest.json用于构建核对，交付复制时排除.vite。

网页候选含site、manifest.json、使用指南及本地服务文件；USER-GUIDE.md从src/web/README.md的“地脉工作台使用说明”章节提取，并还原独立文档的标题层级。候选准备、验证与对外发布为独立操作。

### 许可与指纹

原文在licenses，概览THIRD_PARTY_NOTICES.md，署名CREDITS.md。`licenses:capture`按依赖更新，`licenses:sync`离线分发，`licenses:check`核对。

运行资源进入.cache/public/licenses，构建按实际保留模块生成bundled-packages.json。网页、子路径、桌面共用分发目录，设置页提供查看入口。桌面根保留Electron的LICENSE与LICENSES.chromium.html并与安装原件比较。

缓存revision和交付指纹在生成时计算，永久维护记录使用身份、路径、别名和来源版本；功能性原件、占位识别及依赖校验保留各自依据。网页包manifest包含版本、源码、证据及全部站点文件摘要。
