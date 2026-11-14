# 统一资源入口

game保存游戏图标及唯一正式矢量，ui保存装饰。[manifest.json](manifest.json)统一记录ID、文件、别名、来源地址/版本、尺寸、转换、派生规则、许可及采集策略。维护记录使用身份与来源，缓存revision在构建时计算。

## 生成与验证

`pnpm data:build`离线校验并复制到.cache/public/assets，生成src/web/generated中的游戏及详情图标索引；Vite分发该构建副本。游戏图片运行时使用本地资源。

`pnpm assets:check`验证当前正式定义的全部引用、实际文件、矢量格式与来源配置、尺寸、别名、预算及缓存版本。浏览器asset-coverage逐图解码、绘制128px画布并检查可见像素，再检查相关角色培养中的实际图标。覆盖统计从当前定义实时计算。

画布128×128，头像square-portrait-v1保持已裁切取景或统一上部人像取景；武器保留认可细节，法器保留完整轮廓，透明技能/命座居中等比缩放。属性与部位使用单色矢量。单图预算32KiB，整库16MiB，装饰预算10KiB。

属性图标的用法对齐[Yatta角色图鉴](https://gi.yatta.moe/chs/archive/avatar)：暴击率使用空心星形，暴击伤害使用带圆环的实心星形；攻击、生命、防御的固定值使用普通图标，比例值采用该站的原始百分比SVG。采集按manifest中的固定bundle版本、SVG文件名和模块标识提取路径，保留百分号周围的精细透明轮廓。属性和增益索引共享同一套映射。

普通攻击、旅行者元素形态及奇偶形态按已核对的共享别名引用，真实缺失项准备新候选。显式来源覆盖由manifest条目的sourceOverride声明，采集失败记录保留本次候选目录。

`python tools/scripts/assets/sync-game-icons.py --out artifacts/content-candidates/<新目录>`按manifest准备待审资源。capture-stat-vectors.py从固定上游几何和manifest派生规则制备矢量候选，正式SVG位于game/stats与game/artifact-slots。capture-ui-icon-sources.py只刷新.references中的上游树缓存；固定来源、已采用地址和采集策略由manifest维护。图片检查包含内容透明度与占位识别：已知服务器占位源SHA-256为ae5d4d9be2e3ee89c0fc94a326aaefd8412c55d916bef6f7d28c88ebf771af7b，最大透明度37/255。HTTP成功和解码分别核对实际图像内容。

## 权属与装饰

游戏原画及图标权属归miHoYo/HoYoverse及相关权利人，来源代码许可与美术权属分别登记。普通属性和部位矢量采用Genshin Optimizer MIT资源，原文在licenses/sources/genshin-optimizer；三份百分比图标来自Yatta，许可字段按该上游公开声明状态登记。

页角藤结来自Anonymous/Openclipart，CC0，来源https://openclipart.org/detail/12699/celtic-vine-corner-by-anonymous-12699及https://openclipart.org/share。署名见CREDITS.md，许可与分发记录见licenses/sources.json。

关闭、Line/Ribbon凯尔特图形、页角及收藏的具体已确认表现见[交互契约](../src/web/README.md#已确认交互契约)，通用颜色与字号见[视觉规范](../docs/interface.md#视觉与交互规范)。
