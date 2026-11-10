# 基础旅行者与奇偶文本补齐

本轮补齐四份基础角色定义，并新增奇偶男女各七种元素定义。共154份正式定义均通过完整文本检查；这不扩大伤害机制支持。

| 定义 | 采用的实际内容 |
| --- | --- |
| 空、荧基础形态 | 普通攻击「故去的追忆」及独立男女等级参数；技能库501/701没有战技、爆发、固有天赋或命座 |
| 男女奇偶基础形态 | 普通攻击「外域剑术·安谨守望」及三个固有天赋；基础技能库没有战技/爆发 |
| 男女奇偶七元素形态 | 同一普通攻击、战技「戒惩轰击」、对应元素的爆发「禁入限区」、三个固有天赋；没有命座 |

文本直接进入CharacterDefinition的talents/passives，数值进入parameters，模板由共享界面读取同一参数。基础形态限制用capabilities.notes直接展示；不把其他元素的技能填进未元素化形态，也不把空命座当作缺失六个命座。

配置和数值采用[固定技能库](https://github.com/Rafs-kk/LunaGC-6.6-res/blob/b0501c5d89767ead5f647869a2412521447f7682/ExcelBinOutput/AvatarSkillDepotExcelConfigData.json)、同提交AvatarSkill及已采用ProudSkill原表。中文文本补充采用[Dimbreath原始文本](https://gitlab.com/Dimbreath/AnimeGameData/-/tree/433284d22ef1a704e9d49ae22fb96cf7a245828e/TextMap)中的TextMapCHS与TextMap_MediumCHS。每个采用字段按配置的原始文本哈希匹配；技能文本哈希在两个固定源的AvatarSkill中一致。游戏版本不由采集日期推断。

[最小采用摘录](../../tools/data/sources/character-text/base-and-manekin.json)保存18份绑定、原始技能库/技能行及引用的411条文本，记录原始来源版本与文件路径。该文件明确是无损行/键摘录，不冒充完整原始文件。完整下载仅在忽略的.references/metadata/text-completion保留，普通构建不读取它。

显示时移除受控颜色/斜体标记，把源换行转为实际换行；斜体风味说明单独保留。候选由`pnpm data:prepare-characters --out artifacts/content-candidates/新目录`生成；采用后`pnpm data:build`离线装配，`pnpm data:audit`按原始ProudSkill等级数组独立比较新增参数。已核验的其他角色规则不从中文文本推导。
