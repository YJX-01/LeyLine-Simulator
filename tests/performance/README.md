# 性能输入与预算

`pnpm perf:engine`执行timeline.mjs，直接读取 `.references/enka/official-example.json`。原件缺失写status=skipped；存在时解析原展柜各Build，预热一次并测量七次resolveBuild，p95取七次最大值，预算2000ms。

报告为artifacts/performance/timeline.json，保留源码指纹、输入SHA-256、Build数、支持状态、median、p95、预算及材料状态。空轴求和另按零值核对。

当前材料提供配装，完整战斗动作、目标和命中原件状态为待补；当前测量对象为配装求值及空轴聚合。完整轴吞吐和优化器性能按各自真实材料测量。

`pnpm build:check`预算为单JS文件500000字节、启动gzip50000字节、工作区静态依赖gzip150000字节。浏览器驱动耗时、进程堆变化和真实设备覆盖按各自测量环境解释。

通用要求见[性能测量](../../docs/evidence-and-validation.md#性能测量)，原件登记见[验证资料](../../tools/data/README.md#验证资料与独立计算记录)。
