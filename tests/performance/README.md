# 性能输入与预算

`node tests/performance/timeline.mjs` 读取 `.references/enka/official-example.json`，预热一次并测量七次 `resolveBuild`。p95 取最大值，预算 2000ms。报告 `artifacts/performance/timeline.json` 保存源码指纹、输入摘要、配装数量、各配装支持状态和耗时。原件缺失时登记为跳过。空轴单独核对零值，完整战斗轴吞吐待实录。

`pnpm exec playwright test --config playwright.performance.config.ts` 用 Chromium 测量真实莫娜库存的配置导航，以及莫娜库存和 Enka 展柜的角色详情。导航采集三次点击至第二个动画帧的耗时与 CPU 样本。详情预热一次，采集十次并计算中位数。报告保存为 `artifacts/performance/config-navigation-*.json` 和 `artifacts/performance/character-detail-*.json`，用 `LEYLINE_PROFILE_PHASE=before` 标记比较基线。

`pnpm build:check` 的预算是单个 JS 文件 500000 字节、启动 gzip 50000 字节、工作区静态依赖 gzip 150000 字节。

测量方法和原件状态分别见[性能规范](../../docs/evidence-and-validation.md#性能测量)与[验证资料](../../tools/data/README.md#验证资料与独立计算记录)。
