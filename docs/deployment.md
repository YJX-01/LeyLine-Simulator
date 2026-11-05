# 生产构建与本地交付

> 适用范围：本文说明当前自动模拟实现。未来的视频打轴与配装优化工作台仍在规划，见[产品方向](planning/product-direction.md)。

## 构建和验证

1. `pnpm install --frozen-lockfile`，随后执行数据/fixture检查、类型检查和单元测试。
2. `pnpm build`、`pnpm build:check`、`pnpm perf:engine`，检查构建体积与性能预算。
3. `pnpm exec playwright install chromium firefox webkit`，执行 `pnpm test:e2e`。Linux环境需安装对应系统库，可使用 `playwright install --with-deps chromium firefox webkit`。
4. `pnpm build:subpath`、`pnpm test:production`，验证根路径和 `/leyline/` 两个构建。两套浏览器报告写入 `artifacts/playwright/`，失败trace分开写入 `test-results/development/` 与 `test-results/production/`。
5. `pnpm release:prepare` 重新构建根路径、检查体积并生成 `artifacts/releases/<commit>-<随机后缀>/`。打包会核对当前源码指纹与两份完整三内核报告，拒绝缺失、失败、跳过或陈旧的证据。最后用 `pnpm release:verify --dir=产物目录` 校验每个站点文件的SHA-256、长度和文件清单。

默认构建位于 `src/web/dist/`。子路径示例位于 `src/web/dist-subpath/`，不要将它当作根路径构建混用。其他子路径可执行 `pnpm --filter @leyline/web build --base=/你的路径/`，随后调整本地服务的base验证；路径必须以斜杠结尾。

交付目录包含 `site/` 静态文件、版本/源码/验收证据清单、使用指南和本地查看脚本，不包含Python、开发依赖或完整源码。根路径产物可在目录内执行 `node tools/scripts/serve-dist.mjs --dir=site` 查看。当前只生成本地候选目录，不自动上传、发布、建标签或push。

## 静态托管约定

- 通过HTTPS或localhost提供页面，不能使用file协议。Web Worker必须能从同源资源地址加载，JavaScript使用正确MIME类型。
- `index.html` 使用 `Cache-Control: no-cache`，使浏览器重新验证入口。`assets/`中带内容哈希的资源使用长期缓存和`immutable`；404/失败资源使用`no-store`，不要将不存在的JS回退为HTML。
- 更新采用完整版本目录或原子切换，先上传新资源再切入口；保留上一版本资源一段时间，避免已经打开的旧页面找不到懒加载分块。回滚使用上一版完整站点，不能只回滚单个JS文件。
- 页面使用hash导航，服务端无需把所有未知路径回退至首页。子路径构建必须部署在相同base，Worker、图表和开发工具分块均要保留。
- 本地方案按浏览器origin保存，换域名、协议或端口会进入不同存储空间。更换发布地址前提醒使用者导出方案。

仓库提供的 `serve-dist.mjs` 仅绑定127.0.0.1，用于验证与本地查看；它不代替线上托管服务。它拒绝目录/隐藏文件和未知资源，返回正确MIME及上述缓存头。`.vite/manifest.json` 只用于构建检查，不进入交付站点。

## CI与证据

工作流在Linux执行检查、三内核浏览器用例、两种路径构建、生产用例和候选打包，并保存 `artifacts/`、`test-results/` 为CI附件。此处配置已在本地验证对应命令，但没有push，因此没有宣称远端CI已运行。

性能基线及预算见 `performance/README.md`。浏览器性能包含驱动往返且受机器和并发影响；Node堆差值不是浏览器内存，更不是长期无泄漏保证。Windows Playwright WebKit验收不等于真实Safari/iOS设备覆盖。
