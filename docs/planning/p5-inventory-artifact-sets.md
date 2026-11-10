# P5圣遗物套装覆盖基线

2026-11-11，按正式manifest顺序核对63个实体；内容版本`genshin-db-8e5badd-content-v2`。这是全目录静态盘点，不是机制实现或验收完成清单。范围、公共依赖及后续批次见[盘点说明](p5-catalog-audit.md)。

星级集合直接读取[固定套装来源](../../tools/data/sources/catalog/genshin-db/sets.json)的rarityList；集合存在不代表非五星实物已可录入或计算。

现有支持列直接读取正式JSON的supported标记及参数绑定，不代表本轮重新核验。所有实体的P5逐规则语义审查、独立计算及真实资料验证状态均为待完成；原有局部支持证据仍按支持说明记录。

文本线索仅扫描正式JSON中的字符串；仅供定位阅读，不证明机制存在、适用条件或实现能力。关键词及误差边界见盘点说明。参考入口来自固定GenshinTools提交中的实际注册声明，仅忽略ID中的下划线、连字符和空格作检索；不是经过语义核验的别名映射。待映射不表示社区一定没有实现。入口相对`.references/GenshinTools/src/domain/combat/damage/impl/`。

| 实体 | 合法星级集合（来源） | 件数效果的现有支持标记 | 修饰条数（按件数） | 文本线索 | 参考注册入口 |
| --- | --- | --- | --- | --- | --- |
| [风起之日](../../src/game-data/data/artifact-sets/adaycarvedfromrisingwinds.json) `adaycarvedfromrisingwinds` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、触发 | `artifact4pc.ts:1098` (`a_day_carved_from_rising_winds`) |
| [冒险家](../../src/game-data/data/artifact-sets/adventurer.json) `adventurer` | 1,2,3 | 2件:false、4件:false | 2件:0、4件:0 | 状态 | 待映射 |
| [悠古的磐岩](../../src/game-data/data/artifact-sets/archaicpetra.json) `archaicpetra` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 触发、反应 | `artifact4pc.ts:258` (`archaic_petra`) |
| [晨星与月的晓歌](../../src/game-data/data/artifact-sets/aubadeofmorningstarandmoon.json) `aubadeofmorningstarandmoon` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态 | `artifact4pc.ts:1235` (`aubade_of_morningstar_and_moon`) |
| [战狂](../../src/game-data/data/artifact-sets/berserker.json) `berserker` | 3,4 | 2件:true、4件:false | 2件:1、4件:0 | 状态 | `artifact4pc.ts:1273` (`berserker`) |
| [冰风迷途的勇士](../../src/game-data/data/artifact-sets/blizzardstrayer.json) `blizzardstrayer` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 反应 | `artifact4pc.ts:39` (`blizzard_strayer`) |
| [染血的骑士道](../../src/game-data/data/artifact-sets/bloodstainedchivalry.json) `bloodstainedchivalry` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 触发 | `artifact4pc.ts:547` (`bloodstained_chivalry`) |
| [勇士之心](../../src/game-data/data/artifact-sets/braveheart.json) `braveheart` | 3,4 | 2件:true、4件:false | 2件:1、4件:0 | 状态 | `artifact4pc.ts:1304` (`brave_heart`) |
| [天之美赐](../../src/game-data/data/artifact-sets/celestialgift.json) `celestialgift` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、层数、触发 | `artifact4pc.ts:1456` (`celestial_gift`) |
| [炽烈的炎之魔女](../../src/game-data/data/artifact-sets/crimsonwitchofflames.json) `crimsonwitchofflames` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 层数、触发、反应 | `artifact4pc.ts:312` (`crimson_witch_of_flames`) |
| [深林的记忆](../../src/game-data/data/artifact-sets/deepwoodmemories.json) `deepwoodmemories` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、触发 | `artifact4pc.ts:706` (`deepwood_memories`) |
| [守护之心](../../src/game-data/data/artifact-sets/defenderswill.json) `defenderswill` | 3,4 | 2件:true、4件:false | 2件:1、4件:0 | 待逐条阅读 | `artifact4pc.ts:1327` (`defenders_will`) |
| [沙上楼阁史话](../../src/game-data/data/artifact-sets/desertpavilionchronicle.json) `desertpavilionchronicle` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 触发 | `artifact4pc.ts:811` (`desert_pavilion_chronicle`) |
| [影中沉凝的幻灭](../../src/game-data/data/artifact-sets/disenchantmentindeepshadow.json) `disenchantmentindeepshadow` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 反应 | `artifact4pc.ts:1398` (`disenchantment_in_deep_shadow`) |
| [来歆余响](../../src/game-data/data/artifact-sets/echoesofanoffering.json) `echoesofanoffering` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 触发、概率 | `artifact4pc.ts:686` (`echoes_of_an_offering`) |
| [绝缘之旗印](../../src/game-data/data/artifact-sets/emblemofseveredfate.json) `emblemofseveredfate` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 转化 | `artifact4pc.ts:468` (`emblem_of_severed_fate`) |
| [深廊终曲](../../src/game-data/data/artifact-sets/finaleofthedeepgalleries.json) `finaleofthedeepgalleries` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、触发 | `artifact4pc.ts:62` (`finale_of_the_deep_galleries`) |
| [乐园遗落之花](../../src/game-data/data/artifact-sets/flowerofparadiselost.json) `flowerofparadiselost` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、层数、触发、反应 | `artifact4pc.ts:777` (`flower_of_paradise_lost`) |
| [谐律异想断章](../../src/game-data/data/artifact-sets/fragmentofharmonicwhimsy.json) `fragmentofharmonicwhimsy` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、层数 | `artifact4pc.ts:924` (`fragment_of_harmonic_whimsy`) |
| [赌徒](../../src/game-data/data/artifact-sets/gambler.json) `gambler` | 3,4 | 2件:false、4件:false | 2件:0、4件:0 | 触发、概率 | `artifact4pc.ts:1338` (`gambler`) |
| [饰金之梦](../../src/game-data/data/artifact-sets/gildeddreams.json) `gildeddreams` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、触发 | `artifact4pc.ts:726` (`gilded_dreams`) |
| [角斗士的终幕礼](../../src/game-data/data/artifact-sets/gladiatorsfinale.json) `gladiatorsfinale` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 待逐条阅读 | `artifact4pc.ts:487` (`gladiators_finale`) |
| [黄金剧团](../../src/game-data/data/artifact-sets/goldentroupe.json) `goldentroupe` | 4,5 | 2件:false、4件:false | 2件:0、4件:0 | 状态 | `artifact4pc.ts:875` (`golden_troupe`) |
| [沉沦之心](../../src/game-data/data/artifact-sets/heartofdepth.json) `heartofdepth` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 触发 | `artifact4pc.ts:581` (`heart_of_depth`) |
| [炉火融炼之心](../../src/game-data/data/artifact-sets/heartofthefurnace.json) `heartofthefurnace` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、层数、触发 | `artifact4pc.ts:1562` (`heart_of_the_furnace`) |
| [华馆梦醒形骸记](../../src/game-data/data/artifact-sets/huskofopulentdreams.json) `huskofopulentdreams` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、层数、触发 | `artifact4pc.ts:143` (`husk_of_opulent_dreams`) |
| [教官](../../src/game-data/data/artifact-sets/instructor.json) `instructor` | 3,4 | 2件:true、4件:false | 2件:1、4件:0 | 触发 | `artifact4pc.ts:400` (`instructor`) |
| [渡过烈火的贤人](../../src/game-data/data/artifact-sets/lavawalker.json) `lavawalker` | 4,5 | 2件:false、4件:false | 2件:0、4件:0 | 待逐条阅读 | `artifact4pc.ts:358` (`lavawalker`) |
| [长夜之誓](../../src/game-data/data/artifact-sets/longnightsoath.json) `longnightsoath` | 4,5 | 2件:false、4件:false | 2件:0、4件:0 | 层数、触发 | `artifact4pc.ts:1078` (`long_nights_oath`) |
| [幸运儿](../../src/game-data/data/artifact-sets/luckydog.json) `luckydog` | 1,2,3 | 2件:false、4件:false | 2件:0、4件:0 | 状态、触发 | 待映射 |
| [被怜爱的少女](../../src/game-data/data/artifact-sets/maidenbeloved.json) `maidenbeloved` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 治疗、触发 | `artifact4pc.ts:538` (`maiden_beloved`) |
| [逐影猎人](../../src/game-data/data/artifact-sets/marechausseehunter.json) `marechausseehunter` | 4,5 | 2件:false、4件:false | 2件:0、4件:0 | 状态、层数 | `artifact4pc.ts:860` (`marechaussee_hunter`) |
| [武人](../../src/game-data/data/artifact-sets/martialartist.json) `martialartist` | 3,4 | 2件:false、4件:false | 2件:0、4件:0 | 触发 | `artifact4pc.ts:1348` (`martial_artist`) |
| [穹境示现之夜](../../src/game-data/data/artifact-sets/nightoftheskysunveiling.json) `nightoftheskysunveiling` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、层数、触发 | `artifact4pc.ts:1182` (`night_of_the_skys_unveiling`) |
| [回声之林夜话](../../src/game-data/data/artifact-sets/nighttimewhispersintheechoingwoods.json) `nighttimewhispersintheechoingwoods` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 护盾、触发、反应 | `artifact4pc.ts:965` (`nighttime_whispers_in_the_echoing_woods`) |
| [昔日宗室之仪](../../src/game-data/data/artifact-sets/noblesseoblige.json) `noblesseoblige` | 4,5 | 2件:false、4件:false | 2件:0、4件:0 | 层数、触发 | `artifact4pc.ts:380` (`noblesse_oblige`) |
| [水仙之梦](../../src/game-data/data/artifact-sets/nymphsdream.json) `nymphsdream` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 触发 | `artifact4pc.ts:842` (`nymphs_dream`) |
| [黑曜秘典](../../src/game-data/data/artifact-sets/obsidiancodex.json) `obsidiancodex` | 4,5 | 2件:false、4件:false | 2件:0、4件:0 | 状态、触发 | `artifact4pc.ts:993` (`obsidian_codex`) |
| [海染砗磲](../../src/game-data/data/artifact-sets/oceanhuedclam.json) `oceanhuedclam` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 治疗、状态、触发、反应、累计 | `artifact4pc.ts:620` (`oceanhued_clam`) |
| [苍白之火](../../src/game-data/data/artifact-sets/paleflame.json) `paleflame` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 层数、触发 | `artifact4pc.ts:562` (`pale_flame`) |
| [祭水之人](../../src/game-data/data/artifact-sets/prayersfordestiny.json) `prayersfordestiny` | 3,4 | 1件:false | 1件:0 | 待逐条阅读 | 待映射 |
| [祭火之人](../../src/game-data/data/artifact-sets/prayersforillumination.json) `prayersforillumination` | 3,4 | 1件:false | 1件:0 | 待逐条阅读 | 待映射 |
| [祭雷之人](../../src/game-data/data/artifact-sets/prayersforwisdom.json) `prayersforwisdom` | 3,4 | 1件:false | 1件:0 | 待逐条阅读 | 待映射 |
| [祭冰之人](../../src/game-data/data/artifact-sets/prayerstospringtime.json) `prayerstospringtime` | 3,4 | 1件:false | 1件:0 | 待逐条阅读 | 待映射 |
| [行者之心](../../src/game-data/data/artifact-sets/resolutionofsojourner.json) `resolutionofsojourner` | 3,4 | 2件:true、4件:false | 2件:1、4件:0 | 待逐条阅读 | `artifact4pc.ts:1363` (`resolution_of_sojourner`) |
| [逆飞的流星](../../src/game-data/data/artifact-sets/retracingbolide.json) `retracingbolide` | 4,5 | 2件:false、4件:false | 2件:0、4件:0 | 护盾 | `artifact4pc.ts:596` (`retracing_bolide`) |
| [血红之证](../../src/game-data/data/artifact-sets/scarletproof.json) `scarletproof` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 触发、反应 | `artifact4pc.ts:1685` (`scarlet_proof`) |
| [学士](../../src/game-data/data/artifact-sets/scholar.json) `scholar` | 3,4 | 2件:true、4件:false | 2件:1、4件:0 | 触发 | `artifact4pc.ts:1378` (`scholar`) |
| [烬城勇者绘卷](../../src/game-data/data/artifact-sets/scrolloftheheroofcindercity.json) `scrolloftheheroofcindercity` | 4,5 | 2件:false、4件:false | 2件:0、4件:0 | 状态、层数、触发 | `artifact4pc.ts:1015` (`scroll_of_the_hero_of_cinder_city`) |
| [追忆之注连](../../src/game-data/data/artifact-sets/shimenawasreminiscence.json) `shimenawasreminiscence` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 触发 | `artifact4pc.ts:629` (`shimenawas_reminiscence`) |
| [纺月的夜歌](../../src/game-data/data/artifact-sets/silkenmoonsserenade.json) `silkenmoonsserenade` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、层数、触发 | `artifact4pc.ts:1131` (`silken_moons_serenade`) |
| [昔时之歌](../../src/game-data/data/artifact-sets/songofdayspast.json) `songofdayspast` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 治疗、状态、转化、触发、累计 | `artifact4pc.ts:895` (`song_of_days_past`) |
| [千岩牢固](../../src/game-data/data/artifact-sets/tenacityofthemillelith.json) `tenacityofthemillelith` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 护盾、状态、触发 | `artifact4pc.ts:78` (`tenacity_of_the_millelith`) |
| [流放者](../../src/game-data/data/artifact-sets/theexile.json) `theexile` | 3,4 | 2件:true、4件:false | 2件:1、4件:0 | 层数、触发 | `artifact4pc.ts:1388` (`the_exile`) |
| [如雷的盛怒](../../src/game-data/data/artifact-sets/thunderingfury.json) `thunderingfury` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 触发、反应 | `artifact4pc.ts:169` (`thundering_fury`) |
| [平息鸣雷的尊者](../../src/game-data/data/artifact-sets/thundersoother.json) `thundersoother` | 4,5 | 2件:false、4件:false | 2件:0、4件:0 | 待逐条阅读 | `artifact4pc.ts:213` (`thundersoother`) |
| [奇迹](../../src/game-data/data/artifact-sets/tinymiracle.json) `tinymiracle` | 3,4 | 2件:false、4件:false | 2件:0、4件:0 | 触发 | 待映射 |
| [游医](../../src/game-data/data/artifact-sets/travelingdoctor.json) `travelingdoctor` | 1,2,3 | 2件:true、4件:false | 2件:1、4件:0 | 治疗、状态、触发 | 待映射 |
| [未竟的遐思](../../src/game-data/data/artifact-sets/unfinishedreverie.json) `unfinishedreverie` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、触发、反应 | `artifact4pc.ts:944` (`unfinished_reverie`) |
| [辰砂往生录](../../src/game-data/data/artifact-sets/vermillionhereafter.json) `vermillionhereafter` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、触发 | `artifact4pc.ts:658` (`vermillion_hereafter`) |
| [翠绿之影](../../src/game-data/data/artifact-sets/viridescentvenerer.json) `viridescentvenerer` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 层数、触发、反应 | `artifact4pc.ts:422` (`viridescent_venerer`) |
| [花海甘露之光](../../src/game-data/data/artifact-sets/vourukashasglow.json) `vourukashasglow` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 状态、层数、触发 | `artifact4pc.ts:111` (`vourukashas_glow`) |
| [流浪大地的乐团](../../src/game-data/data/artifact-sets/wandererstroupe.json) `wandererstroupe` | 4,5 | 2件:true、4件:false | 2件:1、4件:0 | 待逐条阅读 | `artifact4pc.ts:514` (`wanderers_troupe`) |
