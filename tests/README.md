# 测试入口

`unit` 按包组织，`integration` 核对跨模块、文件和内容，`browser` 分开发和生产，`desktop` 和 `performance` 单独运行。辅助代码集中在 `helpers`。

| 命令 | 用途 |
| --- | --- |
| `pnpm test` | Vitest 单元及 TypeScript 集成检查 |
| `pnpm exec vitest run tests/unit/web/domain/calculator-catalog-defaults.test.ts` | 遍历正式目录的命中与增益，检查默认值、命座限制和计算页文案 |
| `pnpm test:content` | Node 内容、目录及文件工具检查 |
| `node --test tests/integration/single-hit-modifier-matrix.test.mjs` | 离线核验五类直伤与套装、武器、队友增益的交叉组合，以及生命阈值和层数边界 |
| `pnpm test:ui` | Chromium 真实库存流程 |
| `pnpm test:ui:contracts` | Chromium 真实样式、焦点与窄屏 |
| `pnpm test:e2e` | 完整 Chromium 开发回归 |
| `pnpm exec playwright test tests/browser/development/roster-replay.spec.ts --project=chromium --workers=1` | 把正式目录的角色命中、武器精炼档、套装件数门槛和场景通过计算器文件与时间轴文件分别保存、重开并交给 Worker 求值 |
| `pnpm test:production` | 根路径和子路径的 Chromium 生产检查 |
| `pnpm test:desktop` | 独立用户目录下的桌面库存和原生文件往返 |
| `pnpm perf:engine`、`pnpm perf:ui` | 可独立运行的[性能测量](performance/README.md) |

桌面验收可通过 `pnpm test:desktop --recorded` 重放已保存的展柜响应。原始响应经桌面 IPC 和导入确认流程处理。

浏览器与桌面串行、单工作线程执行。开发浏览器检查前先运行 `pnpm data:build`，生产检查前先构建根路径和子路径。安装 Chromium 使用 `pnpm exec playwright install chromium`，Linux 可加 `--with-deps`。按需复查 Safari 交互时，安装 WebKit 后用 `pnpm exec playwright test --config playwright.webkit.config.ts <相关用例文件>`。完整操作见[交付流程](../tools/README.md#构建与验证)。

游戏资料验收直接读取获授权的 `.references/artifacts_mona.json` 与 [Enka 展柜原件](../tools/data/README.md#验证资料与独立计算记录)。记录依赖的检查在原件缺失时明确跳过。版本、错误和边界从原件派生，保存与取消等行为可用当前空文档。机制期望按来源独立推导，游戏观测单独登记。详见[测试规范](../docs/evidence-and-validation.md#测试与验证)。

Playwright 辅助代码的运行时映射在 `browser/playwright-runtime.json`，类型检查使用仓库根 `tsconfig.json`。

## 伤害计算器回归

[全目录测试](unit/web/domain/calculator-catalog-defaults.test.ts)随正式数据扩展，检查增益在初始和启用时的取值、计数的合法范围，以及已有的零值和“否”能否保留。伤害数值另用独立公式核对，具体案例见[计算支持与验证资料](../tools/data/README.md#计算支持与验证资料)。

[伤害计算](browser/development/damage-calculator.spec.ts)、[场景冲击](browser/development/scene-damage.spec.ts)和[展柜配装重放](browser/development/vesna-production-chain.spec.ts)覆盖页面与 Worker 的实际操作。三组用例共用[浏览器检查](helpers/calculator-browser.ts)，在渲染时检查增益卡控件的初始值，并检查页面、弹窗、输入提示和无障碍标签是否出现旧的待确认文案。
