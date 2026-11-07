# 第三方软件、数据与素材声明

许可原文统一保存在 `licenses/`，应用内入口为“设置 → 开源许可与鸣谢”。项目自身的统一许可证尚待确定。

## 软件依赖

当前快照包含 12 个直接依赖、196 个包版本。本次网页代码包含 6 个第三方包：Vue 的 reactivity、runtime-core、runtime-dom、shared，以及 Pinia、Zod。包声明分布为 MIT 172、Apache-2.0 7、ISC 7、BlueOak-1.0.0 5、BSD-2-Clause 4、BSD-3-Clause 1。

[依赖清单](licenses/DEPENDENCIES.md)记录实际版本、协议和用途；[机器清单](licenses/dependencies.json)记录直接关系、平台与补丁；[许可汇编](licenses/npm-LICENSES.txt)保留上游 LICENSE、NOTICE 和附带组件声明。

| 直接依赖 | 用途 | 声明协议 | 使用范围 |
| --- | --- | --- | --- |
| Vue、Pinia | 界面和状态管理 | MIT | 网页、桌面渲染器 |
| Zod | 数据契约校验 | MIT | 网页、桌面渲染器 |
| Electron | 桌面壳、文件与网络桥接 | MIT；内嵌组件使用各自许可 | 桌面运行时 |
| Vite、@vitejs/plugin-vue | 开发服务和生产构建 | MIT | 构建工具 |
| TypeScript、vue-tsc | 类型检查 | Apache-2.0 / MIT | 开发工具 |
| Vitest、@playwright/test | 单元与浏览器检查 | MIT / Apache-2.0 | 测试工具 |
| @electron/packager | 桌面打包 | BSD-2-Clause | 打包工具 |
| @types/node | Node 类型定义 | MIT | 类型检查 |

生产构建的 `licenses/bundled-packages.json` 列出实际进入 JavaScript 产物的包。完整清单还包含开发工具和可选平台依赖。

`@vue/devtools-kit@8.2.1` 应用了本地存储兼容补丁，处理 localStorage 读取、解析和写入异常。原始 MIT 声明保留，修改记录见 `tools/patches/`。

## 代码、数据与素材来源

| 来源 | 实际用途 | 许可记录 |
| --- | --- | --- |
| Genshin Optimizer / frzyc 与贡献者 | 属性 SVG 路径、镂空派生图、部分游戏图标镜像 | 路径代码 MIT；原文位于 `licenses/sources/genshin-optimizer/LICENSE` |
| genshin-db / theBowja 与贡献者 | 角色、技能、装备、曲线、名称和目录元数据 | MIT；原文位于 `licenses/sources/genshin-db/LICENSE` |
| 莫娜占卜铺 / wormtql、TwiceDrop 与社区 | JSON 格式、交互参考、目录身份和部分图片来源 | MIT；原文位于 `licenses/sources/mona/LICENSE` |
| PathOfGenshin/resources、GenshinWikiMap | 游戏图像镜像、五种通用普攻原图 | 仓库代码 GPL-3.0；本项目使用其整理的游戏图片 |
| Enka.Network | 公开展柜服务、接口文档、身份映射 | 接口规则见上游文档；固定资料的独立许可待补核 |
| GachaBase | 技能数字 ID 与名称核对 | 页面数据条款待补核 |
| LunaGC 数值资料 | 圣遗物档位与 ID | 独立数据许可待补核 |
| KQM TCL、梅信心 / Meropide | 机制研究和证据交叉核对 | 研究引用，具体链接见机制文档 |

固定提交、用途及来源文件见 [sources.json](licenses/sources.json)。逐图 URL、源哈希和转换记录见素材清单及 `public/README.md`。

## 工具与桌面组件

Pillow 用于离线图标处理，版本固定在 `tools/requirements-assets.txt`。MIT-CMU 及其附带图像库声明保存在 `licenses/tooling/Pillow/LICENSE`。

Node.js、pnpm、Python 用作开发环境。应用通过 CSS 使用系统字体。桌面发行目录保留 Electron 的 `LICENSE` 和 `LICENSES.chromium.html`，后者包含 Chromium、Node.js、V8 等组件的原始声明。

## 待补记录

| 项目 | 当前记录 |
| --- | --- |
| stackback@0.0.2、err-code@2.0.3 | 安装包声明 MIT，独立 LICENSE/NOTICE 缺失；已收录 package.json 声明及现有 README 许可段 |
| Enka 固定资料、GachaBase、部分数值资料与历史常量 | 来源已登记，独立数据授权记录待补核 |
| 本项目整体 | 统一许可证待确定 |

原神游戏美术、名称及内容的权利归 miHoYo / HoYoverse 及相关权利人。软件、数据和素材按各自的许可记录归档。
