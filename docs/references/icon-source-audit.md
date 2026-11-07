# 图标补源核对（2026-11-07）

## 属性图标

新增来源为 [Genshin Optimizer 的矢量属性库](https://github.com/frzyc/genshin-optimizer/tree/aa908fd1d3d9f64fcc11704c748915a109a8f3b8/libs/gi/svgicons/src/icons/Stats)，固定提交 `aa908fd1d3d9f64fcc11704c748915a109a8f3b8`。只提取静态 SVG path，不引入 React/MUI 或执行 JSX。路径代码的 MIT 许可和署名随图片放在 `public/licenses/sources/genshin-optimizer/LICENSE`。

独立的 `CritDmgIcon` 替代此前共用暴击图标的做法。属性图均使用原始矢量轮廓，128×128 intrinsic size、24×24 viewBox；显示时继续通过 CSS mask 跟随语义文字色。

小攻击、小防御、小生命为本地派生的 `flatAttack`、`flatDefense`、`flatHp`，不是新增官方图标。按用户细化：小攻击使用原剑形轮廓减去剑身内部多边形，剑柄和护手完全保留；小防御仅对源盾牌最外层轮廓描边，去掉中线和填充；小生命从源路径中保留水滴外框及其内侧轮廓，删除水面和高光。配方和原始/派生哈希在 `docs/constant/ui-stat-sources.json`。

## 缺失命座与技能

当前 26 项包括米提亚、瓦列里的 12 个命座和 10 个战斗技能/被动，以及空月人偶两个版本的 4 个被动。技能/命座身份来自固定 genshin-db；没有据相似图片推断身份。

本次核对：

| 入口 | 结果 |
| --- | --- |
| Genshin Optimizer | 最新提交仍为 `aa908fd…`，现有固定图片文件名索引没有上述缺图；矢量属性资源可用 |
| GenshinWikiMap | 最新提交仍为 `7fafe2e…`，没有可用于补齐这些条目的新提交 |
| Enka API-docs | 最新提交仍为 `b94bc40…`；它是资料与身份映射入口，不代表能从其取得全部最新图片 |
| PathOfGenshin/resources | 最新提交仍为 `015a249…`，现有 Sprite 索引没有 Mitya、Valeriy、LittleIdol 对应条目 |
| Escartem/GenshinTextures | 固定当前提交 `2cef7ef…` 的根目录仅剩 README，原 Texture2D 路径不可用；未从该库取得图片 |
| HomDGCat、Hakush.in | 定点请求同名命座图时本机发生 TLS 连接失败；这不是“不存在图片”的证据，目前未取得和核对原图 |

因此本次继续保留 26 项 `missing`。后续获得可访问来源时，必须先比对固定身份与文件名、抽看实际图形、记录 URL 和原图哈希，再更新索引；不能把下载成功的占位图或其他人物的图形当作补齐。
