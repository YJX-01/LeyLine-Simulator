# 当前视觉资源与分发

维护位置统一为assets/game、assets/ui和assets/sources；[资源清单](../../assets/manifest.json)登记ID、文件、别名、来源地址/版本、尺寸和转换方式。生成索引及分发副本不手工编辑。

## 图标覆盖

当前有2076个本地图标，9984378字节。154份正式角色定义对应1424个头像、技能、实际命座引用，全部解析。普通攻击按已有共享图标复用；旅行者的男女元素形态映射到对应元素图标；奇偶男女元素形态复用已核对的头像与技能。没有命座的定义不请求不存在的命座图片。

本轮从Enka公开图片服务补齐26张原图，文件名与既有角色/技能配置匹配，包括米提亚、瓦列里的技能和命座，以及奇偶的技能和被动。[补充配置](../../assets/sources/supplements.json)只记录必要身份、地址与别名。游戏图像运行时全部从本地分发，不请求第三方CDN。

## 构建与检查

`pnpm data:build`离线生成src/web/generated中的两个索引，并复制图片到.cache/public/assets。缓存revision按当前文件内容自动计算；永久清单不存sha256、sourceSha256或vectorSha256。

`pnpm assets:check`检查当前定义的引用覆盖、实际文件、矢量原件一致性、格式、尺寸声明、别名、缓存版本和预算。浏览器asset-coverage检查实际解码、128px画布与可见像素，并检查受影响角色培养预览中的实际图标。

画布统一128×128。武器保留已认可的细节构图，法器保留完整轮廓；透明技能/命座居中等比缩放，属性与部位图为单色矢量。单图预算32KiB、整库16MiB。实际显示尺寸和语义颜色以[视觉规范](../design/visual-language.md)为准。

`python tools/scripts/assets/sync-game-icons.py --out artifacts/content-candidates/新目录`只制备新候选，不覆盖正式资源。失败清单只留候选目录；正式覆盖以当前定义和生成索引重新计算。原始下载缓存位于忽略的.references。

## 权属与装饰

游戏原画及图标版权归miHoYo / HoYoverse及相关权利人；来源项目的代码许可与美术权属分别登记。界面的开源许可和鸣谢保留既有说明。属性/部位矢量来自Genshin Optimizer的MIT资源，许可原文在licenses/sources/genshin-optimizer；本轮没有复制其运行代码。

用户认可的页角藤结来自Anonymous / Openclipart，CC0，声明见CREDITS.md及licenses/sources.json。应用装饰在assets/ui，与游戏图标分别维护；字号、颜色、按钮和布局仍沿用现行视觉规范。早期尺寸和缺图统计已归档，不作为当前标准。
