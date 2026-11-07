# 第三方许可归档

这里统一维护第三方许可，图标目录保留图片资源。

- 根目录 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)：使用情况、分发范围、补丁和已知出处缺口。
- 根目录 [CREDITS.md](../CREDITS.md)：作者、社区、服务和素材署名。
- [DEPENDENCIES.md](DEPENDENCIES.md)、[dependencies.json](dependencies.json)：实际 pnpm 依赖树的版本、协议声明、直接/间接关系和使用类别。
- [npm-LICENSES.txt](npm-LICENSES.txt)：包内原始 LICENSE / NOTICE / COPYING 等文本，包含原始版权行及上游嵌入组件声明。
- [sources.json](sources.json)、`sources/`：实际复用的代码、数据、图像及对应原始许可证。
- [tooling.json](tooling.json)、`tooling/`：离线素材工具 Pillow 及其随轮子附带的组件声明。

更新依赖或补丁后运行 `pnpm licenses:capture`；仅同步网页副本运行 `pnpm licenses:sync`；校验快照和分发副本运行 `pnpm licenses:check`。生成器读取已安装包及其原始许可文件。

`src/web/public/licenses/` 是分发副本，会进入网页、子路径构建和桌面渲染器。Vite 构建另生成 `licenses/bundled-packages.json`，按实际进入产物的模块列包；它与完整开发依赖清单用途不同。Electron 自带的 `LICENSE` 和 `LICENSES.chromium.html` 由桌面打包器原样保留在应用根目录。

完整清单覆盖开发、测试和可选平台二进制；实际网页模块另见构建清单。
