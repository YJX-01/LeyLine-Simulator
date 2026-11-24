# 工具索引

`scripts/data` 负责来源采集、候选与审计，`scripts/assets` 准备资源，`scripts/checks` 校验仓库输入及构建产物。构建、交付、本地服务与许可工具分别位于 `scripts/build`、`scripts/release`、`scripts/dev` 和 `scripts/licenses`。共用实现放在 `lib`，依赖补丁放在 `patches`。具体来源和采用记录见[资料入口](data/README.md)。


上一版存档用 `node tools/scripts/data/convert-previous-file.mjs <旧文件.json> <新文件.json>` 离线另存。目标文件必须尚未存在。命中选择无法唯一还原时，命令会列出原记录和字段供重选。全目录数值、授予和排除的逐项验收可用 `node tools/scripts/data/audit-calculation-coverage.mjs --report <报告.json> --gaps <缺口.md>` 重跑。

## 工具命令

从仓库根运行命令。环境要求和工作流见[开发入口](../README.md)及[工具维护规范](../docs/development-and-delivery.md#工具维护流程)。

| 命令 | 输入与输出 |
| --- | --- |
| `pnpm data:build` | 从正式资源生成 `.cache/public/assets`，复用相同字节并清理废弃副本 |
| `pnpm data:check` | 只读比较来源数值、目录依赖、展示与导入映射和资源缓存 |
| `node tools/scripts/data/capture-catalog.mjs` | 将固定 `.references/genshin-db` 的原始字节复制到新审阅目录 |
| `python tools/scripts/data/prepare-character-update.py --out artifacts/content-candidates/<新目录>` | 按当前来源和规则生成角色候选及差异 |
| `node tools/scripts/data/audit-numeric-sources.mjs` | 核对数值并更新 `tools/data/audits/numeric-precision.json` |
| `node tools/scripts/data/audit-calculation-coverage.mjs --json` | 报告当前正式目录的编译覆盖、命中绑定和效果。使用 `--require-complete` 检查目录是否全部闭合 |
| `node tools/scripts/checks/check-ui-assets.mjs` | 核对资源格式、来源、别名、预算和角色引用 |
| `pnpm architecture:check`、`node tools/scripts/checks/check-docs.mjs` | 核对模块边界、文档结构、链接及命令入口 |
| `node tools/scripts/data/evaluate-project.mjs <项目.json>` | 读取已解包的当前 `Project` JSON，将求值结果写到 stdout |
| `pnpm preview --port=5175` | 本地托管网页与 Enka 服务，支持 `--base` 和 `--dir` |
| `node tools/scripts/licenses/third-party-notices.mjs --capture` | 读取安装依赖并更新许可原件与清单，元数据核验可联网 |
| `node tools/scripts/licenses/third-party-notices.mjs`、`node tools/scripts/licenses/third-party-notices.mjs --check` | 离线复制分发许可或只读核对 |

`pnpm data:build --check` 只核对资源缓存。正式 JSON 由 Vite 读取，计算定义由 `lib/calculation-library.mjs` 装配。角色和可选动作按精确身份解析各自依赖，闭包由共同引擎编译。数值审计直接比较 TS 模板和 JSON 参数与采用来源，`numericAudit` 为异步入口。

素材采集需要 Python 和 Pillow。采集与本地缓存位置见[资源维护](../assets/README.md#生成与验证)。

## 构建、托管与本地交付操作

### 构建与验证

1. `pnpm install --frozen-lockfile` 安装依赖。`pnpm build` 准备资源并构建至 `src/web/dist`，`pnpm data:build && pnpm --filter @leyline/web build --base=/leyline/ --outDir=dist-subpath` 构建基址为 `/leyline/` 的 `src/web/dist-subpath`。其他基址使用 `pnpm --filter @leyline/web build --base=/<路径>/` 并按相同基址验证。
2. 按改动执行数据、架构、类型、体积和行为检查。浏览器、桌面和性能命令见[测试入口](../tests/README.md)。
3. 网页交付运行完整的 `pnpm test:e2e` 和 `pnpm exec playwright test --config playwright.production.config.ts`。报告在 `artifacts/playwright`，失败 trace 在 `test-results/development` 和 `test-results/production`。Safari 兼容性按需用 WebKit 检查，记录在 `test-results/webkit`。
4. 桌面使用 `pnpm exec install-electron` 准备对应运行时，再运行 `pnpm desktop:build` 和 `node tests/desktop/workspace.mjs`。
5. `pnpm build && pnpm build:check && node tools/scripts/release/prepare-release.mjs` 生成网页本地候选，核对源码指纹、当前完整用例清单及 Chromium 开发和生产报告。每条用例须首次通过。`node tools/scripts/release/verify-release.mjs --dir=<目录>` 核对文件清单、长度及 SHA-256。

### 桌面与产物管理

桌面入口为 `artifacts/desktop/Start-LeyLine.cmd`，也可执行 `node tools/scripts/dev/start-desktop.mjs`。成功包位于 `artifacts/desktop/releases`，`latest.json` 指向最新成功包。本地预览使用同一个包，版本取根 `package.json`。

离线打包可通过 `LEYLINE_ELECTRON_ZIP_DIR` 提供与依赖版本匹配的 `electron-v<版本>-<平台>-<架构>.zip`。默认由 Packager 下载。桌面和网页在 `.cache/build` 里分别完成临时构建，结束后清理中转。成功登记后每个交付系列保留最新及上一次成功包，正在运行的桌面包留待关闭后处理。

| 清理入口 | 范围 |
| --- | --- |
| `node tools/scripts/dev/prune-outputs.mjs --dry-run` | 预览两版保留范围之外的成功包 |
| `node tools/scripts/dev/clean.mjs --dry-run` | 预览资源缓存、网页构建、报告与中转。保留最终包、原件、候选和基线备份 |
| `node tools/scripts/dev/clean.mjs --cache --dry-run` | 预览整个 `.cache` |

去掉 `--dry-run` 执行清理。清理检查解析路径、目录链接、Git 跟踪文件及正在使用的打包工作区。

### 托管与缓存

静态站可使用 HTTPS 或 localhost，部署基址与构建一致。为入口设置 `Cache-Control: no-cache`，为带摘要的资源设置长期 `max-age` 和 `immutable`，失败响应使用 `no-store`。Worker 与懒加载分块使用同源资源和正确的 JavaScript MIME。部署与回滚见[交付规范](../docs/development-and-delivery.md#托管与分发)。

本地候选包含 `site`、`manifest.json`、用户指南及服务脚本。运行 `node tools/scripts/dev/serve-dist.mjs --dir=site` 可在 `127.0.0.1` 查看。服务检查路径及隐藏文件，返回正确的 MIME 和缓存头。构建使用的 `.vite/manifest.json` 留在构建输出。候选指南从[地脉工作台使用说明](../src/web/README.md#地脉工作台使用说明)提取。

### 许可与指纹

[第三方许可入口](../licenses/README.md)记录原件、分发包及声明。构建将许可同步到 `.cache/public/licenses`，按实际模块生成 `bundled-packages.json`。桌面包保留 Electron 自带的两份许可原件。

生成时计算资源缓存修订和交付指纹。承诺采用的来源记录使用路径、身份、别名与来源版本。网页交付清单包含源码、验收证据、版本和站点文件摘要。
