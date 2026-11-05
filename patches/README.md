# 依赖补丁

`@vue__devtools-kit@8.2.1.patch` 由 `pnpm patch` / `pnpm patch-commit` 生成，配置与哈希保存在 `pnpm-workspace.yaml`、`pnpm-lock.yaml`，冻结安装自动应用，无需手改node_modules。

原因：Pinia依赖的devtools-kit在模块初始化时读取时间线设置。`typeof localStorage` 也会触发浏览器拒绝访问的getter；上游没有捕获此异常，导致业务应用尚未挂载就白屏，应用自身的存储降级逻辑无法运行。补丁只保护时间线设置的读取/JSON解析和写入，失败时使用原有默认值，不改变业务方案或模拟规则。

三内核浏览器用例模拟getter抛出SecurityError，验证仍可模拟和导出；升级该依赖时，先核实上游修复情况，再移除此补丁并重跑用例。此补丁不是对所有第三方devtools功能的存储兼容性保证。
