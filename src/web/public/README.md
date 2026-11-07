# 本地图片资源

图片直接按用途放在本目录下。当前共 2,045 张，9,863,870 B（约 9.41 MiB）；其中通用普攻 5 张供 131 个角色索引共用，排除 113 个非战斗被动。Vite 会原样复制到网页及桌面包；运行时不请求外部图片服务器。图标文件名使用稳定目录 ID，对应目录中的明确身份。

| 目录 | 内容与索引键 | 输出 |
| --- | --- | --- |
| `characters/` | 角色头像，角色 ID | 128×128 |
| `weapons/` | 武器，武器 ID | 128×128 |
| `artifacts/` | 圣遗物，`套装ID-部位` | 128×128 |
| `elements/` | 七元素，小写英文 ID | 128×128 |
| `skills/` | 主动技能及战斗被动天赋，`角色ID-combat1/2/3`、`角色ID-passive1/2/3/4` | 128×128 |
| `constellations/` | 六命座，`角色ID-c1` 至 `角色ID-c6` | 128×128 |
| `stats/` | 面板属性，`hp`、`attack`、`defense`、`elementalMastery`、`critRate`、`energyRecharge` 等 | 128×128 |
| `buffs/` | 游戏原生白色透明战斗增益/反应符号，使用固定资源键 | 128×128 |

通用普通攻击只保存 `skills/normal-skill_a_*.webp` 五种源图一次；角色的 `角色ID-combat1` 索引指向同一文件，各角色索引共用同一文件。下载缓存按来源 URL 加锁，同一地址只下载一次。

只下载战斗被动，生活、采集、烹饪、锻造、派遣及纯探索便利天赋不进入成品。范围由 `docs/constant/ui-icon-scope.json` 审核：默认保留前两战斗被动，额外的月兆、星耀、战斗夜魂等按白名单保留，混合天赋明确说明战斗部分；其余条目列入清单 `excluded`，不发起下载。

`combat1/2/3` 通常对应普攻、战技、爆发，具体以固定版 genshin-db 原条目为准。旅行者元素形态沿用源目录身份，不合并不同形态。增益目录保存原生振晶和反应符号，计算规则由引擎独立定义。

## 来源与追溯

- `game-icon-manifest.json`：逐图来源 URL、原图 SHA-256、输出 SHA-256、尺寸、字节、变换版本；`sourceCommits` 固定各来源版本；`missing` 明确列出未取得的图片，不拿其他身份图片填补。
- [Genshin Optimizer](https://github.com/frzyc/genshin-optimizer/tree/aa908fd1d3d9f64fcc11704c748915a109a8f3b8/libs/gi/assets/src)：装备局部图、技能、被动、命座原图及少量白色反应符号。精确文件名映射见仓库 `docs/constant/ui-icon-sources.json`。
- [GenshinWikiMap](https://github.com/CMHopeSunshine/GenshinWikiMap/tree/7fafe2e18011008d47e347f0f68216d05da0c1f1/resources/talent)：补充通用普通攻击图标。
- [genshin-db](https://github.com/theBowja/genshin-db/tree/8e5badd60b5d894284ccc927a56c9683529d2592/src/data)：角色、装备身份和技能/命座图片文件名。固定中文资料提供显示名称。
- [Mona 社区版](https://github.com/TwiceDrop/genshin_artifact/tree/589ac6919057709924c0c20d5a9d673fe9b0be1a)：头像、圣遗物和元素；部分旧图片保留已核对的 Enka、HoYoLAB 和 PathOfGenshin 来源，精确地址以逐图清单为准。
- [PathOfGenshin/resources](https://github.com/PathOfGenshin/resources/tree/015a2493b5672b28576ab78ffbcffde2ea0c9844/resources/gi/Sprite)：白色透明的原生振晶增益符号。29 张增益/反应符号的确切白名单和来源在 `docs/constant/ui-buff-sources.json`；新增前先抽看原图，排除照片式徽标、活动背景和装饰。

面板属性改用固定 Genshin Optimizer 的 SVG 矢量轮廓，白名单、原始路径哈希和镂空配方见 `docs/constant/ui-stat-sources.json`。MIT 许可与署名保留在 `licenses/sources/genshin-optimizer/LICENSE`。暴击率和暴击伤害采用两个独立轮廓；按当前界面确认的图形对应关系，暴击率使用源 `CritDmgIcon`，暴击伤害使用源 `CritRateIcon`。生成器保留真实源文件名及哈希，面板和增益索引统一使用语义键。

小攻击、小防御、小生命使用 `flatAttack`、`flatDefense`、`flatHp` 本地派生图标：小攻击只挖空剑身内部，剑柄与护手保持实心；小防御仅留盾牌外围，不保留中间分界线；小生命仅留水滴外围，不保留水面与高光。百分比与实数的语义由索引键和文字区分，不凭图标修改计算数据。`buffs` 的 `flat-attack`、`flat-defense`、`flat-hp`、`crit-damage` 等键直接复用这些 SVG，不再复制图片。

属性 SVG 的 intrinsic size 为 128×128，viewBox 为 24×24；原始路径保留在 `docs/constant/stat-vectors/`，通过 CSS mask 使用语义文字色，缩放不会因放大低分辨率 PNG 而模糊。

固定参考尚缺米提亚、瓦列里及空月人偶的部分技能/命座图，共 26 项，详见清单 `missing`。补源核对结果见 `docs/references/icon-source-audit.md`。

## 处理方法

使用 Python + Pillow，RGBA、Lanczos 等比缩放、WebP `method=6, exact=True`，保留透明通道，星级背景由界面绘制。位图品质：头像 76，武器/圣遗物/技能/命座/增益 88，元素 90；属性符号直接使用压缩后的 SVG 路径。原图留在被忽略的 `.references/game-icon-downloads/`，不打包。

- 非法器优先使用游戏原生 `UI_EquipIcon_*` 装备局部图，突出护手和装饰。找不到原生图时，才从已验证的 `UI_Gacha_EquipIcon_*` 全图裁取顶部装饰区域：去透明边后取最长边 64% 的正方形，顶部、右侧对齐；清单 `framing=full-art-detail-crop` 标明回退。
- 法器继续使用完整立绘。武器去透明边、等比适配并居中补透明画布，统一 128×128。每图处理版本写在 `transform`，原生构图记为 `framing=native`。
- 圣遗物不裁主体，等比放入 128×128 透明画布，补齐空白。
- 角色沿用已审核头像裁法，空月人偶使用透明头像。
- 技能、命座和增益位图居中等比放入 128×128 透明画布，不因长宽不同拉伸；保留源图颜色，不额外染色。增益位图允许等比放大以统一视觉占位；清单保留原始尺寸，少数原生状态符号为 24–32px。
- 下载结果核对图像、透明通道及占位图指纹。单图上限 32 KiB，整库上限 16 MiB；新增储备资源不放宽 JS 入口预算。

## 更新与接入

在仓库根目录运行：

```powershell
python tools/scripts/capture-stat-vectors.py --offline
python tools/scripts/sync-game-icons.py
pnpm assets:check
```

`capture-stat-vectors.py` 按固定 URL 和 SHA-256 从 `.references/stat-vector-sources/` 提取原始路径并生成镂空变体；没有缓存时去掉 `--offline` 下载固定源文件。修改派生比例或轮廓后重新运行该脚本，不手改成品 SVG。

同步脚本要求已有固定版本的 `.references/mona-current/` 与 `.references/genshin-db/`，新增下载需要网络。复用有哈希验证的输出和原图缓存。要更新版本，先核对参考提交与图标文件名，再修改固定提交；用 `python tools/scripts/capture-ui-icon-sources.py` 从固定提交重新捕获文件名映射到 `docs/constant/ui-icon-sources.json`（已有捕获可加 `--from-cache` 离线核验）；重新生成并检查 `missing`、输出哈希、压缩大小及代表图的实际显示。通过生成器同步成品与清单。

应用索引由脚本生成到 `src/web/src/assets/`：`game-icon-index.json` 对应角色、武器、圣遗物、元素和面板属性五类日常图片；`game-detail-icon-index.json` 对应技能、命座、增益，仅使用这些类型时加载。通过 `GameIcon` 的 `kind` 和 `id` 使用，组件统一处理网页根路径、子路径和桌面相对路径。素材覆盖与引擎机制覆盖分别记录。

原神图像素材 © miHoYo / HoYoverse，其他权利归各自所有者。软件、数据和素材的许可与署名统一见根目录 THIRD_PARTY_NOTICES.md、CREDITS.md 和 licenses/。
