# 日常开发与交付

## 改动放在哪里

| 需求 | 维护入口和常见误区 |
| --- | --- |
| 共享身份、单位、文件格式、任务协议 | `src/schema` 同时维护类型与运行时校验。改契约时核对实际消费方、交换文件和已有资料。引擎与内容各自只依赖 schema，跨工作区使用公开的 `@leyline/*` 入口。 |
| 角色、武器、圣遗物、动作和资源 | 正式输入在 `src/game-data/data`，独立证据在 `tools/data/sources`，未采用的上游材料放忽略的 `.references`。先审阅候选差异，保留身份、原始精度、单位和数组顺序。用 `tools/lib/content-source.mjs` 读写严格 JSON。图像与矢量的维护入口在 `assets`，资源生成的缓存不作为维护源。 |
| 导入自定义角色或动作 | `src/web/src/domain/structured-character-import.ts` 和 `src/web/src/domain/structured-actions-import.ts` 分别负责准备、预览、应用与导出。核对精确身份、模板修订、参数单位和可达依赖。注册表或关联角色发生变化，旧预览须重新准备；同一身份内容冲突不能覆盖本地定义。 |
| UI 与平台差异 | 页面壳在 `src/web/src/pages/WorkspaceShell.vue`，候选编辑保留在 `TeamLoadoutEditor.vue`。先按 `docs/interface.md` 核对现有交互，再修改受影响控件。领域操作留在 `src/web/src/domain`，持久状态由 stores 管理。桌面文件和 IPC 查 `src/web/src/platform/desktop.ts`、`src/web/desktop`；网页 Enka 同源通道查 `src/web/server/enka.mjs`。静态托管需要相应同源通道。 |
| 项目文档与证据 | 产品方向、跨模块规则分别放 `docs/product-direction.md` 和相关主题文档；命令、格式和操作细节归模块 README。依据 `docs/evidence-and-validation.md` 区分公式独立推导、软件运行和游戏观测。获授权原件缺失时，说明受影响的检查。 |

## 常用命令怎么选

以下从仓库根运行，按任务取用。环境版本见[仓库开发约定](../../../../AGENTS.md#local-development)，脚本以 `package.json` 为准。

| 用途 | 入口 |
| --- | --- |
| 开发网页、查看现有构建 | `pnpm dev` 先准备资源；`pnpm preview --port=5175` 服务已有网页构建和本地 Enka 通道。 |
| 排查图标或资源缓存 | `pnpm data:build` 离线生成资源，`node tools/scripts/assets/build.mjs --check` 对比缓存。前者会写缓存。正式角色数据直接从 JSON 装配。 |
| 复现一个项目读数 | `node tools/scripts/data/evaluate-project.mjs <项目.json>` 接受已解包且符合当前契约的 Project，结果输出到标准输出。先检查输入是不是应用导出的文档外壳，以及是否有完整的队员、目标和事件条件。 |
| 选择最小验证 | 领域逻辑查单个 Vitest 用例，内容或工具查单个 Node 用例。可从 `tests/unit/web/domain/mona-import.test.ts`、`tests/unit/web/domain/effective-rolls-real.test.ts` 找已有场景。浏览器与桌面用一个工作线程串行，实际范围和前置条件查 `tests/README.md`。即使传入单个文件也先看它是否枚举全目录。 |
| 构建与本地交付 | 网页入口为 `pnpm build` 和 `pnpm build:check`，桌面入口为 `pnpm desktop:build`。本地验收时核对部署基址、Worker 与懒加载资源、桌面文件往返。正式交付须按 `tools/README.md` 使用匹配当前源码的证据，短验证只能报告它实际覆盖的范围。 |
| 清理产物 | 按 `tools/README.md` 区分资源缓存、网页候选、桌面成功包和用户文件。需要清理时先用 `node tools/scripts/dev/prune-outputs.mjs --dry-run` 等对应预览入口，检查解析路径与保留版本。保护用户文件、浏览器存储、原件和运行中的包。 |

遇到“换端后资料不见”先核对账号、文档类型和浏览器的域名、协议、端口。遇到“本地能开、子路径打不开”先核对构建基址、Worker 和分块的同源 URL、MIME 和缓存头。用户资料恢复和静态资源缓存是两条独立路径。
