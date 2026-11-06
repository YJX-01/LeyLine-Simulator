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
