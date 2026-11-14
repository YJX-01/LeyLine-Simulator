# P5角色与形态覆盖基线

2026-11-11，按正式manifest顺序核对154个实体；内容版本`genshin-db-8e5badd-content-v2`。这是全目录静态盘点，不是机制实现或验收完成清单。范围、公共依赖及后续批次见[盘点说明](p5-catalog-audit.md)。

下表保留2026-11-11首轮快照，支持列读取当时正式JSON的supported标记及参数绑定，不代表重新核验。2026-11-13之后的当前绑定和支持标记见本页后半的“全目录伤害绑定索引”；逐规则核验和缺口见[P5实施记录](p5-implementation.md)。原有局部支持证据仍按支持说明记录。

文本线索仅扫描正式JSON中的字符串；仅供定位阅读，不证明机制存在、适用条件或实现能力。关键词及误差边界见盘点说明。参考入口来自固定GenshinTools提交中的实际注册声明，仅忽略ID中的下划线、连字符和空格作检索；不是经过语义核验的别名映射。待映射不表示社区一定没有实现。入口相对`.references/GenshinTools/src/domain/combat/damage/impl/`。

| 实体 | 元素 | 已标记支持的技能/命中 | 被动支持/总数；命座支持/总数 | 文本线索 | 参考注册入口 |
| --- | --- | --- | --- | --- | --- |
| [空](../../src/game-data/data/characters/aether.json) `aether` | physical | 无 | 0/0；0/0 | 转化 | 待映射 |
| [爱诺](../../src/game-data/data/characters/aino.json) `aino` | hydro | 无 | 0/4；0/6 | 状态、层数、转化、触发、反应 | `character4NodKrai.ts:234` (`aino`) |
| [阿贝多](../../src/game-data/data/characters/albedo.json) `albedo` | geo | 无 | 0/3；0/6 | 护盾、状态、层数、转化、触发、反应、概率 | `character5Mondstadt.ts:383` (`albedo`) |
| [艾尔海森](../../src/game-data/data/characters/alhaitham.json) `alhaitham` | dendro | 无 | 0/3；0/6 | 层数、转化、触发、概率 | `character5Sumeru.ts:153` (`alhaitham`) |
| [埃洛伊](../../src/game-data/data/characters/aloy.json) `aloy` | cryo | 无 | 0/3；0/6 | 层数、触发 | `character5None.ts:324` (`aloy`) |
| [阿罗夏](../../src/game-data/data/characters/alyosha.json) `alyosha` | electro | 无 | 0/4；0/6 | 治疗、状态、层数、转化、触发、反应 | `character4Snezhnaya.ts:240` (`alyosha`) |
| [安柏](../../src/game-data/data/characters/amber.json) `amber` | pyro | 无 | 0/3；0/6 | 状态、层数、触发 | `character4Mondstadt.ts:1170` (`amber`) |
| [荒泷一斗](../../src/game-data/data/characters/aratakiitto.json) `aratakiitto` | geo | 无 | 0/3；0/6 | 状态、转化、触发、概率 | `character5Inazuma.ts:746` (`arataki_itto`) |
| [阿蕾奇诺](../../src/game-data/data/characters/arlecchino.json) `arlecchino` | pyro | 无 | 0/3；0/6 | 治疗、状态、转化、触发 | `character5Snezhnaya.ts:1465` (`arlecchino`) |
| [白术](../../src/game-data/data/characters/baizhu.json) `baizhu` | dendro | 无 | 0/3；0/6 | 治疗、护盾、状态、转化、触发、反应、概率 | `character5Liyue.ts:409` (`baizhu`) |
| [芭芭拉](../../src/game-data/data/characters/barbara.json) `barbara` | hydro | 无 | 0/3；0/6 | 治疗、状态、触发、概率 | `character4Mondstadt.ts:836` (`barbara`) |
| [北斗](../../src/game-data/data/characters/beidou.json) `beidou` | electro | 无 | 0/3；0/6 | 护盾、状态、层数、触发 | `character4Liyue.ts:841` (`beidou`) |
| [班尼特](../../src/game-data/data/characters/bennett.json) `bennett` | pyro | 无 | 0/3；0/6 | 治疗、状态、转化、触发 | `character4Mondstadt.ts:1088` (`bennett`) |
| [坎蒂丝](../../src/game-data/data/characters/candace.json) `candace` | hydro | 无 | 0/3；0/6 | 护盾、状态、层数、转化、触发 | `character4Sumeru.ts:401` (`candace`) |
| [夏洛蒂](../../src/game-data/data/characters/charlotte.json) `charlotte` | cryo | 无 | 0/3；0/6 | 治疗、状态、触发 | `character4Fontaine.ts:120` (`charlotte`) |
| [恰斯卡](../../src/game-data/data/characters/chasca.json) `chasca` | anemo | 无 | 0/4；0/6 | 状态、层数、转化、触发、概率 | `character5Natlan.ts:813` (`chasca`) |
| [夏沃蕾](../../src/game-data/data/characters/chevreuse.json) `chevreuse` | pyro | 无 | 0/3；0/6 | 治疗、状态、层数、转化、触发、反应 | `character4Fontaine.ts:8` (`chevreuse`) |
| [千织](../../src/game-data/data/characters/chiori.json) `chiori` | geo | 无 | 0/3；0/6 | 状态、层数、转化、触发 | `character5Inazuma.ts:331` (`chiori`) |
| [重云](../../src/game-data/data/characters/chongyun.json) `chongyun` | cryo | 无 | 0/3；0/6 | 状态、转化、触发 | `character4Liyue.ts:393` (`chongyun`) |
| [茜特菈莉](../../src/game-data/data/characters/citlali.json) `citlali` | cryo | 无 | 0/4；0/6 | 护盾、状态、层数、转化、触发、反应 | `character5Natlan.ts:328` (`citlali`) |
| [克洛琳德](../../src/game-data/data/characters/clorinde.json) `clorinde` | electro | 无 | 0/3；0/6 | 治疗、状态、层数、转化、触发 | `character5Fontaine.ts:489` (`clorinde`) |
| [柯莱](../../src/game-data/data/characters/collei.json) `collei` | dendro | 无 | 0/3；0/6 | 状态、层数、触发、反应 | `character4Sumeru.ts:636` (`collei`) |
| [哥伦比娅](../../src/game-data/data/characters/columbina.json) `columbina` | hydro | 无 | 0/4；0/6 | 治疗、护盾、状态、层数、转化、触发、反应、概率 | `character5NodKrai.ts:37` (`columbina`) |
| [赛诺](../../src/game-data/data/characters/cyno.json) `cyno` | electro | 无 | 0/3；0/6 | 层数、转化、触发、反应 | `character5Sumeru.ts:763` (`cyno`) |
| [塔利雅](../../src/game-data/data/characters/dahlia.json) `dahlia` | hydro | 无 | 0/3；0/6 | 护盾、状态、层数、转化、触发、反应 | `character4Mondstadt.ts:9` (`dahlia`) |
| [迪希雅](../../src/game-data/data/characters/dehya.json) `dehya` | pyro | 无 | 0/3；0/6 | 治疗、状态、层数、转化、触发 | `character5Sumeru.ts:12` (`dehya`) |
| [迪卢克](../../src/game-data/data/characters/diluc.json) `diluc` | pyro | 无 | 0/3；0/6 | 状态、层数、转化、触发 | `character5Mondstadt.ts:621` (`diluc`) |
| [迪奥娜](../../src/game-data/data/characters/diona.json) `diona` | cryo | 无 | 0/3；0/6 | 治疗、护盾、状态、转化、触发、概率 | `character4Mondstadt.ts:497` (`diona`) |
| [多莉](../../src/game-data/data/characters/dori.json) `dori` | electro | 无 | 0/3；0/6 | 治疗、状态、转化、触发、反应、概率 | `character4Sumeru.ts:547` (`dori`) |
| [杜林](../../src/game-data/data/characters/durin.json) `durin` | pyro | 无 | 0/3；0/6 | 状态、层数、触发、反应、概率 | `character5Mondstadt.ts:27` (`durin`) |
| [艾梅莉埃](../../src/game-data/data/characters/emilie.json) `emilie` | dendro | 无 | 0/3；0/6 | 状态、转化、触发、反应 | `character5Fontaine.ts:138` (`emilie`) |
| [爱可菲](../../src/game-data/data/characters/escoffier.json) `escoffier` | cryo | 无 | 0/3；0/6 | 治疗、状态、层数、转化、触发、反应、概率 | `character5Fontaine.ts:10` (`escoffier`) |
| [优菈](../../src/game-data/data/characters/eula.json) `eula` | cryo | 无 | 0/3；0/6 | 状态、层数、转化、触发、反应、概率、累计 | `character5Mondstadt.ts:1512` (`eula`) |
| [珐露珊](../../src/game-data/data/characters/faruzan.json) `faruzan` | anemo | 无 | 0/3；0/6 | 状态、转化、触发 | `character4Sumeru.ts:222` (`faruzan`) |
| [菲谢尔](../../src/game-data/data/characters/fischl.json) `fischl` | electro | 无 | 0/3；0/6 | 状态、触发 | `character4Mondstadt.ts:689` (`fischl`) |
| [菲林斯](../../src/game-data/data/characters/flins.json) `flins` | electro | 无 | 0/4；0/6 | 状态、转化、触发、反应 | `character5NodKrai.ts:570` (`flins`) |
| [菲米尼](../../src/game-data/data/characters/freminet.json) `freminet` | cryo | 无 | 0/3；0/6 | 层数、触发、反应 | `character4Fontaine.ts:217` (`freminet`) |
| [芙宁娜](../../src/game-data/data/characters/furina.json) `furina` | hydro | 无 | 0/3；0/6 | 治疗、状态、层数、转化、触发 | `character5Fontaine.ts:794` (`furina`) |
| [嘉明](../../src/game-data/data/characters/gaming.json) `gaming` | pyro | 无 | 0/3；0/6 | 治疗、状态、层数、转化、触发 | `character4Liyue.ts:114` (`gaming`) |
| [甘雨](../../src/game-data/data/characters/ganyu.json) `ganyu` | cryo | 无 | 0/3；0/6 | 状态、触发、反应 | `character5Liyue.ts:1288` (`ganyu`) |
| [五郎](../../src/game-data/data/characters/gorou.json) `gorou` | geo | 无 | 0/3；0/6 | 治疗、状态、层数、转化、触发、反应 | `character4Inazuma.ts:477` (`gorou`) |
| [胡桃](../../src/game-data/data/characters/hutao.json) `hutao` | pyro | 无 | 0/3；0/6 | 治疗、状态、转化、触发、概率 | `character5Liyue.ts:932` (`hu_tao`) |
| [伊安珊](../../src/game-data/data/characters/iansan.json) `iansan` | electro | 无 | 0/4；0/6 | 治疗、状态、转化、触发、累计 | `character4Natlan.ts:105` (`iansan`) |
| [伊法](../../src/game-data/data/characters/ifa.json) `ifa` | anemo | 无 | 0/4；0/6 | 治疗、状态、转化、触发、反应、概率 | `character4Natlan.ts:9` (`ifa`) |
| [叶洛亚](../../src/game-data/data/characters/illuga.json) `illuga` | geo | 无 | 0/4；0/6 | 状态、层数、转化、触发、反应 | `character4NodKrai.ts:17` (`illuga`) |
| [伊涅芙](../../src/game-data/data/characters/ineffa.json) `ineffa` | electro | 无 | 0/4；0/6 | 护盾、状态、转化、触发、反应、概率 | `character5NodKrai.ts:998` (`ineffa`) |
| [雅珂达](../../src/game-data/data/characters/jahoda.json) `jahoda` | anemo | 无 | 0/4；0/6 | 治疗、状态、转化、触发、概率、累计 | `character4NodKrai.ts:209` (`jahoda`) |
| [琴](../../src/game-data/data/characters/jean.json) `jean` | anemo | jean.skill（1段） | 0/3；0/6 | 治疗、状态、触发、概率 | `character5Mondstadt.ts:963` (`jean`) |
| [卡齐娜](../../src/game-data/data/characters/kachina.json) `kachina` | geo | 无 | 0/4；0/6 | 护盾、状态、转化、触发、反应 | `character4Natlan.ts:346` (`kachina`) |
| [枫原万叶](../../src/game-data/data/characters/kaedeharakazuha.json) `kaedeharakazuha` | anemo | 无 | 0/3；0/6 | 状态、层数、转化、触发、反应、累计 | `character5Inazuma.ts:1343` (`kaedehara_kazuha`) |
| [凯亚](../../src/game-data/data/characters/kaeya.json) `kaeya` | cryo | kaeya.skill（1段） | 0/3；0/6 | 护盾、状态、层数、触发、反应 | `character4Mondstadt.ts:1248` (`kaeya`) |
| [神里绫华](../../src/game-data/data/characters/kamisatoayaka.json) `kamisatoayaka` | cryo | 无 | 0/3；0/6 | 触发、反应、概率 | `character5Inazuma.ts:857` (`kamisato_ayaka`) |
| [神里绫人](../../src/game-data/data/characters/kamisatoayato.json) `kamisatoayato` | hydro | 无 | 0/3；0/6 | 状态、层数、转化、触发、概率 | `character5Inazuma.ts:1012` (`kamisato_ayato`) |
| [卡维](../../src/game-data/data/characters/kaveh.json) `kaveh` | dendro | 无 | 0/3；0/6 | 治疗、状态、层数、转化、触发、反应、概率 | `character4Sumeru.ts:93` (`kaveh`) |
| [刻晴](../../src/game-data/data/characters/keqing.json) `keqing` | electro | 无 | 0/3；0/6 | 转化、触发、概率 | `character5Liyue.ts:1403` (`keqing`) |
| [基尼奇](../../src/game-data/data/characters/kinich.json) `kinich` | dendro | 无 | 0/4；0/6 | 状态、层数、转化、触发、反应 | `character5Natlan.ts:1413` (`kinich`) |
| [绮良良](../../src/game-data/data/characters/kirara.json) `kirara` | dendro | 无 | 0/3；0/6 | 护盾、状态、层数、转化、触发 | `character4Inazuma.ts:8` (`kirara`) |
| [可莉](../../src/game-data/data/characters/klee.json) `klee` | pyro | 无 | 0/3；0/6 | 触发、概率 | `character5Mondstadt.ts:1306` (`klee`) |
| [九条裟罗](../../src/game-data/data/characters/kujousara.json) `kujousara` | electro | 无 | 0/3；0/6 | 状态、层数、转化、触发、反应 | `character4Inazuma.ts:610` (`kujou_sara`) |
| [久岐忍](../../src/game-data/data/characters/kukishinobu.json) `kukishinobu` | electro | 无 | 0/3；0/6 | 治疗、状态、转化、触发 | `character4Inazuma.ts:218` (`kuki_shinobu`) |
| [蓝砚](../../src/game-data/data/characters/lanyan.json) `lanyan` | anemo | 无 | 0/3；0/6 | 护盾、状态、转化、触发 | `character4Liyue.ts:8` (`lan_yan`) |
| [菈乌玛](../../src/game-data/data/characters/lauma.json) `lauma` | dendro | 无 | 0/4；0/6 | 治疗、状态、层数、转化、触发、反应 | `character5NodKrai.ts:765` (`lauma`) |
| [莱依拉](../../src/game-data/data/characters/layla.json) `layla` | cryo | 无 | 0/3；0/6 | 护盾、状态、层数、转化、触发、概率 | `character4Sumeru.ts:319` (`layla`) |
| [莉奈娅](../../src/game-data/data/characters/linnea.json) `linnea` | geo | 无 | 0/4；0/6 | 治疗、状态、层数、转化、触发、反应、累计 | `character5NodKrai.ts:1162` (`linnea`) |
| [丽莎](../../src/game-data/data/characters/lisa.json) `lisa` | electro | 无 | 0/3；0/6 | 层数、触发、概率 | `character4Mondstadt.ts:1313` (`lisa`) |
| [洛恩](../../src/game-data/data/characters/lohen.json) `lohen` | cryo | 无 | 0/3；0/6 | 触发 | `character5Mondstadt.ts:1945` (`lohen`) |
| [荧](../../src/game-data/data/characters/lumine.json) `lumine` | physical | 无 | 0/0；0/0 | 转化 | 待映射 |
| [琳妮特](../../src/game-data/data/characters/lynette.json) `lynette` | anemo | 无 | 0/3；0/6 | 治疗、状态、转化、触发 | `character4Fontaine.ts:318` (`lynette`) |
| [林尼](../../src/game-data/data/characters/lyney.json) `lyney` | pyro | 无 | 0/3；0/6 | 治疗、状态、层数、转化、触发 | `character5Fontaine.ts:1551` (`lyney`) |
| [奇偶·男性](../../src/game-data/data/characters/manekin.json) `manekin` | physical | 无 | 0/3；0/0 | 状态、转化、触发 | 待映射 |
| [奇偶·女性](../../src/game-data/data/characters/manekina.json) `manekina` | physical | 无 | 0/3；0/0 | 状态、转化、触发 | 待映射 |
| [玛薇卡](../../src/game-data/data/characters/mavuika.json) `mavuika` | pyro | 无 | 0/4；0/6 | 状态、转化、触发、反应 | `character5Natlan.ts:505` (`mavuika`) |
| [米卡](../../src/game-data/data/characters/mika.json) `mika` | cryo | 无 | 0/3；0/6 | 治疗、状态、层数、触发 | `character4Mondstadt.ts:291` (`mika`) |
| [米提亚](../../src/game-data/data/characters/mitya.json) `mitya` | electro | 无 | 0/4；0/6 | 状态、层数、转化、触发、反应、概率 | `character5Snezhnaya.ts:959` (`mitya`) |
| [莫娜](../../src/game-data/data/characters/mona.json) `mona` | hydro | 无 | 0/3；0/6 | 状态、触发、反应、概率 | `character5Mondstadt.ts:776` (`mona`) |
| [玛拉妮](../../src/game-data/data/characters/mualani.json) `mualani` | hydro | 无 | 0/4；0/6 | 状态、层数、转化、触发 | `character5Natlan.ts:1313` (`mualani`) |
| [纳西妲](../../src/game-data/data/characters/nahida.json) `nahida` | dendro | 无 | 0/3；0/6 | 状态、层数、转化、触发、反应 | `character5Sumeru.ts:553` (`nahida`) |
| [娜维娅](../../src/game-data/data/characters/navia.json) `navia` | geo | 无 | 0/3；0/6 | 层数、转化、触发、反应 | `character5Fontaine.ts:615` (`navia`) |
| [奈芙尔](../../src/game-data/data/characters/nefer.json) `nefer` | dendro | 无 | 0/4；0/6 | 状态、层数、转化、触发、反应 | `character5NodKrai.ts:303` (`nefer`) |
| [那维莱特](../../src/game-data/data/characters/neuvillette.json) `neuvillette` | hydro | 无 | 0/3；0/6 | 治疗、状态、层数、转化、触发、反应 | `character5Fontaine.ts:1022` (`neuvillette`) |
| [尼可](../../src/game-data/data/characters/nicole.json) `nicole` | pyro | 无 | 0/3；0/6 | 护盾、状态、层数、触发 | `character5None.ts:1518` (`nicole`) |
| [妮露](../../src/game-data/data/characters/nilou.json) `nilou` | hydro | 无 | 0/3；0/6 | 状态、转化、触发、反应、概率 | `character5Sumeru.ts:989` (`nilou`) |
| [凝光](../../src/game-data/data/characters/ningguang.json) `ningguang` | geo | 无 | 0/3；0/6 | 状态、触发 | `character4Liyue.ts:943` (`ningguang`) |
| [诺艾尔](../../src/game-data/data/characters/noelle.json) `noelle` | geo | 无 | 0/3；0/6 | 治疗、护盾、状态、转化、触发、概率、累计 | `character4Mondstadt.ts:605` (`noelle`) |
| [奥黛塔](../../src/game-data/data/characters/odette.json) `odette` | cryo | 无 | 0/4；0/6 | 状态、层数、转化、触发、反应 | `character5Snezhnaya.ts:2089` (`odette`) |
| [欧洛伦](../../src/game-data/data/characters/ororon.json) `ororon` | electro | 无 | 0/4；0/6 | 状态、层数、转化、触发、反应 | `character4Natlan.ts:203` (`ororon`) |
| [布伦妮](../../src/game-data/data/characters/prune.json) `prune` | anemo | 无 | 0/3；0/6 | 状态、转化、触发、反应、概率 | `character4Mondstadt.ts:79` (`prune`) |
| [七七](../../src/game-data/data/characters/qiqi.json) `qiqi` | cryo | 无 | 0/3；0/6 | 治疗、状态、触发、反应、概率 | `character5Liyue.ts:1565` (`qiqi`) |
| [雷电将军](../../src/game-data/data/characters/raidenshogun.json) `raidenshogun` | electro | 无 | 0/3；0/6 | 层数、转化、触发、反应 | `character5Inazuma.ts:561` (`raiden_shogun`) |
| [雷泽](../../src/game-data/data/characters/razor.json) `razor` | electro | 无 | 0/3；0/6 | 状态、层数、触发、反应 | `character4Mondstadt.ts:335` (`razor`) |
| [罗莎莉亚](../../src/game-data/data/characters/rosaria.json) `rosaria` | cryo | 无 | 0/3；0/6 | 层数、转化、触发 | `character4Mondstadt.ts:853` (`rosaria`) |
| [桑多涅](../../src/game-data/data/characters/sandrone.json) `sandrone` | cryo | 无 | 0/4；0/6 | 状态、层数、转化、触发、反应 | `character5Snezhnaya.ts:1709` (`sandrone`) |
| [珊瑚宫心海](../../src/game-data/data/characters/sangonomiyakokomi.json) `sangonomiyakokomi` | hydro | 无 | 0/4；0/6 | 治疗、状态、层数、转化、触发 | `character5Inazuma.ts:1163` (`sangonomiya_kokomi`) |
| [早柚](../../src/game-data/data/characters/sayu.json) `sayu` | anemo | 无 | 0/3；0/6 | 治疗、状态、转化、触发、反应 | `character4Inazuma.ts:349` (`sayu`) |
| [赛索斯](../../src/game-data/data/characters/sethos.json) `sethos` | electro | 无 | 0/3；0/6 | 层数、转化、触发、反应 | `character4Sumeru.ts:8` (`sethos`) |
| [申鹤](../../src/game-data/data/characters/shenhe.json) `shenhe` | cryo | 无 | 0/3；0/6 | 状态、层数、转化、触发 | `character5Liyue.ts:1061` (`shenhe`) |
| [鹿野院平藏](../../src/game-data/data/characters/shikanoinheizou.json) `shikanoinheizou` | anemo | 无 | 0/3；0/6 | 状态、层数、触发、反应、累计 | `character4Inazuma.ts:134` (`shikanoin_heizou`) |
| [希格雯](../../src/game-data/data/characters/sigewinne.json) `sigewinne` | hydro | 无 | 0/3；0/6 | 治疗、护盾、状态、转化、触发 | `character5Fontaine.ts:348` (`sigewinne`) |
| [丝柯克](../../src/game-data/data/characters/skirk.json) `skirk` | cryo | 无 | 0/3；0/6 | 状态、层数、触发、反应 | `character5None.ts:65` (`skirk`) |
| [砂糖](../../src/game-data/data/characters/sucrose.json) `sucrose` | anemo | 无 | 0/3；0/6 | 转化、触发、反应、概率、累计 | `character4Mondstadt.ts:935` (`sucrose`) |
| [达达利亚](../../src/game-data/data/characters/tartaglia.json) `tartaglia` | hydro | 无 | 0/3；0/6 | 状态、转化、触发、反应 | `character5Snezhnaya.ts:1576` (`tartaglia`) |
| [托马](../../src/game-data/data/characters/thoma.json) `thoma` | pyro | 无 | 0/3；0/6 | 护盾、状态、层数、触发、概率 | `character4Inazuma.ts:418` (`thoma`) |
| [提纳里](../../src/game-data/data/characters/tighnari.json) `tighnari` | dendro | 无 | 0/3；0/6 | 触发、反应 | `character5Sumeru.ts:1169` (`tighnari`) |
| [瓦列里](../../src/game-data/data/characters/valeriy.json) `valeriy` | electro | 无 | 0/4；0/6 | 护盾、状态、层数、转化、触发、反应 | `character4Snezhnaya.ts:49` (`valeriy`) |
| [瓦雷莎](../../src/game-data/data/characters/varesa.json) `varesa` | electro | 无 | 0/4；0/6 | 状态、层数、转化、触发 | `character5Natlan.ts:24` (`varesa`) |
| [法尔伽](../../src/game-data/data/characters/varka.json) `varka` | anemo | 无 | 0/3；0/6 | 层数、转化、触发、反应 | `character5Mondstadt.ts:1654` (`varka`) |
| [温迪](../../src/game-data/data/characters/venti.json) `venti` | anemo | 无 | 0/3；0/6 | 层数、转化、触发 | `character5Mondstadt.ts:1043` (`venti`) |
| [薇斯纳](../../src/game-data/data/characters/vesna.json) `vesna` | anemo | 无 | 0/4；0/6 | 状态、层数、转化、触发、反应 | `character5Snezhnaya.ts:2465` (`vesna`) |
| [沃雅妮莎](../../src/game-data/data/characters/vodyanitsa.json) `vodyanitsa` | hydro | 无 | 0/4；0/6 | 治疗、状态、层数、转化、触发、反应 | `character5Snezhnaya.ts:2794` (`vodyanitsa`) |
| [流浪者](../../src/game-data/data/characters/wanderer.json) `wanderer` | anemo | 无 | 0/3；0/6 | 触发、概率 | `character5Sumeru.ts:352` (`wanderer`) |
| [莱欧斯利](../../src/game-data/data/characters/wriothesley.json) `wriothesley` | cryo | 无 | 0/3；0/6 | 治疗、状态、层数、触发、概率 | `character5Fontaine.ts:1199` (`wriothesley`) |
| [香菱](../../src/game-data/data/characters/xiangling.json) `xiangling` | pyro | 无 | 0/3；0/6 | 触发、概率 | `character4Liyue.ts:294` (`xiangling`) |
| [闲云](../../src/game-data/data/characters/xianyun.json) `xianyun` | anemo | 无 | 0/3；0/6 | 治疗、状态、层数、转化、触发 | `character5Liyue.ts:281` (`xianyun`) |
| [魈](../../src/game-data/data/characters/xiao.json) `xiao` | anemo | 无 | 0/3；0/6 | 状态、层数、转化、触发 | `character5Liyue.ts:716` (`xiao`) |
| [希诺宁](../../src/game-data/data/characters/xilonen.json) `xilonen` | geo | 无 | 0/4；0/6 | 治疗、状态、层数、转化、触发、累计 | `character5Natlan.ts:1032` (`xilonen`) |
| [行秋](../../src/game-data/data/characters/xingqiu.json) `xingqiu` | hydro | xingqiu.skill（2段） | 1/3；0/6 | 状态、转化、触发、概率、累计 | `character4Liyue.ts:630` (`xingqiu`) |
| [辛焱](../../src/game-data/data/characters/xinyan.json) `xinyan` | pyro | 无 | 0/3；0/6 | 护盾、转化、触发、概率 | `character4Liyue.ts:516` (`xinyan`) |
| [八重神子](../../src/game-data/data/characters/yaemiko.json) `yaemiko` | electro | 无 | 0/3；0/6 | 触发、概率 | `character5Inazuma.ts:1707` (`yae_miko`) |
| [烟绯](../../src/game-data/data/characters/yanfei.json) `yanfei` | pyro | 无 | 0/3；0/6 | 护盾、状态、触发 | `character4Liyue.ts:725` (`yanfei`) |
| [瑶瑶](../../src/game-data/data/characters/yaoyao.json) `yaoyao` | dendro | 无 | 0/3；0/6 | 治疗、状态、转化、触发 | `character4Liyue.ts:192` (`yaoyao`) |
| [夜兰](../../src/game-data/data/characters/yelan.json) `yelan` | hydro | 无 | 0/3；0/6 | 状态、转化、触发、概率 | `character5Liyue.ts:550` (`yelan`) |
| [宵宫](../../src/game-data/data/characters/yoimiya.json) `yoimiya` | pyro | 无 | 0/3；0/6 | 状态、层数、触发、概率 | `character5Inazuma.ts:1561` (`yoimiya`) |
| [梦见月瑞希](../../src/game-data/data/characters/yumemizukimizuki.json) `yumemizukimizuki` | anemo | 无 | 0/3；0/6 | 治疗、状态、转化、触发、反应、概率 | `character5Inazuma.ts:24` (`yumemizuki_mizuki`) |
| [云堇](../../src/game-data/data/characters/yunjin.json) `yunjin` | geo | 无 | 0/3；0/6 | 护盾、状态、转化、触发、反应、概率 | `character4Liyue.ts:1017` (`yun_jin`) |
| [钟离](../../src/game-data/data/characters/zhongli.json) `zhongli` | geo | 无 | 0/3；0/6 | 治疗、护盾、状态、层数、转化、触发 | `character5Liyue.ts:798` (`zhongli`) |
| [兹白](../../src/game-data/data/characters/zibai.json) `zibai` | geo | 无 | 0/4；0/6 | 层数、转化、触发、反应 | `character5Liyue.ts:23` (`zibai`) |
| [空（风）](../../src/game-data/data/characters/aether-anemo.json) `aether-anemo` | anemo | 无 | 0/2；0/6 | 状态、转化、触发 | 待映射 |
| [空（岩）](../../src/game-data/data/characters/aether-geo.json) `aether-geo` | geo | 无 | 0/2；0/6 | 反应 | 待映射 |
| [空（雷）](../../src/game-data/data/characters/aether-electro.json) `aether-electro` | electro | 无 | 0/2；0/6 | 状态、转化、触发 | 待映射 |
| [空（草）](../../src/game-data/data/characters/aether-dendro.json) `aether-dendro` | dendro | 无 | 0/2；0/6 | 状态、层数、转化、触发 | 待映射 |
| [空（水）](../../src/game-data/data/characters/aether-hydro.json) `aether-hydro` | hydro | 无 | 0/2；0/6 | 治疗、护盾、状态、转化、触发 | 待映射 |
| [空（火）](../../src/game-data/data/characters/aether-pyro.json) `aether-pyro` | pyro | 无 | 0/2；0/6 | 状态、转化、触发、反应 | 待映射 |
| [空（冰）](../../src/game-data/data/characters/aether-cryo.json) `aether-cryo` | cryo | 无 | 0/3；0/6 | 状态、层数、转化、触发、反应 | 待映射 |
| [荧（风）](../../src/game-data/data/characters/lumine-anemo.json) `lumine-anemo` | anemo | 无 | 0/2；0/6 | 状态、转化、触发 | 待映射 |
| [荧（岩）](../../src/game-data/data/characters/lumine-geo.json) `lumine-geo` | geo | 无 | 0/2；0/6 | 反应 | 待映射 |
| [荧（雷）](../../src/game-data/data/characters/lumine-electro.json) `lumine-electro` | electro | 无 | 0/2；0/6 | 状态、转化、触发 | 待映射 |
| [荧（草）](../../src/game-data/data/characters/lumine-dendro.json) `lumine-dendro` | dendro | 无 | 0/2；0/6 | 状态、层数、转化、触发 | 待映射 |
| [荧（水）](../../src/game-data/data/characters/lumine-hydro.json) `lumine-hydro` | hydro | 无 | 0/2；0/6 | 治疗、护盾、状态、转化、触发 | 待映射 |
| [荧（火）](../../src/game-data/data/characters/lumine-pyro.json) `lumine-pyro` | pyro | 无 | 0/2；0/6 | 状态、转化、触发、反应 | 待映射 |
| [荧（冰）](../../src/game-data/data/characters/lumine-cryo.json) `lumine-cryo` | cryo | 无 | 0/3；0/6 | 状态、层数、转化、触发、反应 | 待映射 |
| [奇偶·男性（风）](../../src/game-data/data/characters/manekin-anemo.json) `manekin-anemo` | anemo | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1802` (`manekin_anemo`) |
| [奇偶·男性（冰）](../../src/game-data/data/characters/manekin-cryo.json) `manekin-cryo` | cryo | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1815` (`manekin_cryo`) |
| [奇偶·男性（草）](../../src/game-data/data/characters/manekin-dendro.json) `manekin-dendro` | dendro | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1828` (`manekin_dendro`) |
| [奇偶·男性（雷）](../../src/game-data/data/characters/manekin-electro.json) `manekin-electro` | electro | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1841` (`manekin_electro`) |
| [奇偶·男性（岩）](../../src/game-data/data/characters/manekin-geo.json) `manekin-geo` | geo | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1854` (`manekin_geo`) |
| [奇偶·男性（水）](../../src/game-data/data/characters/manekin-hydro.json) `manekin-hydro` | hydro | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1867` (`manekin_hydro`) |
| [奇偶·男性（火）](../../src/game-data/data/characters/manekin-pyro.json) `manekin-pyro` | pyro | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1880` (`manekin_pyro`) |
| [奇偶·女性（风）](../../src/game-data/data/characters/manekina-anemo.json) `manekina-anemo` | anemo | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1893` (`manekina_anemo`) |
| [奇偶·女性（冰）](../../src/game-data/data/characters/manekina-cryo.json) `manekina-cryo` | cryo | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1906` (`manekina_cryo`) |
| [奇偶·女性（草）](../../src/game-data/data/characters/manekina-dendro.json) `manekina-dendro` | dendro | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1919` (`manekina_dendro`) |
| [奇偶·女性（雷）](../../src/game-data/data/characters/manekina-electro.json) `manekina-electro` | electro | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1932` (`manekina_electro`) |
| [奇偶·女性（岩）](../../src/game-data/data/characters/manekina-geo.json) `manekina-geo` | geo | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1945` (`manekina_geo`) |
| [奇偶·女性（水）](../../src/game-data/data/characters/manekina-hydro.json) `manekina-hydro` | hydro | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1958` (`manekina_hydro`) |
| [奇偶·女性（火）](../../src/game-data/data/characters/manekina-pyro.json) `manekina-pyro` | pyro | 无 | 0/3；0/0 | 状态、转化、触发 | `character5None.ts:1971` (`manekina_pyro`) |

<!-- p5-damage-path-index -->
## 全目录伤害绑定索引

由正式定义显式生成，覆盖全部角色/形态。表中为命中类型绑定数与当前技能支持标记，不是实际命中次数或全角色完成判定；同参数多次命中由用户逐次记录。未绑定参数也可能是持续时间、治疗等非伤害参数，不能自动当作缺失伤害。

当前154份定义、454个技能，444个技能已有2013项命中类型绑定；其中10个技能、58项绑定已标记支持。其余实体仍全部在覆盖范围。

其中4个技能声明显式命中输入，17项绑定包含输入控制的附加缩放；这不表示相应角色完整规则已支持。

| 角色/形态ID | 普攻类绑定 / 状态 | 战技绑定 / 状态 | 爆发绑定 / 状态 |
| --- | --- | --- | --- |
| 空 (aether) | 10 / 已标记 | 不适用 | 不适用 |
| 爱诺 (aino) | 8 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 阿贝多 (albedo) | 10 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 艾尔海森 (alhaitham) | 11 / 待规则 | 4 / 待规则 | 1 / 待规则 |
| 埃洛伊 (aloy) | 10 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 阿罗夏 (alyosha) | 9 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 安柏 (amber) | 10 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 荒泷一斗 (aratakiitto) | 10 / 待规则 | 1 / 待规则 | 0 / 无独立伤害 |
| 阿蕾奇诺 (arlecchino) | 10 / 待规则 | 3 / 待规则 | 1 / 待规则 |
| 白术 (baizhu) | 8 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 芭芭拉 (barbara) | 8 / 待规则 | 1 / 待规则 | 0 / 无独立伤害 |
| 北斗 (beidou) | 10 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 班尼特 (bennett) | 10 / 待规则 | 6 / 待规则 | 1 / 待规则 |
| 坎蒂丝 (candace) | 9 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 夏洛蒂 (charlotte) | 7 / 待规则 | 4 / 待规则 | 2 / 待规则 |
| 恰斯卡 (chasca) | 9 / 待规则 | 3 / 待规则 | 2 / 待规则 |
| 夏沃蕾 (chevreuse) | 9 / 待规则 | 4 / 待规则 | 2 / 待规则 |
| 千织 (chiori) | 10 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 重云 (chongyun) | 9 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 茜特菈莉 (citlali) | 7 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 克洛琳德 (clorinde) | 12 / 待规则 | 6 / 待规则 | 1 / 待规则 |
| 柯莱 (collei) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 哥伦比娅 (columbina) | 7 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 赛诺 (cyno) | 9 / 待规则 | 2 / 待规则 | 10 / 待规则 |
| 塔利雅 (dahlia) | 10 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 迪希雅 (dehya) | 9 / 待规则 | 3 / 待规则 | 2 / 待规则 |
| 迪卢克 (diluc) | 9 / 待规则 | 3 / 待规则 | 3 / 待规则 |
| 迪奥娜 (diona) | 10 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 多莉 (dori) | 9 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 杜林 (durin) | 9 / 待规则 | 4 / 待规则 | 8 / 待规则 |
| 艾梅莉埃 (emilie) | 8 / 待规则 | 4 / 待规则 | 1 / 待规则 |
| 爱可菲 (escoffier) | 8 / 待规则 | 3 / 待规则 | 1 / 待规则 |
| 优菈 (eula) | 10 / 待规则 | 3 / 待规则 | 2 / 待规则 |
| 珐露珊 (faruzan) | 9 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 菲谢尔 (fischl) | 10 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 菲林斯 (flins) | 9 / 待规则 | 7 / 待规则 | 1 / 待规则 |
| 菲米尼 (freminet) | 9 / 待规则 | 11 / 待规则 | 1 / 待规则 |
| 芙宁娜 (furina) | 8 / 待规则 | 4 / 待规则 | 1 / 待规则 |
| 嘉明 (gaming) | 9 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 甘雨 (ganyu) | 13 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 五郎 (gorou) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 胡桃 (hutao) | 11 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 伊安珊 (iansan) | 7 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 伊法 (ifa) | 7 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 叶洛亚 (illuga) | 9 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 伊涅芙 (ineffa) | 9 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 雅珂达 (jahoda) | 8 / 待规则 | 3 / 待规则 | 2 / 待规则 |
| 琴 (jean) | 9 / 已标记 | 1 / 已标记 | 2 / 已标记 |
| 卡齐娜 (kachina) | 9 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 枫原万叶 (kaedeharakazuha) | 11 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 凯亚 (kaeya) | 10 / 已标记 | 1 / 已标记 | 1 / 已标记 |
| 神里绫华 (kamisatoayaka) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 神里绫人 (kamisatoayato) | 9 / 待规则 | 4 / 待规则 | 1 / 待规则 |
| 卡维 (kaveh) | 9 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 刻晴 (keqing) | 11 / 待规则 | 3 / 待规则 | 3 / 待规则 |
| 基尼奇 (kinich) | 7 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 绮良良 (kirara) | 11 / 待规则 | 3 / 待规则 | 2 / 待规则 |
| 可莉 (klee) | 7 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 九条裟罗 (kujousara) | 10 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 久岐忍 (kukishinobu) | 9 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 蓝砚 (lanyan) | 10 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 菈乌玛 (lauma) | 7 / 待规则 | 4 / 待规则 | 0 / 无独立伤害 |
| 莱依拉 (layla) | 8 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 莉奈娅 (linnea) | 8 / 待规则 | 3 / 待规则 | 0 / 无独立伤害 |
| 丽莎 (lisa) | 8 / 待规则 | 5 / 待规则 | 1 / 待规则 |
| 洛恩 (lohen) | 10 / 待规则 | 10 / 待规则 | 1 / 待规则 |
| 荧 (lumine) | 10 / 已标记 | 不适用 | 不适用 |
| 琳妮特 (lynette) | 10 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 林尼 (lyney) | 11 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·男性 (manekin) | 9 / 待规则 | 不适用 | 不适用 |
| 奇偶·女性 (manekina) | 9 / 待规则 | 不适用 | 不适用 |
| 玛薇卡 (mavuika) | 8 / 待规则 | 10 / 待规则 | 1 / 待规则 |
| 米卡 (mika) | 10 / 待规则 | 3 / 待规则 | 0 / 无独立伤害 |
| 米提亚 (mitya) | 7 / 待规则 | 3 / 待规则 | 1 / 待规则 |
| 莫娜 (mona) | 8 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 玛拉妮 (mualani) | 7 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 纳西妲 (nahida) | 8 / 待规则 | 3 / 待规则 | 0 / 无独立伤害 |
| 娜维娅 (navia) | 9 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 奈芙尔 (nefer) | 8 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 那维莱特 (neuvillette) | 8 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 尼可 (nicole) | 7 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 妮露 (nilou) | 8 / 待规则 | 7 / 待规则 | 2 / 待规则 |
| 凝光 (ningguang) | 6 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 诺艾尔 (noelle) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奥黛塔 (odette) | 10 / 待规则 | 4 / 待规则 | 2 / 待规则 |
| 欧洛伦 (ororon) | 8 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 布伦妮 (prune) | 7 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 七七 (qiqi) | 9 / 待规则 | 3 / 待规则 | 1 / 待规则 |
| 雷电将军 (raidenshogun) | 10 / 待规则 | 2 / 待规则 | 12 / 待规则 |
| 雷泽 (razor) | 9 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 罗莎莉亚 (rosaria) | 10 / 待规则 | 2 / 待规则 | 3 / 待规则 |
| 桑多涅 (sandrone) | 6 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 珊瑚宫心海 (sangonomiyakokomi) | 7 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 早柚 (sayu) | 10 / 待规则 | 3 / 待规则 | 2 / 待规则 |
| 赛索斯 (sethos) | 10 / 待规则 | 1 / 待规则 | 0 / 无独立伤害 |
| 申鹤 (shenhe) | 10 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 鹿野院平藏 (shikanoinheizou) | 11 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 希格雯 (sigewinne) | 9 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 丝柯克 (skirk) | 10 / 待规则 | 11 / 待规则 | 2 / 待规则 |
| 砂糖 (sucrose) | 8 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 达达利亚 (tartaglia) | 11 / 待规则 | 11 / 待规则 | 3 / 待规则 |
| 托马 (thoma) | 8 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 提纳里 (tighnari) | 11 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 瓦列里 (valeriy) | 7 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 瓦雷莎 (varesa) | 7 / 待规则 | 2 / 待规则 | 3 / 待规则 |
| 法尔伽 (varka) | 14 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 温迪 (venti) | 11 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 薇斯纳 (vesna) | 10 / 待规则 | 7 / 待规则 | 1 / 待规则 |
| 沃雅妮莎 (vodyanitsa) | 8 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 流浪者 (wanderer) | 8 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 莱欧斯利 (wriothesley) | 10 / 待规则 | 0 / 无独立伤害 | 2 / 待规则 |
| 香菱 (xiangling) | 9 / 待规则 | 1 / 待规则 | 4 / 待规则 |
| 闲云 (xianyun) | 8 / 待规则 | 4 / 待规则 | 2 / 待规则 |
| 魈 (xiao) | 12 / 待规则 | 1 / 待规则 | 0 / 无独立伤害 |
| 希诺宁 (xilonen) | 8 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 行秋 (xingqiu) | 12 / 已标记 | 2 / 已标记 | 1 / 待规则 |
| 辛焱 (xinyan) | 9 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 八重神子 (yaemiko) | 7 / 待规则 | 4 / 待规则 | 2 / 待规则 |
| 烟绯 (yanfei) | 11 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 瑶瑶 (yaoyao) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 夜兰 (yelan) | 10 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 宵宫 (yoimiya) | 11 / 待规则 | 0 / 无独立伤害 | 2 / 待规则 |
| 梦见月瑞希 (yumemizukimizuki) | 7 / 待规则 | 2 / 待规则 | 2 / 待规则 |
| 云堇 (yunjin) | 11 / 待规则 | 3 / 待规则 | 1 / 待规则 |
| 钟离 (zhongli) | 10 / 待规则 | 3 / 待规则 | 1 / 待规则 |
| 兹白 (zibai) | 10 / 待规则 | 7 / 待规则 | 1 / 待规则 |
| 空（风） (aether-anemo) | 10 / 待规则 | 4 / 待规则 | 1 / 待规则 |
| 空（岩） (aether-geo) | 10 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 空（雷） (aether-electro) | 10 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 空（草） (aether-dendro) | 10 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 空（水） (aether-hydro) | 10 / 待规则 | 3 / 待规则 | 1 / 待规则 |
| 空（火） (aether-pyro) | 10 / 待规则 | 3 / 待规则 | 1 / 待规则 |
| 空（冰） (aether-cryo) | 10 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 荧（风） (lumine-anemo) | 10 / 待规则 | 4 / 待规则 | 1 / 待规则 |
| 荧（岩） (lumine-geo) | 10 / 待规则 | 1 / 待规则 | 1 / 待规则 |
| 荧（雷） (lumine-electro) | 10 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 荧（草） (lumine-dendro) | 10 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 荧（水） (lumine-hydro) | 10 / 待规则 | 3 / 待规则 | 1 / 待规则 |
| 荧（火） (lumine-pyro) | 10 / 待规则 | 3 / 待规则 | 1 / 待规则 |
| 荧（冰） (lumine-cryo) | 10 / 待规则 | 2 / 待规则 | 1 / 待规则 |
| 奇偶·男性（风） (manekin-anemo) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·男性（冰） (manekin-cryo) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·男性（草） (manekin-dendro) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·男性（雷） (manekin-electro) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·男性（岩） (manekin-geo) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·男性（水） (manekin-hydro) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·男性（火） (manekin-pyro) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·女性（风） (manekina-anemo) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·女性（冰） (manekina-cryo) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·女性（草） (manekina-dendro) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·女性（雷） (manekina-electro) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·女性（岩） (manekina-geo) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·女性（水） (manekina-hydro) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |
| 奇偶·女性（火） (manekina-pyro) | 9 / 待规则 | 1 / 待规则 | 2 / 待规则 |

详细绑定、属性缩放、命中输入、元素、攻击类别和未绑定参数ID位于生成目录的damage-paths.json。普通构建只生成索引；文档由显式audit-damage-paths.mjs --write-docs更新。

<!-- p5-semantic-ledger -->

## R0主要路径语义台账（2026-11-14）

覆盖本清单全部154个ID。入口名称和绑定数量仅由正式定义枚举，不是语义归类或完成率；已细审北斗C0 E、凯亚C0—C3 E、C0—C1单次冰棱与8件基础武器。其它实体明确“本批未审”，不覆盖或否定历史局部证据。正式查询、用户操作与游戏观测分别登记；下表无一项表示整角色或P5完成，没有新增玩家战斗记录或游戏观测。统一边界见[本轮实施](p5-implementation.md)及[详细计划](p5-character-usability.md)。

| 实体ID | 主要路径入口／待审范围 | 来源语义审阅 | 定义绑定 | 组件／独立计算 | 正式完整查询 | 用户操作 | 剩余阻断／归属 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 空 (aether) | 故去的追忆（aether.normal） | 本批未审，目录源和历史局部证据保留 | normal:10；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 爱诺 (aino) | 敲打修理法（aino.normal）；妙思捕手（aino.skill）；精密水冷仪（aino.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 阿贝多 (albedo) | 西风剑术·白（albedo.normal）；创生法·拟造阳华（albedo.skill）；诞生式·大地之潮（albedo.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:2／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 艾尔海森 (alhaitham) | 溯因反绎法（alhaitham.normal）；共相·理式摹写（alhaitham.skill）；殊境·显象缚结（alhaitham.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:4／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 埃洛伊 (aloy) | 快速射击（aloy.normal）；冰尘雪野（aloy.skill）；曙光预言（aloy.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 阿罗夏 (alyosha) | 角枪驰弋（alyosha.normal）；伏袭霆击（alyosha.skill）；守猎进踞（alyosha.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:2／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 安柏 (amber) | 神射手（amber.normal）；爆弹玩偶（amber.skill）；箭雨（amber.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 荒泷一斗 (aratakiitto) | 喧哗屋传说（aratakiitto.normal）；魔杀绝技·赤牛发破！（aratakiitto.skill）；最恶鬼王·一斗轰临！！（aratakiitto.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:0；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 阿蕾奇诺 (arlecchino) | 斩首之邀（arlecchino.normal）；万相化灰（arlecchino.skill）；厄月将升（arlecchino.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:3／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 白术 (baizhu) | 金匮针解（baizhu.normal）；太素诊要（baizhu.skill）；愈气全形论（baizhu.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 芭芭拉 (barbara) | 水之浅唱（barbara.normal）；演唱，开始♪（barbara.skill）；闪耀奇迹♪（barbara.burst） | 普攻族、全部被动及C1已读；C2水伤影响保留 | normal:8／skill:1／burst:0；支持标记未扩大 | C0—C1普攻族8类单次水伤独立完整公式 | 正式Build／图／文件／Worker／候选逐类核验 | 计算器可选、换装并重开；不是整角色可用 | C2以上、E及治疗；R2/R3 |
| 北斗 (beidou) | 征涛（beidou.normal）；捉浪（beidou.skill）；斫雷（beidou.burst） | 本批E及全部被动作用范围已读；C1—6文本已读但未纳入证明 | normal:10／skill:1／burst:2；E档位0/1/2 | E九级三档独立完整公式 | C0 E正式Build／图／文件／Worker／候选 | 计算器可操作；完整角色仍未完成 | A/Q及命座、触发和捕获未收口；R2/R3 |
| 班尼特 (bennett) | 好运剑（bennett.normal）；热情过载（bennett.skill）；美妙旅程（bennett.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:6／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 坎蒂丝 (candace) | 流耀枪术·守势（candace.normal）；圣仪·苍鹭庇卫（candace.skill）；圣仪·灰鸰衒潮（candace.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:2／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 夏洛蒂 (charlotte) | 冷色摄影律（charlotte.normal）；取景·冰点构图法（charlotte.skill）；定格·全方位确证（charlotte.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:4／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 恰斯卡 (chasca) | 迷羽流击（chasca.normal）；灵缰追影（chasca.skill）；索魂命袭（chasca.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:3／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 夏沃蕾 (chevreuse) | 线列枪刺·改（chevreuse.normal）；近迫式急促拦射（chevreuse.skill）；圆阵掷弹爆轰术（chevreuse.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:4／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 千织 (chiori) | 心织刀流（chiori.normal）；羽袖一触（chiori.skill）；二刀之形·比翼（chiori.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 重云 (chongyun) | 灭邪四式（chongyun.normal）；灵刃·重华叠霜（chongyun.skill）；灵刃·云开星落（chongyun.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 茜特菈莉 (citlali) | 宿灵捕影（citlali.normal）；霜昼黑星（citlali.skill）；诸曜饬令（citlali.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:2／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 克洛琳德 (clorinde) | 逐影之誓（clorinde.normal）；狩夜之巡（clorinde.skill）；残光将终（clorinde.burst） | 本批未审，目录源和历史局部证据保留 | normal:12／skill:6／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 柯莱 (collei) | 祈颂射艺（collei.normal）；拂花偈叶（collei.skill）；猫猫秘宝（collei.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 哥伦比娅 (columbina) | 月露泼降（columbina.normal）；万古潮汐（columbina.skill）；她的乡愁（columbina.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 赛诺 (cyno) | 七圣枪术（cyno.normal）；秘仪·律渊渡魂（cyno.skill）；圣仪·煟煌随狼行（cyno.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:2／burst:10；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 塔利雅 (dahlia) | 西风剑术·祭仪（dahlia.normal）；圣浸的礼典（dahlia.skill）；纯耀的祷咏（dahlia.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 迪希雅 (dehya) | 拂金剑斗术（dehya.normal）；熔铁流狱（dehya.skill）；炎啸狮子咬（dehya.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:3／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 迪卢克 (diluc) | 淬炼之剑（diluc.normal）；逆焰之刃（diluc.skill）；黎明（diluc.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:3／burst:3；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 迪奥娜 (diona) | 猎人射术（diona.normal）；猫爪冻冻（diona.skill）；最烈特调（diona.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 多莉 (dori) | 妙显剑舞·改（dori.normal）；镇灵之灯·烦恼解决炮（dori.skill）；卡萨扎莱宫的无微不至（dori.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 杜林 (durin) | 芒焰之翼斩（durin.normal）；二元式·聚分熔炼（durin.skill）；白化法·如光流变（durin.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:4／burst:8；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 艾梅莉埃 (emilie) | 逐影枪术·改（emilie.normal）；撷萃调香（emilie.skill）；香氛演绎（emilie.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:4／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 爱可菲 (escoffier) | 后厨手艺（escoffier.normal）；低温烹饪（escoffier.skill）；花刀技法（escoffier.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:3／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 优菈 (eula) | 西风剑术·宗室（eula.normal）；冰潮的涡旋（eula.skill）；凝浪之光剑（eula.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:3／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 珐露珊 (faruzan) | 迴身箭术（faruzan.normal）；非想风天（faruzan.skill）；抟风秘道（faruzan.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 菲谢尔 (fischl) | 罪灭之矢（fischl.normal）；夜巡影翼（fischl.skill）；至夜幻现（fischl.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 菲林斯 (flins) | 扈圣魔枪（flins.normal）；古律·孤灯遗秘（flins.skill）；旧仪·夜客致访（flins.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:7／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 菲米尼 (freminet) | 洑流剑（freminet.normal）；浮冰增压（freminet.skill）；猎影潜袭（freminet.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:11／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 芙宁娜 (furina) | 独舞之邀（furina.normal）；孤心沙龙（furina.skill）；万众狂欢（furina.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:4／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 嘉明 (gaming) | 刃爪悬星（gaming.normal）；瑞兽登高楼（gaming.skill）；璨焰金猊舞（gaming.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 甘雨 (ganyu) | 流天射术（ganyu.normal）；山泽麟迹（ganyu.skill）；降众天华（ganyu.burst） | 本批未审，目录源和历史局部证据保留 | normal:13／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 五郎 (gorou) | 呲牙裂扇箭（gorou.normal）；犬坂吠吠方圆阵（gorou.skill）；兽牙逐突形胜战法（gorou.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 胡桃 (hutao) | 往生秘传枪法（hutao.normal）；蝶引来生（hutao.skill）；安神秘法（hutao.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 伊安珊 (iansan) | 负重锥击（iansan.normal）；电掣雷驰（iansan.skill）；力的三原理（iansan.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 伊法 (ifa) | 祛风妙仪（ifa.normal）；空天疾护（ifa.skill）；复合镇静域（ifa.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 叶洛亚 (illuga) | 守誓枪术（illuga.normal）；衔莺破晓（illuga.skill）；鉴照无影（illuga.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 伊涅芙 (ineffa) | 除尘旋刃（ineffa.normal）；涤净模式·稳态载频（ineffa.skill）；至高律令·全域扫灭（ineffa.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 雅珂达 (jahoda) | 见机行矢（jahoda.normal）；奇策·财富分配方案（jahoda.skill）；秘器·猎人的七道具（jahoda.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:3／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 琴 (jean) | 西风剑术（jean.normal）；风压剑（jean.skill）；蒲公英之风（jean.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 卡齐娜 (kachina) | 嵴之啮咬（kachina.normal）；出击，冲天转转！（kachina.skill）；现在，认真时间！（kachina.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 枫原万叶 (kaedeharakazuha) | 我流剑术（kaedeharakazuha.normal）；千早振（kaedeharakazuha.skill）；万叶之一刀（kaedeharakazuha.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:2／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 凯亚 (kaeya) | 仪典剑术（kaeya.normal）；霜袭（kaeya.skill）；凛冽轮舞（kaeya.burst） | E、全部被动及C1—3作用范围；冰棱捕获及C1已复核 | normal:10／skill:1／burst:1；E加级复用；Q显式独立捕获 | C0—C3 E及C0—C1单次冰棱独立公式 | 正式Build／图／文件／Worker／候选；Q独立取值点不生成动作 | 计算器可选捕获技能／时刻／阶段；完整角色仍未完成 | C1普攻目标冰附着；Q C2以上、贡献分类及其它路径；R2/R3 |
| 神里绫华 (kamisatoayaka) | 神里流·倾（kamisatoayaka.normal）；神里流·冰华（kamisatoayaka.skill）；神里流·霜灭（kamisatoayaka.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 神里绫人 (kamisatoayato) | 神里流·转（kamisatoayato.normal）；神里流·镜花（kamisatoayato.skill）；神里流·水囿（kamisatoayato.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:4／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 卡维 (kaveh) | 旋规设矩（kaveh.normal）；画则巧施（kaveh.skill）；繁绘隅穹（kaveh.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 刻晴 (keqing) | 云来剑法（keqing.normal）；星斗归位（keqing.skill）；天街巡游（keqing.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:3／burst:3；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 基尼奇 (kinich) | 夜阳斗技（kinich.normal）；悬猎·游骋高狩（kinich.skill）；向伟大圣龙致意（kinich.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:2／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 绮良良 (kirara) | 箱纸切削术（kirara.normal）；呜喵町飞足（kirara.skill）；秘法·惊喜特派（kirara.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:3／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 可莉 (klee) | 砰砰（klee.normal）；蹦蹦炸弹（klee.skill）；轰轰火花（klee.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 九条裟罗 (kujousara) | 天狗传弓术（kujousara.normal）；鸦羽天狗霆雷召咒（kujousara.skill）；煌煌千道镇式（kujousara.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 久岐忍 (kukishinobu) | 忍流飞刃斩（kukishinobu.normal）；越祓雷草之轮（kukishinobu.skill）；御咏鸣神刈山祭（kukishinobu.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 蓝砚 (lanyan) | 玄鸾画水（lanyan.normal）；凤缕随翦舞（lanyan.skill）；鹍弦踏月出（lanyan.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 菈乌玛 (lauma) | 林麓旅踏（lauma.normal）；圣言述咏·终宵永眠（lauma.skill）；圣言述咏·众心为月（lauma.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:4／burst:0；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 莱依拉 (layla) | 熠辉轨度剑（layla.normal）；垂裳端凝之夜（layla.skill）；星流摇床之梦（layla.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 莉奈娅 (linnea) | 捕获方案（linnea.normal）；对策·露米呀吼吼！（linnea.skill）；备忘·绝境生存指南（linnea.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:3／burst:0；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 丽莎 (lisa) | 指尖雷暴（lisa.normal）；苍雷（lisa.skill）；蔷薇的雷光（lisa.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:5／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 洛恩 (lohen) | 西风枪术·破誓（lohen.normal）；奇兵诡出（lohen.skill）；裁罚遂成（lohen.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:10／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 荧 (lumine) | 故去的追忆（lumine.normal） | 本批未审，目录源和历史局部证据保留 | normal:10；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 琳妮特 (lynette) | 迅捷礼刺剑（lynette.normal）；谜影障身法（lynette.skill）；魔术·运变惊奇（lynette.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:2／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 林尼 (lyney) | 迫牌易位式（lyney.normal）；眩惑光戏法（lyney.skill）；大魔术·灵迹巡游（lyney.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·男性 (manekin) | 外域剑术·安谨守望（manekin.normal） | 本批未审，目录源和历史局部证据保留 | normal:9；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·女性 (manekina) | 外域剑术·安谨守望（manekina.normal） | 本批未审，目录源和历史局部证据保留 | normal:9；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 玛薇卡 (mavuika) | 以火织命（mavuika.normal）；称名之刻（mavuika.skill）；燔天之时（mavuika.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:10／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 米卡 (mika) | 西风枪术·镝传（mika.normal）；星霜的流旋（mika.skill）；苍翎的颂愿（mika.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:3／burst:0；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 米提亚 (mitya) | 链式反应（mitya.normal）；律定·变量侦测（mitya.skill）；解析·递变之理（mitya.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:3／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 莫娜 (mona) | 因果点破（mona.normal）；水中幻愿（mona.skill）；星命定轨（mona.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 玛拉妮 (mualani) | 降温处理（mualani.normal）；踏鲨破浪（mualani.skill）；爆瀑飞弹（mualani.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 纳西妲 (nahida) | 行相（nahida.normal）；所闻遍计（nahida.skill）；心景幻成（nahida.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:3／burst:0；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 娜维娅 (navia) | 直率的辞绝（navia.normal）；典仪式晶火（navia.skill）；如霰澄天的鸣礼（navia.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:2／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奈芙尔 (nefer) | 游虵吐信（nefer.normal）；弈术·千夜一舞（nefer.skill）；圣约·真眸幻戏（nefer.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 那维莱特 (neuvillette) | 如水从平（neuvillette.normal）；泪水啊，我必偿还（neuvillette.skill）；潮水啊，我已归来（neuvillette.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:2／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 尼可 (nicole) | 托喻（nicole.normal）；圣言默示·未现之光（nicole.skill）；圣言默示·天路历程（nicole.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 妮露 (nilou) | 弦月舞步（nilou.normal）；七域舞步（nilou.skill）；浮莲舞步·远梦聆泉（nilou.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:7／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 凝光 (ningguang) | 千金掷（ningguang.normal）；璇玑屏（ningguang.skill）；天权崩玉（ningguang.burst） | 本批未审，目录源和历史局部证据保留 | normal:6／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 诺艾尔 (noelle) | 西风剑术·女仆（noelle.normal）；护心铠（noelle.skill）；大扫除（noelle.burst） | E、全部被动及C1—3作用范围已读 | normal:9／skill:1／burst:2；支持标记未扩大 | C0—C3 E初始防御缩放；C3复用加级独立完整公式 | 正式Build／图／文件／Worker／候选逐类核验 | 计算器可选、换装并重开；不是整角色可用 | Q强化与转换、C4及以上、护盾和治疗；R2/R3 |
| 奥黛塔 (odette) | 雪鹄变奏（odette.normal）；柔板·幻灵夜舞（odette.skill）；疾板·苍羽一梦（odette.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:4／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 欧洛伦 (ororon) | 宿灵闪箭（ororon.normal）；暝色缒索（ororon.skill）；黯声回响（ororon.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 布伦妮 (prune) | 隆咚咚·破魔之锤（prune.normal）；叮铃铃·猎魔之音（prune.skill）；铃鸣·狩魔之刻（prune.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:2／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 七七 (qiqi) | 云来古剑法（qiqi.normal）；仙法·寒病鬼差（qiqi.skill）；仙法·救苦度厄（qiqi.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:3／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 雷电将军 (raidenshogun) | 源流（raidenshogun.normal）；神变·恶曜开眼（raidenshogun.skill）；奥义·梦想真说（raidenshogun.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:2／burst:12；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 雷泽 (razor) | 钢脊（razor.normal）；利爪与苍雷（razor.skill）；雷牙（razor.burst） | E点按／长按、雷之印及全部被动已读；C1全伤害影响保留 | normal:9／skill:2／burst:1；支持标记未扩大 | C0 E两类单次雷伤独立完整公式 | 正式Build／图／文件／Worker／候选逐类核验 | 计算器可选、换装并重开；不是整角色可用 | C1拾取增伤、C2目标生命、后续命座和Q协同；R2/R3 |
| 罗莎莉亚 (rosaria) | 教会枪术（rosaria.normal）；噬罪的告解（rosaria.skill）；终命的圣礼（rosaria.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:2／burst:3；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 桑多涅 (sandrone) | 事象数式·自明演绎（sandrone.normal）；事象数式·游衍解析（sandrone.skill）；事象数式·万理证毕（sandrone.burst） | 本批未审，目录源和历史局部证据保留 | normal:6／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 珊瑚宫心海 (sangonomiyakokomi) | 水有常形（sangonomiyakokomi.normal）；海月之誓（sangonomiyakokomi.skill）；海人化羽（sangonomiyakokomi.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 早柚 (sayu) | 忍刀·终末番（sayu.normal）；呜呼流·风隐急进（sayu.skill）；呜呼流·影貉缭乱（sayu.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:3／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 赛索斯 (sethos) | 王家苇箭术（sethos.normal）；古仪·鸣砂掣雷（sethos.skill）；秘仪·瞑光贯影（sethos.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:0；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 申鹤 (shenhe) | 踏辰摄斗（shenhe.normal）；仰灵威召将役咒（shenhe.skill）；神女遣灵真诀（shenhe.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:2／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 鹿野院平藏 (shikanoinheizou) | 不动流格斗术（shikanoinheizou.normal）；勠心拳（shikanoinheizou.skill）；聚风蹴（shikanoinheizou.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 希格雯 (sigewinne) | 靶向治疗（sigewinne.normal）；弹跳水疗法（sigewinne.skill）；过饱和心意注射（sigewinne.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 丝柯克 (skirk) | 极恶技·断（skirk.normal）；极恶技·闪（skirk.skill）；极恶技·灭（skirk.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:11／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 砂糖 (sucrose) | 简式风灵作成（sucrose.normal）；风灵作成·陆叁零捌（sucrose.skill）；禁·风灵作成·柒伍同构贰型（sucrose.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 达达利亚 (tartaglia) | 断雨（tartaglia.normal）；魔王武装·狂澜（tartaglia.skill）；极恶技·尽灭闪（tartaglia.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:11／burst:3；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 托马 (thoma) | 迅破枪势（thoma.normal）；烈烧佑命之侍护（thoma.skill）；真红炽火之大铠（thoma.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 提纳里 (tighnari) | 藏蕴破障（tighnari.normal）；识果种雷（tighnari.skill）；造生缠藤箭（tighnari.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 瓦列里 (valeriy) | 近卫战法·盾剑攻斥（valeriy.normal）；攻势防御·堡垒骤进（valeriy.skill）；火力焦点·雷霰急袭（valeriy.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 瓦雷莎 (varesa) | 角力搏摔（varesa.normal）；夜虹逐跃（varesa.skill）；闪烈降临！（varesa.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:2／burst:3；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 法尔伽 (varka) | 西风剑术·流光之舞（varka.normal）；烈风终坠（varka.skill）；我即朔风（varka.burst） | 本批未审，目录源和历史局部证据保留 | normal:14／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 温迪 (venti) | 神代射术（venti.normal）；高天之歌（venti.skill）；风神之诗（venti.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 薇斯纳 (vesna) | 巡风剑舞（vesna.normal）；操典·制胜有道（vesna.skill）；致礼·献予女皇陛下（vesna.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:7／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 沃雅妮莎 (vodyanitsa) | 水色咏叹（vodyanitsa.normal）；宣叙·晨声纷流（vodyanitsa.skill）；终奏·伴尔沉沦（vodyanitsa.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 流浪者 (wanderer) | 行幡鸣弦（wanderer.normal）；羽画·风姿华歌（wanderer.skill）；狂言·式乐五番（wanderer.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 莱欧斯利 (wriothesley) | 迅烈倾霜拳（wriothesley.normal）；冰牙突驰（wriothesley.skill）；黑金狼噬（wriothesley.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:0／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 香菱 (xiangling) | 白案功夫（xiangling.normal）；锅巴出击（xiangling.skill）；旋火轮（xiangling.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:4；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 闲云 (xianyun) | 清风散花词（xianyun.normal）；朝起鹤云（xianyun.skill）；暮集竹星（xianyun.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:4／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 魈 (xiao) | 卷积微尘（xiao.normal）；风轮两立（xiao.skill）；靖妖傩舞（xiao.burst） | 本批未审，目录源和历史局部证据保留 | normal:12／skill:1／burst:0；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 希诺宁 (xilonen) | 锐锋攫猎（xilonen.normal）；音火锻淬（xilonen.skill）；豹烈律动！（xilonen.burst） | 本批未审，目录源和历史局部证据保留 | normal:8／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 行秋 (xingqiu) | 古华剑法（xingqiu.normal）；古华剑·画雨笼山（xingqiu.skill）；古华剑·裁雨留虹（xingqiu.burst） | 本批未审，目录源和历史局部证据保留 | normal:12／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 辛焱 (xinyan) | 炎舞（xinyan.normal）；热情拂扫（xinyan.skill）；叛逆刮弦（xinyan.burst） | E初始／脉冲区别、全部被动及C1—3已读 | normal:9／skill:2／burst:2；支持标记未扩大 | C0—C3 E初始火伤；C3复用加级独立完整公式 | 正式Build／图／文件／Worker／候选逐类核验 | 计算器可选、换装并重开；不是整角色可用 | E脉冲、Q、护盾等级及C4以上；R2/R3 |
| 八重神子 (yaemiko) | 狐灵食罪式（yaemiko.normal）；野干役咒·杀生樱（yaemiko.skill）；大密法·天狐显真（yaemiko.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:4／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 烟绯 (yanfei) | 火漆制印（yanfei.normal）；丹书立约（yanfei.skill）；凭此结契（yanfei.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 瑶瑶 (yaoyao) | 颠扑连环枪（yaoyao.normal）；云台团团降芦菔（yaoyao.skill）；玉颗珊珊月中落（yaoyao.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 夜兰 (yelan) | 潜形隐曜弓（yelan.normal）；萦络纵命索（yelan.skill）；渊图玲珑骰（yelan.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 宵宫 (yoimiya) | 烟火打扬（yoimiya.normal）；焰硝庭火舞（yoimiya.skill）；琉金云间草（yoimiya.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:0／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 梦见月瑞希 (yumemizukimizuki) | 梦我梦心（yumemizukimizuki.normal）；秋沙歌枕巡礼（yumemizukimizuki.skill）；安乐秘汤疗法（yumemizukimizuki.burst） | 本批未审，目录源和历史局部证据保留 | normal:7／skill:2／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 云堇 (yunjin) | 拂云出手（yunjin.normal）；旋云开相（yunjin.skill）；破嶂见旌仪（yunjin.burst） | 本批未审，目录源和历史局部证据保留 | normal:11／skill:3／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 钟离 (zhongli) | 岩雨（zhongli.normal）；地心（zhongli.skill）；天星（zhongli.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:3／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 兹白 (zibai) | 金铗点桂（zibai.normal）；天地忽然身（zibai.skill）；三垣威仪法（zibai.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:7／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 空（风） (aether-anemo) | 异邦铁风（aether-anemo.normal）；风涡剑（aether-anemo.skill）；风息激荡（aether-anemo.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:4／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 空（岩） (aether-geo) | 异邦岩锋（aether-geo.normal）；星陨剑（aether-geo.skill）；岩潮叠嶂（aether-geo.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 空（雷） (aether-electro) | 异邦惊雷（aether-electro.normal）；雷影剑（aether-electro.skill）；雷轰电转（aether-electro.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 空（草） (aether-dendro) | 异邦草翦（aether-dendro.normal）；草缘剑（aether-dendro.skill）；偃草若化（aether-dendro.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 空（水） (aether-hydro) | 异邦激流（aether-hydro.normal）；水纹剑（aether-hydro.skill）；扬水制流（aether-hydro.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:3／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 空（火） (aether-pyro) | 异邦烈焰（aether-pyro.normal）；流火剑（aether-pyro.skill）；灼火燎原（aether-pyro.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:3／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 空（冰） (aether-cryo) | 异邦寒芒（aether-cryo.normal）；冰雾剑（aether-cryo.skill）；聚冰成锋（aether-cryo.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 荧（风） (lumine-anemo) | 异邦铁风（lumine-anemo.normal）；风涡剑（lumine-anemo.skill）；风息激荡（lumine-anemo.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:4／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 荧（岩） (lumine-geo) | 异邦岩锋（lumine-geo.normal）；星陨剑（lumine-geo.skill）；岩潮叠嶂（lumine-geo.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 荧（雷） (lumine-electro) | 异邦惊雷（lumine-electro.normal）；雷影剑（lumine-electro.skill）；雷轰电转（lumine-electro.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 荧（草） (lumine-dendro) | 异邦草翦（lumine-dendro.normal）；草缘剑（lumine-dendro.skill）；偃草若化（lumine-dendro.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 荧（水） (lumine-hydro) | 异邦激流（lumine-hydro.normal）；水纹剑（lumine-hydro.skill）；扬水制流（lumine-hydro.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:3／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 荧（火） (lumine-pyro) | 异邦烈焰（lumine-pyro.normal）；流火剑（lumine-pyro.skill）；灼火燎原（lumine-pyro.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:3／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 荧（冰） (lumine-cryo) | 异邦寒芒（lumine-cryo.normal）；冰雾剑（lumine-cryo.skill）；聚冰成锋（lumine-cryo.burst） | 本批未审，目录源和历史局部证据保留 | normal:10／skill:2／burst:1；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·男性（风） (manekin-anemo) | 外域剑术·安谨守望（manekin-anemo.normal）；戒惩轰击（manekin-anemo.skill）；禁入限区（manekin-anemo.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·男性（冰） (manekin-cryo) | 外域剑术·安谨守望（manekin-cryo.normal）；戒惩轰击（manekin-cryo.skill）；禁入限区（manekin-cryo.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·男性（草） (manekin-dendro) | 外域剑术·安谨守望（manekin-dendro.normal）；戒惩轰击（manekin-dendro.skill）；禁入限区（manekin-dendro.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·男性（雷） (manekin-electro) | 外域剑术·安谨守望（manekin-electro.normal）；戒惩轰击（manekin-electro.skill）；禁入限区（manekin-electro.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·男性（岩） (manekin-geo) | 外域剑术·安谨守望（manekin-geo.normal）；戒惩轰击（manekin-geo.skill）；禁入限区（manekin-geo.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·男性（水） (manekin-hydro) | 外域剑术·安谨守望（manekin-hydro.normal）；戒惩轰击（manekin-hydro.skill）；禁入限区（manekin-hydro.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·男性（火） (manekin-pyro) | 外域剑术·安谨守望（manekin-pyro.normal）；戒惩轰击（manekin-pyro.skill）；禁入限区（manekin-pyro.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·女性（风） (manekina-anemo) | 外域剑术·安谨守望（manekina-anemo.normal）；戒惩轰击（manekina-anemo.skill）；禁入限区（manekina-anemo.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·女性（冰） (manekina-cryo) | 外域剑术·安谨守望（manekina-cryo.normal）；戒惩轰击（manekina-cryo.skill）；禁入限区（manekina-cryo.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·女性（草） (manekina-dendro) | 外域剑术·安谨守望（manekina-dendro.normal）；戒惩轰击（manekina-dendro.skill）；禁入限区（manekina-dendro.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·女性（雷） (manekina-electro) | 外域剑术·安谨守望（manekina-electro.normal）；戒惩轰击（manekina-electro.skill）；禁入限区（manekina-electro.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·女性（岩） (manekina-geo) | 外域剑术·安谨守望（manekina-geo.normal）；戒惩轰击（manekina-geo.skill）；禁入限区（manekina-geo.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·女性（水） (manekina-hydro) | 外域剑术·安谨守望（manekina-hydro.normal）；戒惩轰击（manekina-hydro.skill）；禁入限区（manekina-hydro.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
| 奇偶·女性（火） (manekina-pyro) | 外域剑术·安谨守望（manekina-pyro.normal）；戒惩轰击（manekina-pyro.skill）；禁入限区（manekina-pyro.burst） | 本批未审，目录源和历史局部证据保留 | normal:9／skill:1／burst:2；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |
