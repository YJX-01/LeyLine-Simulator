# 工作台视觉素材来源与压缩记录

核对：2026-11-06。用途为用户要求并认可的原神风格本地非商业工作台；图片不参与角色定义或伤害计算，不表示账号拥有这些圣遗物。本轮不发布素材库、不接入运行时 CDN、不声称官方合作或商业授权。

## 查找与选用

查阅了 [PathOfGenshin/resources](https://github.com/PathOfGenshin/resources)、[EnkaNetwork 文档](https://github.com/EnkaNetwork/API-docs)及本地固定版本的莫娜社区分叉。PathOfGenshin 的 [README](https://raw.githubusercontent.com/PathOfGenshin/resources/main/README.md) 明确区分游戏图像与代码：图像版权保留给 miHoYo/HoYoverse，非图像代码为 GPL-3.0。它不是把游戏图像转为 GPL 的授权入口，本轮没有复制其代码或下载整库。

Enka 文档主要说明角色展示数据获取及调用约束，不能代替图像权利人的授权，也不因此把账号接口接入本项目。本轮不请求任何用户 UID。为避免漂移和额外依赖，实际选中图片来自已经下载的莫娜参考 checkout，核对 HEAD 为 `beaced4d82619aa86920d0054ab6114b5fc5608f`，与 `sources.json` 一致；没有执行参考库脚本。

固定来源：[1803233552/genshin_artifact](https://github.com/1803233552/genshin_artifact/tree/beaced4d82619aa86920d0054ab6114b5fc5608f/src/images)。原始 PNG 保留在被忽略的 `.references/mona-community/src/images/`，只将选中的压缩派生物置于 `src/web/src/assets/genshin/`。每张图片的精确原始 URL、源 SHA-256、派生物 SHA-256 和编码信息见同目录 `manifest.json`。

## 图片与预算

| 输出 | 原图 | 原尺寸 | 原字节 | 输出尺寸 | 输出字节 |
| --- | --- | --- | ---: | --- | ---: |
| `artifact-flower.webp` | `artifacts/GladiatorsFinale_flower.png` | 256×256 | 12909 | 96×96 | 3656 |
| `artifact-plume.webp` | `artifacts/GladiatorsFinale_feather.png` | 256×256 | 9666 | 96×96 | 2976 |
| `artifact-sands.webp` | `artifacts/GladiatorsFinale_sand.png` | 256×256 | 13045 | 96×96 | 3850 |
| `artifact-goblet.webp` | `artifacts/GladiatorsFinale_goblet.png` | 256×256 | 12258 | 96×96 | 3594 |
| `artifact-circlet.webp` | `artifacts/GladiatorsFinale_head.png` | 256×256 | 11605 | 96×96 | 3646 |
| `element-anemo.webp` | `misc/anemo.png` | 393×393 | 4478 | 64×64 | 2836 |
| `element-geo.webp` | `misc/geo.png` | 393×393 | 3847 | 64×64 | 2760 |

七张共 **23,318 B（22.77 KiB）**，源 PNG 共 67,808 B，缩减 **65.61%**。使用当前已安装的 Pillow，RGBA、Lanczos 缩放、WebP quality 72 / method 6 / exact，保留透明通道。输出逐一重新解码检查尺寸及透明像素；人工查看原图和代表性压缩图。预算为每张不超过 5 KiB、图片合计不超过 40 KiB；没有增加依赖或将原图打入应用。

图片限于已发布的角斗士套装和风/岩元素标记，无角色头像、未发布内容、语音、音乐或第三方粉丝插画。五件圣遗物仅用在库存/装备槽的版式示意，元素标记仅作视觉装饰，不为合成角色暗示真实元素机制。

## 权利与署名边界

游戏原画与图标版权归 miHoYo / HoYoverse 及相关权利人。来源仓库的 MIT 代码许可不作为游戏图像再分发或商业使用许可；缩放与压缩也不会改变原图版权。

检索入口包括官方 [原神 Legal FAQ](https://www.hoyolab.com/article/143107)，该英文页本次仅返回动态加载壳；因此另读取官方 [法语 FAQ 第2项](https://www.hoyolab.com/article/142895)，其说明非商业个人二创的适用边界、权利保留、署名及未发布内容限制。该条目注明其地域适用范围，不据此推定全球通用许可。另核对 [HoYoverse 帮助中心](https://support.hoyoverse.com/hc/en-us/articles/51005649400729-What-are-the-guidelines-for-creating-and-selling-fan-made-content) 指向的最新同人指引入口；本轮没有取得额外书面授权，也没有把“公开可下载”认定为无限制授权。

界面应保留“原神图像素材 © miHoYo / HoYoverse；其他权利归各自所有者。本工具非官方作品”的说明，且将图片标为演示用途。本轮原始素材和游戏规则数据不构成整库重发布；将来若改变发布范围或商业用途，应针对届时实际用途核对权利条件。凯尔特结纹等自制 SVG/CSS 装饰应与这些游戏图像分开标记来源，不能标成官方原神资源。


## U1 账号页面图片库与美化增量

2026-11-06 接入真实目录身份对应的缩略图：**124 个角色头像、253 张武器图、299 张圣遗物部位图、7 个元素图标，共 683 张**。圣遗物的单件祈愿套装只有头冠，不制造不存在的其他部位。图标以目录 ID / 套装 ID + 部位映射，不按模糊中文名称猜测；备注角色可按目录中的精确名称展示头像。原文件的 `HeavensGift` 身份待核对条目继续使用通用占位。

目录与维护方式：

- 应用图标：`src/web/public/game-icons/*.webp`。由 Vite 随应用复制，网页根路径、子路径与 Electron 相对路径共用；运行时不访问第三方 CDN。
- 来源清单：同目录 `manifest.json`，逐张记录 URL、原图/压缩图 SHA-256、尺寸和字节数；`src/web/src/assets/game-icon-index.json` 是按需加载的轻量索引。
- 原图缓存：`.references/game-icon-downloads/`；原有莫娜图片继续保留在 `.references/mona-community/src/images/`。不将原始大图打包进应用。
- 制备脚本：在仓库根目录运行 `python tools/scripts/sync-game-icons.py`，使用 Pillow；需已有固定版本 Mona 与 genshin-db 参考目录。已有输出通过哈希核对后复用，不重复下载。
- 完整性与体积核查：`pnpm assets:check` 同时验证原七张装饰资源和新图标库。

来源优先复用原固定莫娜分叉。补图时原官方海外图片服务器连接超时，先采用 [PathOfGenshin/resources 固定版本](https://github.com/PathOfGenshin/resources/tree/015a2493b5672b28576ab78ffbcffde2ea0c9844/resources/gi/Sprite) 中与 genshin-db 图标文件名相同的资源，再从固定 genshin-db 记录对应的官方国内图片服务器 `upload-bbs.mihoyo.com` 补齐较新内容。准确的实际取得地址以每张清单为准；镜像只取图片，没有复制其程序代码。游戏美术权属说明沿用上文。

全部保留透明通道，以 Lanczos 等比缩小，WebP quality 76 / method 6。角色上限 128px、武器 112px、圣遗物 96px、元素 40px。原图合计 **20,305,079 B**，压缩后 **2,218,044 B（2.12 MiB）**，缩减 **89.08%**；最大单图 9,862 B。新目录图标库独立限制单图 16 KiB、合计 4 MiB；原七张装饰资源的 5 KiB/40 KiB 限制和原 JavaScript 构建预算不变。图片延迟解码、按可见区域加载，不把整库内联进脚本。

固定参考尚无图像地址的五个目录条目：角色 `mitya`、`valeriy`；武器 `prizedisshinblade-01`、`prizedisshinblade-02`、`prizedisshinblade`。清单明确保留缺口，界面显示文字占位，不借用其他身份图片。

接入位置：账号角色列表/详情、实际五部位装备、库存/详情/换装对照、角色/武器/套装图文选择器、队伍卡片/账号选人、时间轴队员与轨道标签。保留浅色三分区，采用浅绿角色列表、暖白装备卡、五星金色细节、明显的选中态和次要操作层级，避免加入大面积无关背景。


### 新社区版补正

用户指出旧参考遗漏后，已按 [莫娜当前社区版](mona-community.md) 重新核对，固定 `TwiceDrop/genshin_artifact` 7.2.02。米提亚、瓦列里原图分别来自该版本 `public/characters/mitya-avatar.png`、`valeriy-avatar.png`，压缩后接入同一离线索引。现为 **685 张 / 2,232,664 B（2.13 MiB）**，缩减 89.11%，上轮五项缺图记录缩减为三个任务武器变体。`HeavensGift` 已有新社区版的中文身份依据，更新识别为天之美赐后使用对应图片；尚未确认修复的旧库存仍保留占位，避免静默改变账号。


### 有效图片与统一头像修复

此前 685 张的统计包含服务器 HTTP 200 占位图，不能作为有效图片覆盖证明。详见 [头像与子仓库纠正](mona-community.md#头像占位图与参考子仓库纠正)。本轮实际替换 242 张占位图，并补齐奇偶男女及三个任务武器变体；现 **688 张全部有有效位图**，压缩后 **2,886,116 B（2.75 MiB）**，原图合计 25,408,288 B，缩减 **88.64%**。保留原 16 KiB 单图 / 4 MiB 图标库预算及脚本体积预算。

头像全部统一 128×128 方形人像，再以同宽高容器展示，避免不同比例拉伸；图像索引追加内容版本以刷新旧占位缓存。生成时拒绝已知占位图和 alpha 最大值小于 128 的图片，现有缓存也重新验证；素材检查核对真实头像尺寸、变换版本、透明度、源占位哈希和缓存版本。原图、压缩图的逐张来源与哈希仍保存在 manifest，不把“可解码”作为正确内容的唯一证据。

## 武器完整立绘与旧资源清理（2026-11-06）

删除 `src/web/src/assets/genshin/` 的七张旧图及旧清单；当前设置页和兼容页面均复用 `public/game-icons/`，不再维护重复素材。`assets/` 仅保留仍在使用的索引和原创装饰。

武器旧 `UI_EquipIcon` / `_tn` 源图本身可能已裁掉剑柄或剑尖，CSS 等比显示无法修复。同步脚本改取 Enka 托管的 `UI_Gacha_EquipIcon` 完整立绘（名称来自固定 genshin-db 图像目录），去除透明留白后等比缩小，保留非正方形比例；WebP 压缩和来源哈希仍记录在公共清单中，转换标记为 `full-weapon-art-v1`。角色头像继续使用统一 128×128 方案。资源检查拒绝旧武器转换标记，避免再次复用裁切缩略图。

### 武器清晰度与统一画布（2026-11-06）

按用户反馈将全部武器升级为 256×256 透明画布、WebP 质量 88。完整立绘先等比缩放，再居中补透明留白，非法器与法器输出尺寸一致，保留完整外形；角色头像不变。选择器武器显示由 64 增至 96 像素。转换标记 `full-weapon-square-hq-v2`，单图预算 32 KiB、整库预算 6 MiB，继续按需本地加载。类型检查和浏览器显示抽查通过，截图 `artifacts/weapon-hq-picker-review.png`。

七元素图标同步提升至 128×128、WebP 质量 90，转换标记 `element-hq-v2`。人偶（男/女）的百科来源含不透明色底，改用 Enka 托管的原始 `UI_AvatarIcon_MannequinBoy/Girl` 透明头像，保持 128×128 头像比例，单独标记 `square-transparent-v2`。两张输出角落 alpha 为 0，经视觉核对；不通过抠色损失头发边缘。最终素材库 688 张、4821474 字节，无缺图。
