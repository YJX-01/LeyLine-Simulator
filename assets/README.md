# 统一资源入口

game保存游戏图标及唯一正式矢量，ui保存装饰。[manifest.json](manifest.json)记录资源 ID、文件、别名和大小预算。采集脚本使用 tools/data/sources/asset-capture 下的 inputs.tsv 与 settings.json，分别定位原图、指定固定版本和采集范围。维护记录使用身份与来源，缓存revision在构建时计算。

## 生成与验证

`pnpm data:build`离线校验并复制到.cache/public/assets，由 Vite 从正式资源按需提供游戏及详情图标索引；Vite分发该构建副本。游戏图片运行时使用本地资源。

`node tools/scripts/checks/check-ui-assets.mjs` 核对当前正式定义的全部图标引用、实际文件、格式、来源配置、别名、预算和缓存版本。浏览器解码实际图标，检查 128px 自然尺寸和可见像素，并验证角色培养页的图标展示。覆盖统计从当前定义实时计算。

画布128×128，头像square-portrait-v1保持已裁切取景或统一上部人像取景；武器保留认可细节，法器保留完整轮廓，透明技能/命座居中等比缩放。属性与部位使用单色矢量。单图预算32KiB，整库16MiB，装饰预算10KiB。

属性图标的用法对齐[Yatta角色图鉴](https://gi.yatta.moe/chs/archive/avatar)：暴击率使用空心星形，暴击伤害使用带圆环的实心星形；攻击、生命、防御的固定值使用普通图标，比例值采用该站的原始百分比SVG。采集按采集输入中的固定bundle版本、SVG文件名和模块标识提取路径，保留百分号周围的精细透明轮廓。属性和增益索引共享同一套映射。

普通攻击、旅行者元素形态及奇偶形态按已核对的共享别名引用，真实缺失项准备新候选。显式来源覆盖由采集输入的 sourceOverride 声明，采集失败记录保留本次候选目录。

`python tools/scripts/assets/sync-game-icons.py --out artifacts/content-candidates/<新目录>`按正式资源表与采集输入准备待审资源。capture-stat-vectors.py从固定上游几何和manifest派生规则制备矢量候选，正式SVG位于game/stats与game/artifact-slots。capture-ui-icon-sources.py只刷新.references中的上游树缓存；采集输入保留固定来源、已采用地址和采集策略。图片检查包含内容透明度与占位识别：已知服务器占位源SHA-256为ae5d4d9be2e3ee89c0fc94a326aaefd8412c55d916bef6f7d28c88ebf771af7b，最大透明度37/255。HTTP成功和解码分别核对实际图像内容。

### 两层图标维护流程

1. **元数据层（AnimeGameData）**：运行 `node tools/scripts/data/capture-anime-game-data.mjs`，同步更新 `tools/data/sources/anime-game-data/` 下的 `characters.json`、`weapons.json`、`sets.json`、`skill-icons.json` 与 `base-and-manekin.json`（涵盖角色 `iconName`、技能与命座 `skillIcon`/`icon` 及奇偶双形态被动图标）。
2. **图像与压缩层（本地缓存与镜像降级）**：运行 `python tools/scripts/assets/sync-game-icons.py --out artifacts/content-candidates/<新目录>`，按“已采用本地产物/固定 sprite 树缓存 → `https://enka.network/ui/<icon>.png` → `https://gi.yatta.moe/assets/UI/<icon>.png`”三级优先级解析原图，经占位哈希与 Alpha 检查后压制为 128×128 WebP（单图 ≤ 32 KiB、总库 ≤ 16 MiB）；支持 `--offline` 零网络一致性复核。审核候选产物采用后，运行 `node tools/scripts/checks/check-ui-assets.mjs` 完成最终验收。

## 权属与装饰

游戏原画及图标权属归 miHoYo/HoYoverse 及相关权利人。普通属性和部位矢量采用 Genshin Optimizer 的 MIT 资源，许可原文在 licenses/sources/genshin-optimizer。三份百分比图标来自 Yatta，许可状态为 upstream-unspecified。

页角藤结来自Anonymous/Openclipart，CC0，来源https://openclipart.org/detail/12699/celtic-vine-corner-by-anonymous-12699及https://openclipart.org/share。署名见CREDITS.md，许可与分发记录见licenses/sources.json。

关闭、Line/Ribbon凯尔特图形、页角及收藏的具体已确认表现见[交互契约](../src/web/README.md#已确认交互契约)，通用颜色与字号见[视觉规范](../docs/interface.md#视觉与交互规范)。
