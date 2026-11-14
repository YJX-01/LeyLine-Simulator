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
