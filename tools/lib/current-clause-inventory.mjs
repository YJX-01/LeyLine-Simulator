import { readContentSource } from './content-source.mjs';
import { makeEquipmentProseProofs } from './equipment-source-clauses.mjs';
import { makeEquipmentAuraProseProofs } from './equipment-aura-prose.mjs';
import { makeCharacterMovementDefenseProse } from './character-movement-defense-prose.mjs';
import { makeCharacterTriggerProse, ownsCharacterTriggerField } from './character-trigger-prose.mjs';

const equipmentSource = 'tools/data/sources/catalog/genshin-db/';
const modifierSource = 'tools/data/sources/catalog/equipment-modifier-checks.json';
const modifierChecks = readContentSource(new URL('../data/sources/catalog/equipment-modifier-checks.json', import.meta.url));
const folders = { character: 'characters', weapon: 'weapons', set: 'artifact-sets' };
const needed = {
  'bound-unverified': '按实际条件、数值、受益者和排除分支补独立对照。',
  'needs-binding': '从原文定位该数值的输出、条件或明确输入，再添加独立对照。',
  'needs-evidence': '补足所列当次输入或原文依据，并核对相应分支。',
  'needs-review': '按实体逐条确认所指效果及其对应输出或事件状态。',
};

const normalized = text => text.replaceAll('**', '').trim();
const matches = (value, expected) => Number.isFinite(value) && Number.isFinite(expected)
  && Math.abs(value - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
const fieldKey = (entity, field) => entity + field;
const covers = (parent, child) => child === parent || child?.startsWith(parent + '/');
const unique = refs => [...new Set(refs.flat().filter(ref => typeof ref === 'string' && ref))];

// Match an entire subclause. A timing qualifier cannot consume an adjacent
// numeric effect. Mixed statements remain intact unless a boundary is explicit.
const timingSentences = [
  /^(?:该效果|此效果|上述效果)(?:持续\d+(?:\.\d+)?秒(?:，至多叠加\d+次)?(?:，每\d+(?:\.\d+)?秒至多触发一次)?|每\d+(?:\.\d+)?(?:秒|分钟)(?:至多|最多|只能|仅能|可以)触发(?:一次|1次)|至多叠加\d+次)$/,
  /^每\d+(?:\.\d+)?(?:秒|分钟)(?:至多|最多|只能|仅能|可以)触发(?:一次|1次)$/,
  /^(?:通过这种方式，)?至多延长\d+(?:\.\d+)?秒$/,
  /^(?:该效果|此效果|上述效果)将在(?:退场时|连续施展结束时|切换角色时)消失$/,
  /^每\d+(?:\.\d+)?秒(?:只能|至多|最多)(?:生成|投掷|发射)一次[\p{Script=Han}·「」]+$/u,
  /^「[^」]+」将在[\p{Script=Han}·]+离场时消失$/u,
];
const talentHeadings = new Set(['普通攻击', '重击', '下落攻击', '点按', '长按', '元素转化', '具有如下特性：',
  '始基力：芒性', '始基力：荒性', '根据蓄力时间长短，能造成不同的效果：']);
const simpleSetStats = {
  '攻击力': 'attackPercent', '防御力': 'defensePercent', '暴击率': 'critRate',
  '暴击伤害': 'critDamage', '治疗加成': 'healingBonus', '元素充能效率': 'energyRecharge',
  '生命值': 'hpPercent', '生命值上限': 'hpPercent', '护盾强效': 'shieldStrength',
  '物理伤害加成': 'physicalBonus', '元素精通': 'elementalMastery',
  '火元素伤害加成': 'pyroBonus', '水元素伤害加成': 'hydroBonus', '风元素伤害加成': 'anemoBonus',
  '雷元素伤害加成': 'electroBonus', '草元素伤害加成': 'dendroBonus',
  '冰元素伤害加成': 'cryoBonus', '岩元素伤害加成': 'geoBonus',
};
const statedStats = { ...simpleSetStats, '移动速度': 'movementSpeed', '受治疗加成': 'incomingHealingBonus', '攻击速度': 'attackSpeed' };
const statIncrease = new RegExp('(?<!基础|白值|非额外)(' + Object.keys(statedStats).sort((a, b) => b.length - a.length).join('|')
  + ')(?:还会|还将|额外)?(?:提高|提升|增加)(\\d+(?:\\.\\d+)?)(%|点)', 'g');
const numericActions = [
  /^(?:[^。；%]*[，：、])?(?:[\p{Script=Han}「」·]+的)?(?:攻击力|防御力|暴击率|暴击伤害|治疗加成|元素精通|元素充能效率|生命值上限|护盾强效|[火水风雷草冰岩](?:元素)?(?:伤害加成|抗性)|造成的伤害|受到的伤害)(?:还|额外|也)?(?:提高|增加|降低|提升|减少)[^。；]*\d+(?:\.\d+)?(?:%|点)(?:[^。；]*)$/u,
  /^(?=[^。；]*\d+(?:\.\d+)?%)[^。；]*(?:造成(?:原本|相当于|等同于)?[^。；]*伤害|伤害(?:提升|提高|增加|降低|等同于)[^。；]*|恢复[^。；]*生命值[^。；]*|(?:伤害)?吸收量[^。；]*)$/u,
  /^(?=[^。；]*\d+(?:\.\d+)?%)[^。；]*(?:伤害\*{0,2}擢升\*{0,2}|附加伤害值)[^。；]*$/u,
];

// Explicit source branches where the same sentence covers two different
// outputs, or where the pending fact is a particular state or target selection.
const scopedProse = {
  'aino/passives/0': [
    ['依据队伍的月兆，爱诺将获得对应的强化效果', 'needs-review', '核对不同月兆是否改变所选水弹的数值。'],
    ['月兆·满辉：元素爆发精密水冷仪将获得强化：「冷静一下鸭」将以更短的间隔发射水弹，造成范围更大的水元素范围伤害', 'timeline-only', '满辉分支写明发射间隔和覆盖范围变化。发生的单个水弹另按登记倍率核对。'],
  ],
  'gambler/effects/1': [
    ['击败敌人时，有100%概率清除元素战技的冷却时间', 'timeline-only', '效果负责决定击败后下一次施放何时可用。'],
  ],
  'dehya/passives/0': [
    ['迪希雅通过熔铁流狱·剑域炽焰或炎啸狮子咬回收净焰剑狱后的6秒内', 'timeline-only', '回收后的6秒窗口取决于历史事件。'],
    ['每18秒至多产生一次熔金铸躯状态', 'timeline-only', '该句限定熔金铸躯的生成间隔。'],
  ],
  'layla/passives/0': [['持续直到安眠帷幕护盾消失', 'timeline-only', '叠层的存续取决于对应主护盾的实例。']],
  'layla/constellations/0': [['该护盾持续12秒', 'timeline-only', '次级护盾的结束时刻需要护盾实例记录。']],
  'lauma/constellations/0': [['菈乌玛施放元素战技圣言述咏·终宵永眠或元素爆发圣言述咏·众心为月后，将获得「生之纺线」，持续20秒',
    'timeline-only', '由施放事件决定生之纺线的20秒存续。']],
  'sigewinne/passives/2': [['并在10秒内', 'timeline-only', '抗性下降的持续时间需水下状态记录。']],
  'kaveh/constellations/5': [['并使影响范围内的所有草原核迸发', 'needs-evidence', '待核验该次草原核的位置、归属及引爆时序。']],
  'lynette/passives/2': [['在小地图上显示周围复苏水团的位置', 'non-numeric', '小地图位置标记。']],
  'endoftheline/buffs': [
    ['每12秒至多触发一次沿洄', 'timeline-only', '该句限定沿洄状态的启动间隔。'],
  ],
  'odette/passives/3': [
    ['在小地图上显示周围的至冬区域特产的位置，在影域中亦能提供相同的佑助', 'non-numeric', '小地图区域特产标记。'],
    ['在闲暇时练习舞蹈，或许还会触发其他的效果…', 'needs-review', '现有条款未说明额外效果，需核对其结果和战斗适用条件。'],
  ],
  'escoffier/constellations/3': [
    ['康复食疗的持续时间延长6秒', 'timeline-only', '康复食疗的自动持续时长。'],
    ['一次康复食疗持续期间，该效果至多触发7次', 'timeline-only', '每轮康复食疗的触发计数。'],
  ],
  'yaoyao/constellations/5': [
    ['月桂·抛掷型每投掷2次白玉萝卜，就会在下次投掷时额外投掷1枚超厉害·大萝卜', 'timeline-only', '由投掷记录决定哪一次抛掷额外生成大萝卜。'],
    ['每个月桂·抛掷型至多投掷2次超厉害·大萝卜', 'timeline-only', '单次月桂·抛掷型的额外抛掷次数上限。'],
  ],
};

// Split mixed source sentences at named boundaries so proof of an amount does
// not also close an adjacent trigger, history or different outcome.
const mixedProseBoundaries = {
  'dehya/passives/0': ['迪希雅承担来自赤鬃之血的伤害时，受到的伤害降低60%', '该效果每2秒至多触发一次'],
  'layla/passives/0': ['持续直到安眠帷幕护盾消失'],
  'layla/constellations/0': ['伤害吸收量为安眠帷幕护盾35%的护盾', '该护盾持续12秒', '对冰元素伤害有250%的吸收效果'],
  'lauma/constellations/0': ['回复量相当于菈乌玛元素精通的500%', '该效果每1.9秒至多触发一次'],
  'sigewinne/passives/2': ['总回复量相当于其生命值上限的50%', '并在10秒内', '使该角色的所有元素抗性和物理抗性下降10%'],
  'zibai/constellations/5': ['基于消耗的「时隙浮光」超过70点'],
  'odette/constellations/5': ['且奥黛塔对敌人造成的星烁反应伤害额外擢升20%'],
  'kinich/constellations/5': ['造成基尼奇的攻击力700%的草元素伤害'],
  'prune/constellations/3': ['对命中的敌人造成80%攻击力的对应元素类型的元素伤害'],
  'kaveh/constellations/5': ['造成卡维攻击力61.8%的草元素范围伤害', '并使影响范围内的所有草原核迸发'],
  'swordofnarzissenkreuz/buffs': ['会释放芒性或荒性的能量冲击'],
  'lynette/passives/2': ['并使接触复苏水团时恢复的水中耐力与生命值提升25%'],
  'columbina/passives/3': ['该效果每100秒至多触发一次'],
  'qiqi/constellations/5': ['并将其生命值恢复至50%'],
  'zhongli/constellations/5': ['回复量为伤害的40%'],
};

const triggeredStrikeProse = {
  'kinich/constellations/5': [
    ['造成基尼奇的攻击力700%的草元素伤害', 'kinich.c6.scalespiker-bounce', '给定本次弹跳已发生，核验700%攻击力的战技草伤。'],
    ['它所引发的弹跳攻击也会获得上述效果的增强', 'kinich.c6.scalespiker-bounce', '给定本次原炮的猎人心得消耗或首次贯鳞炮状态，核验弹跳承接对应增伤。',
      settings => Number.isInteger(settings.facts?.['kinich.hunterExperienceSpent'])],
  ],
  'prune/constellations/3': [['对命中的敌人造成80%攻击力的对应元素类型的元素伤害', 'prune.c4.oathhammer-ricochet',
    '给定弹跳及原锤转化元素，核验火、水、雷、冰各自的80%攻击力独立伤害。']],
  'kaveh/constellations/5': [['造成卡维攻击力61.8%的草元素范围伤害', 'kaveh.c6.pairidaezas-light',
    '给定繁绘隅穹和本次触发状态，核验天园之光的61.8%攻击力草伤。']],
  'jahoda/passives/0': [['火元素：猫型家用互助协调器造成原本130%的伤害', 'jahoda.a1.coordinator-pyro-boost',
    '给定当次雅珂达的元素记录，核验四种转化段的伤害乘以1.3。']],
  'swordofnarzissenkreuz/buffs': [['会释放芒性或荒性的能量冲击，造成160%攻击力的伤害', 'swordofnarzissenkreuz.arkhe-blast',
    '给定持有者无始基力且本次冲击有效，核验两种属性共用的独立冲击伤害及精炼倍率。']],
};

const boundedLifecycle = {
  'oceanhuedclam/effects/1/hits/0': '单个已选目标采用已核对的泡沫数值，自动选择范围内敌人仍待接入。',
  'cinnabarspindle/buffs/0/trigger': '旧版打盾异常的当前适用性和恢复条件需实证。',
  'deathmatch/buffs/0/condition': '重新登场后仍需观察刷新时刻，期间可给定已知档位。',
  'darkironsword/buffs/0/condition': '后台触发能否发生尚缺独立记录，当次可输入已确认的触发结果。',
  'emeraldorb/buffs/0/condition': '后台触发能否发生尚缺独立记录，当次可输入已确认的触发结果。',
  'missivewindspear/buffs/0/condition': '后台触发能否发生尚缺独立记录，当次可输入已确认的触发结果。',
  'fruitfulhook/buffs/1/condition': '后台触发能否发生尚缺独立记录，当次可输入已确认的触发结果。',
  'kamisatoayato/talents/1/castWindow/followUp': '追加两击的命中偏移缺实证。各自450%攻击力的当次数值另有对照。',
  'freminet/constellations/3/buffs/0/stacking/refreshUnverified': '给定实际层数可算，逐层到期与集体刷新分歧需实证。',
  'freminet/constellations/5/buffs/0/stacking/refreshUnverified': '给定实际层数可算，逐层到期与集体刷新分歧需实证。',
  'vesna/gaps/0': '动作时长、取消时间、命中与飞羽的偏移需逐帧记录。',
  'vesna/gaps/4': '缺少完整动作、能量、冷却与命中时刻的实战观察。',
};
const onlyTimelineInAudit = new Set([
  'gorou/constellations/0', 'kamisatoayaka/constellations/0', 'kujousara/constellations/0',
  'mika/constellations/0', 'neuvillette/constellations/3', 'raidenshogun/constellations/5',
  'shenhe/constellations/5', 'tighnari/constellations/5',
]);
const scheduledEnergyGrants = {
  'aether-cryo/constellations/0': 0, 'lumine-cryo/constellations/0': 0,
  'aether-electro/constellations/5': 1, 'lumine-electro/constellations/5': 1,
  'dori/passives/1': 0, 'furina/constellations/3': 0, 'klee/passives/1': 0, 'kujousara/passives/1': 0,
  'mika/constellations/3': 0, 'rosaria/constellations/3': 0, 'yaoyao/constellations/1': 0,
};
const verifiedValuePendingTiming = new Set([
  'ifa/passives/0', 'ifa/constellations/1',
  'aether-anemo/passives/1', 'aether-hydro/passives/0', 'alyosha/passives/0', 'alyosha/constellations/3',
  'baizhu/passives/2', 'charlotte/constellations/0', 'dehya/passives/1', 'dehya/constellations/3',
  'dori/constellations/5', 'escoffier/passives/0', 'escoffier/constellations/3', 'furina/passives/0',
  'gaming/passives/0', 'gaming/constellations/0', 'gorou/constellations/3', 'iansan/passives/1',
  'jean/passives/0', 'kaeya/passives/0', 'kaveh/passives/0', 'sangonomiyakokomi/constellations/1',
  'sayu/passives/0', 'wriothesley/constellations/3', 'xianyun/constellations/3', 'xingqiu/passives/0',
  'xinyan/constellations/0', 'yaoyao/passives/1', 'yoimiya/passives/0', 'yumemizukimizuki/constellations/3',
]);

// Source wording selects the specific heal entries under the declared origin.
// Compound sentences can have damage, energy and timing in addition to healing.
const grantedHealingProse = {
  'aether-anemo/passives/1': [['每秒恢复2%生命值', ['skill.slain-wind']]],
  'aether-hydro/passives/0': [['拾取源水之滴后将恢复7%生命值', ['skill.spotless-waters']]],
  'aether-hydro/constellations/5': [['基于其生命值上限的6%，恢复生命值', ['skill.tides-of-justice']]],
  'alyosha/passives/0': [['回复量相当于阿罗夏攻击力的120%', ['burst.tugarin-active']]],
  'alyosha/constellations/3': [['回复量相当于阿罗夏攻击力的60%', ['burst.tugarin-lowest']]],
  'baizhu/passives/2': [['回复量基于白术生命值上限的2.5%', ['skill.herbal-nourishment']]],
  'baizhu/constellations/1': [['游丝徵灵的20%回复量', ['skill.gossamer-sprite-splice'], '确认游丝徵灵·切已返回后，按战技基础治疗量的20%治疗。']],
  'charlotte/constellations/0': [['回复量相当于夏洛蒂攻击力的80%', ['burst.verification']]],
  'charlotte/constellations/5': [['回复量相当于夏洛蒂攻击力的42%', ['burst.focused-impression'], '按已确认攻击范围内的当前角色计算单次治疗，共用6秒限次仍需记录。']],
  'dehya/passives/1': [['基于生命值上限的6%为迪希雅恢复生命值', ['skill.stout-heart-initial', 'skill.stout-heart-tick']]],
  'dehya/constellations/3': [['基于生命值上限的2.5%，为迪希雅恢复生命值', ['burst.flame-ignition']]],
  'escoffier/passives/0': [['爱可菲自己攻击力的138.24%', ['burst.restorative-diet']]],
  'escoffier/constellations/3': [['有几率使治疗量提升100%', ['burst.restorative-diet-double']]],
  'furina/passives/0': [['角色各自生命值上限的2%', ['skill.endless-waltz']]],
  'furina/constellations/5': [['基于芙宁娜生命值上限的4%', ['skill.center-of-attention'], '按明确的荒性治疗跳及受益者计算，攻击、持续时间和续期另行核验。']],
  'gaming/passives/0': [['嘉明生命值上限的1.5%', ['skill.dance-of-amity']]],
  'gaming/constellations/0': [['文仔成功与嘉明会合时，将为嘉明恢复15%生命值', ['burst.man-chai-reunion']]],
  'gorou/constellations/3': [['五郎自己防御力的50%', ['burst.lapping-hound']]],
  'iansan/passives/1': [['伊安珊攻击力的60%', ['burst.warm-up']]],
  'ifa/passives/3': [['伊法将消耗10点燃素为其恢复40%生命值', ['skill.field-medic']]],
  'jean/passives/0': [['等同于琴攻击力15%的生命值', ['normal.wind-companion']]],
  'kaeya/passives/0': [['霜袭每击中一个单位，便为凯亚恢复等同于攻击力15%的生命值', ['skill.cold-blooded-strike']]],
  'kaveh/passives/0': [['卡维元素精通的300%', ['skill.architects-undertaking']]],
  'sangonomiyakokomi/constellations/1': [
    ['海月之誓的化海月：生命值上限的4.5%', ['skill.sea-moon-bonus'], '对生命比例不高于50%的化海月受益者，核验按心海生命上限4.5%计算的追加量。'],
    ['海人化羽的普通攻击与重击：生命值上限的0.6%', ['burst.ceremonial-garment-bonus'], '对生命比例不高于50%的海人化羽受益者，核验按心海生命上限0.6%计算的追加量。'],
  ],
  'sayu/passives/0': [
    ['以及附近的友方角色恢复300点生命值', ['skill.someone-more-capable'], '核验确认触发后的治疗公式中的300点固定项，受益者按明确队员核算。'],
    ['早柚的每点元素精通将额外恢复1.2点生命值', ['skill.someone-more-capable'], '核验确认触发后的治疗公式中的1.2倍元素精通项。'],
  ],
  'sayu/passives/1': [['恢复相当于回复量20%的生命值', ['burst.daruma-splash']]],
  'sayu/constellations/5': [['使不倒貉貉的回复量提高3点', ['burst.daruma-mastery', 'burst.daruma-splash-mastery'], '核验已确认的主治疗受益者每点精通追加3点、溅射按20%计算。']],
  'xianyun/constellations/3': [['闲云攻击力的50%/80%/150%', ['skill.cloudwave-1', 'skill.cloudwave-2', 'skill.cloudwave-3']]],
  'xingqiu/passives/0': [['基于行秋最大生命值的6%', ['skill.rain-sword-broken', 'skill.rain-sword-expired']]],
  'yaoyao/passives/1': [['瑶瑶生命值上限的0.8%', ['skill.in-others-shoes', 'burst.in-others-shoes']]],
  'yaoyao/constellations/5': [['基于瑶瑶生命值上限的7.5%', ['skill.mega-radish'], '当次大萝卜已爆炸且在范围内时，核验当前场上角色的单次治疗。']],
  'yumemizukimizuki/constellations/3': [['拾取元素爆发安乐秘汤疗法中的梦见风名物点心时，将同时造成伤害与治疗',
    ['burst.snack-c4-self', 'burst.snack-c4-peer']]],
};

const shieldAbsorption = 'attribute.shieldAbsorption';
const effectiveAbsorption = 'attribute.effectiveShieldAbsorption';
const shieldStrength = 'attribute.shieldStrength';
const lunarElevation = 'attribute.reaction.lunar.elevationFactor';
const stellarConduct = 'attribute.reaction.stellar-conduct.elevation';
const stellarSwirl = 'attribute.reaction.stellar-swirl.elevation';
const reactionElevationProse = {
  'flins/constellations/5': [
    ['菲林斯对敌人造成的月感电反应伤害擢升35%', 'flins.c6-personal-elevation', lunarElevation,
      row => row.probe?.teamFacts?.fullMoonsign === false && row.probe.dealer === 'flins',
      '在未进入满辉时，核验菲林斯本人月感电的35%擢升。'],
    ['月兆·满辉：队伍中附近的所有角色造成的月感电反应伤害擢升10%', 'flins.c6-personal-gleam-elevation', lunarElevation,
      row => row.probe?.teamFacts?.fullMoonsign === true && row.probe.dealer === 'flins',
      '满辉时核验菲林斯本人35%与队伍10%合计为45%。'],
    ['月兆·满辉：队伍中附近的所有角色造成的月感电反应伤害擢升10%', 'flins.c6-team-gleam-elevation', lunarElevation,
      row => row.probe?.dealer === 'ineffa', '用伊涅芙的月感电核验队友的满辉10%及未满辉排除分支。'],
  ],
  'zibai/constellations/5': [
    ['每额外消耗1点「时隙浮光」', 'zibai.c6-stride-elevation', 'attribute.elevationFactor',
      row => row.probe?.hitId === 'zibai.skill.param1', '核验已给定时隙浮光消耗时，灵驹飞踏的普通伤害段擢升。'],
    ['每额外消耗1点「时隙浮光」', 'zibai.c6-stride-elevation', lunarElevation,
      row => row.probe?.hitId === 'zibai.skill.param2', '核验已给定时隙浮光消耗时，灵驹飞踏的直接月结晶段擢升。'],
    ['每额外消耗1点「时隙浮光」', 'zibai.c6-following-hit-elevation', lunarElevation,
      row => row.probe?.hitId === 'zibai.burst.param2', '以爆发直接月结晶段核验已确认窗口内每个超额消耗点的1.6%。'],
    ['每额外消耗1点「时隙浮光」', 'zibai.c6-reaction-elevation', lunarElevation,
      row => row.probe?.family === 'lunar-crystallize', '核验明确归属的月结晶反应贡献在已确认窗口内的擢升。'],
  ],
  'mitya/constellations/5': [
    ['队伍中附近的所有角色造成的星超导反应伤害擢升20%', 'mitya.c6-conduct-elevation', stellarConduct,
      row => ['mitya.normal.param10', 'sandrone.burst.param2'].includes(row.probe?.hitId),
      '用米提亚和桑多涅的直接星超导命中核验队伍20%擢升。'],
  ],
  'odette/constellations/5': [
    ['处于华彩影响下的角色，对敌人造成的星烁反应伤害擢升25%', 'odette.c6-splendor-elevation', stellarConduct,
      row => row.probe?.dealerFacts?.radiance === 'stellar-conduct', '给定受益者的华彩，用星超导命中核验队友25%和本人的合计擢升。'],
    ['处于华彩影响下的角色，对敌人造成的星烁反应伤害擢升25%', 'odette.c6-splendor-elevation', stellarSwirl,
      row => row.probe?.dealerFacts?.radiance === 'stellar-swirl' || row.probe?.family === 'stellar-swirl',
      '核验带华彩的奥黛塔本人直接星扩散及明确反应贡献的45%合计擢升。'],
    ['且奥黛塔对敌人造成的星烁反应伤害额外擢升20%', 'odette.c6-personal-elevation', stellarConduct,
      row => row.probe?.dealer === 'odette' && row.probe.dealerFacts?.radiance === 'stellar-conduct',
      '用无华彩与有华彩的星超导命中核验奥黛塔本人的20%擢升。'],
    ['且奥黛塔对敌人造成的星烁反应伤害额外擢升20%', 'odette.c6-personal-elevation', stellarSwirl,
      row => row.probe?.dealerFacts?.radiance === 'stellar-swirl' || row.probe?.family === 'stellar-swirl',
      '核验带华彩的奥黛塔本人直接星扩散及明确反应贡献的45%合计擢升。'],
  ],
};
const shieldFact = (row, key) => row.probe?.input?.actorFacts?.[row.probe.input.recipient]?.[key]?.value?.value;
const mainLaylaShield = row => shieldFact(row, 'layla.curtainOfSlumberActive') === true;
const coopLaylaShield = row => row.probe?.input?.recipient === 'peer' && !mainLaylaShield(row);
const partyDefenseProse = {
  'dehya/passives/0': [['受到的伤害降低60%', '/passives/0/buffs/0', ['attribute.incomingDamageReduction'],
    '当次赤鬃之血来伤及回收限次就绪已确认时，核验迪希雅自身60%减伤。']],
  'emilie/passives/2': [['对燃烧伤害的火元素抗性提升85%', '/passives/2/buffs/0', ['attribute.resistance.pyro']]],
  'layla/passives/0': [
    ['护盾强效提升6%', '/passives/0/buffs/0', [shieldStrength]],
    ['该效果至多叠加4次', '/passives/0/buffs/0', [shieldStrength], '用已给定层数核验4层上限。'],
  ],
  'layla/constellations/0': [
    ['安眠帷幕护盾的伤害吸收量提高20%', '/talents/1/buffs/0', [shieldAbsorption], '核验当前受益者持有主盾时的一命20%吸收量提升。', mainLaylaShield],
    ['伤害吸收量为安眠帷幕护盾35%的护盾', '/constellations/0/buffs/0', [shieldAbsorption],
      '用已确认次级护盾的联机队友核验按主护盾35%计算。', coopLaylaShield],
    ['对冰元素伤害有250%的吸收效果', '/constellations/0/buffs/0', [effectiveAbsorption],
      '已确认的联机队友盾按冰来伤250%吸收，并对照其他来伤。', coopLaylaShield],
  ],
  'sigewinne/passives/1': [['每1000点生命之契都将提升3%治疗量，至多通过这种方式提升30%治疗量',
    '/passives/1/buffs/0', ['attribute.healingBonus']]],
  'sigewinne/passives/2': [['使该角色的所有元素抗性和物理抗性下降10%', '/passives/2/buffs/0',
    ['physical', 'anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'].map(element => 'attribute.resistance.' + element),
    '按明确的抗性下降状态及实际受益者核验七种元素和物理抗性各下降10%。']],
};
const partyDefenseHealingProse = {
  'lauma/constellations/0': ['回复量相当于菈乌玛元素精通的500%', 'skill.lifeweave',
    '核验明确触发的月绽放按菈乌玛500%元素精通为附近场上角色治疗。'],
  'sigewinne/passives/2': ['总回复量相当于其生命值上限的50%', 'skill.acute-dosage-total',
    '核验明确水下触发且生命严格低于50%时，按受益者生命上限50%计算总治疗。'],
};
const eventGrantProse = {
  'barbara/constellations/5': [['将该角色生命值恢复至100%', 'burst.revival']],
  'qiqi/constellations/5': [['并将其生命值恢复至50%', 'burst.revival']],
  'dahlia/constellations/5': [['将该角色生命值恢复至100%', 'burst.revival']],
  'zhongli/constellations/5': [['回复量为伤害的40%', 'skill.chrysos', '给定玉璋护盾已发生有效受击及本次使用的伤害量，核验其40%回复系数。'],
    ['单次回复量不超过当前角色最大生命值的8%', 'skill.chrysos', '用达到和超过上限的用例核验按当前受益者最大生命值8%封顶。']],
  'lynette/passives/2': [['恢复的水中耐力与生命值提升25%', 'skill.recovery-orb',
    '确认接触、受益者及水团的生命回复基准后，核验25%额外回复。']],
};
const mixedBuffProse = {
  'aether-hydro/constellations/3': [
    ['水纹护盾，对水元素伤害有250%的吸收效果', 0, [shieldAbsorption, effectiveAbsorption]],
  ],
  'beidou/constellations/0': [
    ['伤害吸收量等于生命值上限16%的护盾', 0, [shieldAbsorption]],
    ['该护盾对雷元素伤害有250%的吸收效果', 0, [effectiveAbsorption]],
  ],
  'yanfei/constellations/3': [
    ['伤害吸收量等于生命值上限45%的护盾', 0, [shieldAbsorption]],
    ['该护盾对火元素伤害有250%的吸收效果', 0, [effectiveAbsorption]],
  ],
  'kirara/constellations/1': [
    ['吸收量上限的40%，且对草元素伤害有250%的吸收效果', 0, [shieldAbsorption, effectiveAbsorption]],
  ],
  'kirara/passives/0': [['安全运输护盾的20%', 0, ['attribute.shieldAbsorptionAdded']]],
  'zhongli/passives/0': [['护盾强效提升5%', 0, ['attribute.shieldStrength']]],
  'yoimiya/passives/0': [['将为宵宫提供2%火元素伤害加成', 0, ['attribute.pyroBonus']]],
  'qiqi/constellations/3': [['被度厄真符标记的目标，攻击力下降20%', 0, ['target.attackReduction']]],
  'xinyan/constellations/0': [['普通攻击和重击的攻击速度提升12%', 0, ['attribute.normalAttackSpeed', 'attribute.chargedAttackSpeed']]],
  'wriothesley/constellations/3': [
    ['莱欧斯利的攻击速度提升20%', 0, ['attribute.normalAttackSpeed'], 'on-field'],
    ['自己的角色攻击速度提升10%', 1, ['attribute.normalAttackSpeed'], 'off-field'],
    ['上述这两种攻击速度提升效果无法叠加', 0, ['attribute.normalAttackSpeed'], 'on-field'],
    ['上述这两种攻击速度提升效果无法叠加', 1, ['attribute.normalAttackSpeed'], 'off-field'],
  ],
};

const remainingShieldProse = {
  'kaeya/constellations/3': [
    ['凯亚的生命值低于20%时自动触发', 0, [shieldAbsorption], null, '当次明确可触发时，核验凯亚生命比例严格低于20%的条件。'],
    ['伤害吸收量等于生命值上限30%的护盾', 0, [shieldAbsorption]],
    ['该护盾对冰元素伤害有250%的吸收效果', 0, [effectiveAbsorption]],
  ],
  'noelle/passives/0': [
    ['诺艾尔处于队伍后台，且当前场上自己的角色的生命值低于30%时自动触发', 0, [shieldAbsorption], null,
      '当次明确可触发时，核验后台诺艾尔和另一位场上队员生命比例严格低于30%的条件。'],
    ['伤害吸收量等同于诺艾尔防御力400%的护盾', 0, [shieldAbsorption]],
    ['对所有元素伤害与物理伤害有150%的吸收效果', 0, [effectiveAbsorption]],
  ],
  'dahlia/constellations/1': [['护盾强效提升25%', 0, ['attribute.shieldStrength']]],
  'thoma/passives/0': [
    ['护盾强效提升5%', 0, ['attribute.shieldStrength']],
    ['此效果每0.3秒至多触发一次，至多叠加5次', 0, ['attribute.shieldStrength'], null,
      '核验给定有效层数时的5层上限，实际叠层的0.3秒限次仍需记录。'],
  ],
  'lanyan/constellations/1': [['恢复40%凤缕护盾的伤害吸收量', 0, ['attribute.shieldAbsorptionAdded']]],
};

const talentHealingProse = {
  'bennett/talents/2/description': [['会持续恢复生命值，回复量受益于班尼特的最大生命值', 'burst.param2']],
  'baizhu/talents/1/description': [['游丝徵灵将会返回，为队伍中附近的所有角色恢复生命值', 'skill.param2']],
  'baizhu/talents/2/description': [['无郤气护盾在以下情况下，将会为当前场上自己的角色恢复生命值', 'burst.param5']],
  'charlotte/talents/2/description': [
    ['建立「临事场域」，造成冰元素范围伤害，为队伍中附近的所有角色恢复生命值', 'burst.param1'],
    ['持续为其中的当前场上角色恢复生命值', 'burst.param4'],
  ],
  'noelle/talents/1/description': [['诺艾尔的普通攻击与重击命中时，都有几率为队伍中所有角色恢复生命值', 'skill.param2']],
  'sangonomiyakokomi/talents/1/description': [['为周围的当前场上角色恢复生命值', 'skill.param1']],
  'sangonomiyakokomi/talents/2/description': [['普通攻击和重击命中敌人时，为队伍中附近的所有角色恢复生命值', 'burst.param2']],
  'yaoyao/talents/1/description': [['为其中的角色恢复生命值，回复量受益于瑶瑶的生命值上限', 'skill.param2']],
  'yaoyao/talents/2/description': [['炸裂时将为队伍中附近的所有角色恢复生命值', 'burst.param2']],
};

const equipmentHealingOutput = 'equipmentHealing';
const equipmentHealingProse = {
  'otherworldlystory/buffs': ['获得元素微粒或元素晶球时，恢复1%生命值', [[0, equipmentHealingOutput]]],
  'recurvebow/buffs': ['击败敌人时，恢复8%生命值', [[0, equipmentHealingOutput]]],
  'travelershandysword/buffs': ['获得元素晶球或元素微粒时，恢复1%生命值', [[0, equipmentHealingOutput]]],
  'whiteirongreatsword/buffs': ['击败敌人时，恢复8%生命值', [[0, equipmentHealingOutput]]],
  'prototypeamber/buffs': ['施放元素爆发后6秒内，每2秒恢复4点元素能量，队伍中的所有角色每2秒恢复4%生命值',
    [[0, equipmentHealingOutput], [1, 'directEnergyRestored']]],
  'adventurer/effects/0': ['生命值上限提高1000点', [[0, 'hp']]],
  'adventurer/effects/1': ['开启各类宝箱后的5秒内，持续恢复30%生命值', [[0, 'equipmentBaseHealingTotal'], [0, 'equipmentBaseHealingTick', 1]]],
  'travelingdoctor/effects/0': ['角色受到的治疗效果提高20%', [[0, 'incomingHealingBonus']]],
  'travelingdoctor/effects/1': ['施放元素爆发时，恢复20%生命值', [[0, equipmentHealingOutput]]],
};

function indexRows(rows, key) {
  const index = new Map();
  for (const row of rows ?? []) {
    const value = key(row);
    const list = index.get(value) ?? [];
    list.push(row);
    index.set(value, list);
  }
  return index;
}

function splitProse(text, boundaries = []) {
  return (text.match(/[^。；\n]+[。；]?/g) ?? []).flatMap(part => {
    const cuts = boundaries.map(phrase => part.indexOf(phrase)).filter(index => index > 0).sort((a, b) => a - b);
    return [0, ...cuts].map((start, index) => part.slice(start, cuts[index]).trim()).filter(Boolean);
  });
}

function exactSetValue(text, target) {
  const match = /^([\p{Script=Han}]+)(?:提高|提升|增加)(\d+(?:\.\d+)?)(%|点)?$/u.exec(text);
  if (match && simpleSetStats[match[1]] === target?.slice('attribute.'.length)) {
    return Number(match[2]) / (match[3] === '%' ? 100 : 1);
  }
}

function quantitativeProbes(rows) {
  return rows.some(row => Number.isFinite(row.expected) && row.expected !== 0)
    && rows.every(row => {
      const value = 'value' in row ? row.value : row.actual;
      return !row.issue && row.status !== 'unavailable' && (row.expected === null ? value === null : matches(value, row.expected));
    });
}

/** Summarize the final audit's scoped evidence without running new calculations. */
export function currentClauseInventory(entities, results) {
  const context = new Map();
  for (const [kind, group] of [['character', entities.characters], ['weapon', entities.weapons], ['set', entities.sets]]) {
    for (const entity of group) context.set(entity.id, { kind, metadata: entity.metadata ?? entity, revision: entity.revision });
  }
  const rows = [];
  function add(entity, field, status, details = {}) {
    const info = context.get(entity), kind = info?.kind ?? details.kind;
    if (!kind) return;
    const document = 'src/game-data/data/' + folders[kind] + '/' + entity + '.json';
    const refs = unique([document + '#' + field, details.refs ?? []]);
    rows.push({ entity, kind, revision: info?.revision, field, status, ...details, refs,
      ...(needed[status] ? { needed: details.needed ?? needed[status] } : {}) });
  }

  const calculators = results.calculator;
  const equipmentProseProofs = makeEquipmentProseProofs(entities, results);
  const equipmentAuraProse = makeEquipmentAuraProseProofs(entities, results);
  const characterMovementDefenseProse = makeCharacterMovementDefenseProse(entities, results);
  const characterTriggerProse = makeCharacterTriggerProse(entities, results);
  const hits = indexRows(results.evaluatedHits, row => fieldKey(row.entity, '/' + row.hit));
  const manekinCases = indexRows(results.manekin.rows, row => row.entity);
  const provenHits = indexRows(calculators.hits.filter(row => row.selected && !row.issue && !row.comparison?.issue
    && row.comparison?.value > 0 && matches(row.comparison.value, row.comparison.expected)), row => row.entity);
  const provenEquipmentHits = indexRows(calculators.equipmentHits.filter(row => row.selected && !row.issue && !row.comparison?.issue
    && row.comparison?.value > 0 && matches(row.comparison.value, row.comparison.expected)), row => row.entity);
  const menu = indexRows(calculators.buffs, row => row.entity);
  const gear = indexRows(results.equipment.rows.filter(row => row.kind === 'weapon' || row.count === row.pieces),
    row => fieldKey(row.entity, row.field));
  const gaps = indexRows(results.equipment.gaps, row => fieldKey(row.entity, row.field));
  const characterClauses = indexRows(results.characterClauses.rows, row => fieldKey(row.entity, row.field));
  const primaryRows = new Map();
  const sourceRefs = row => [row.source, row.sources ?? [], row.sourceRefs ?? []].flat();
  function proof(audit, entity, field, { exact = false } = {}) {
    if (!results[audit]?.rows) return null;
    if (!primaryRows.has(audit)) primaryRows.set(audit, indexRows(results[audit].rows, row => row.entity));
    const matchesField = row => exact ? row.field === field : covers(field, row.field);
    const cases = (primaryRows.get(audit).get(entity) ?? []).filter(matchesField);
    if (!quantitativeProbes(cases)) return null;
    return { audit, field, cases: cases.length, refs: unique(cases.flatMap(sourceRefs)) };
  }

  for (const selected of [...calculators.hits, ...calculators.equipmentHits]) {
    const { entity, field, hit, comparison } = selected;
    const reading = hits.get(fieldKey(entity, '/' + hit))?.[0];
    const comparisonPasses = !selected.issue && selected.selected && !comparison?.issue
      && matches(comparison?.value, comparison?.expected)
      && (!reading || !reading.issue && matches(reading.value, reading.expected));
    const open = results.interpretations.find(entry => entry.entity === entity
      && entry.fields.some(pointer => pointer.includes('/' + hit + '/')));
    add(entity, field, comparisonPasses ? 'available' : selected.selected ? 'bound-unverified' : 'needs-binding', {
      subject: 'hit', hit, text: selected.name, inputs: selected.inputs,
      comparison, ...(open ? { scope: open.reason } : {}),
      refs: unique([sourceRefs(selected), reading ? 'evaluatedHits#' + entity + field : null]),
    });
  }

  const verifiedDetails = new Map();
  for (const audit of ['talentGrants', 'talentTable', 'talentDetailsCurrent', 'talentHealing', 'shields', 'bennettInspiration', 'remainingAttributeDetails', 'nicoleCap']) {
    for (const key of results[audit]?.verified ?? []) {
      const list = verifiedDetails.get(key) ?? [];
      list.push(audit);
      verifiedDetails.set(key, list);
    }
  }
  const relevantDetails = new Set(['治疗量', '护盾吸收量', '属性或机制']);
  for (const detail of results.talentDetails.filter(row => relevantDetails.has(row.kind))) {
    const { entity, field, name, template } = detail;
    const audits = verifiedDetails.get(fieldKey(entity, field)) ?? [];
    const proofs = audits.map(audit => proof(audit, entity, field, { exact: true })).filter(Boolean);
    const isBound = (detail.boundContributionParameters?.length ?? 0) > 0
      || (results.recoveryGaps ?? []).some(row => row.entity === entity && row.field === field)
      && (results.auditFailures ?? []).some(row => row.entity === entity && row.field === field && row.expected !== undefined);
    const status = detail.missingContributionParameters?.length ? 'needs-binding'
      : proofs.length ? 'available' : isBound ? 'bound-unverified' : 'needs-review';
    add(entity, field, status, { subject: 'detail', name, text: template, proofs, parameters: detail.parameters,
      ...(detail.missingContributionParameters?.length ? { missing: detail.missingContributionParameters } : {}),
      refs: proofs.flatMap(entry => entry.refs) });
  }

  const characterProofs = new Map();
  for (const clause of results.currentClauseEvidence) {
    const key = fieldKey(clause.entity, clause.field);
    const evidence = clause.evidence.map(entry => {
      const checked = proof(entry.audit, clause.entity, entry.field);
      return checked && { ...checked, wholeField: entry.wholeField };
    }).filter(Boolean);
    if ((results.characterBuffs?.verified ?? []).includes(key)) {
      const checked = proof('characterBuffs', clause.entity, clause.field);
      if (checked) evidence.push({ ...checked, wholeField: true });
    }
    characterProofs.set(key, evidence);
  }

  const effectProofs = new Map();
  const rescueFamilies = {
    'attribute.reaction.transformative.damageBonus': ['swirl', 'electro-charged'],
    'attribute.reaction.lunar.damageBonus': ['lunar-charged'], 'attribute.reaction.stellar-swirl.damageBonus': ['stellar-swirl'],
  };
  const registeredProofs = indexRows(results.registeredModifierEvidence, row => fieldKey(row.entity, row.field));
  const characterStatProofs = indexRows(results.registeredModifierEvidence.filter(row => context.get(row.entity)?.kind === 'character'
    && quantitativeProbes(row.cases) && row.cases.some(reading => reading.expected === 0)
    && row.refs?.some(ref => ref.includes('/ChineseSimplified/'))), row => fieldKey(row.entity, row.field.split('/buffs/')[0]));
  const signedExcerpts = indexRows(results.registeredModifierEvidence.filter(row => row.sourceExcerpt
    && matches(row.actual, row.expected) && /(?:攻击力|防御力|伤害|暴击率|治疗|吸收量|元素充能效率|元素精通|生命值上限)/.test(row.sourceExcerpt)
    && /\d+(?:\.\d+)?(?:%|点|倍)/.test(row.sourceExcerpt) && !/[。；\n]/.test(row.sourceExcerpt)),
    row => fieldKey(row.entity, row.field.split('/buffs/')[0]));
  const conditionAudits = ['mityaSteadyCore', 'conditionalHealingSources', 'confirmedEnergyCases', 'variableWeaponConditions',
    'combatSpeedClauses', 'natlanCurrentResources', 'movementSpeedClauses', 'remainingEnergyFacts', 'characterResourceBuffs', 'equipmentEnergyGrants',
    'equipmentRecoveryRemainders', 'aimChargeBuffs', 'characterEffectRanges', 'directCooldownAmounts', 'conditionalCastCooldowns', 'characterInterruptionResistance', 'confirmedSkillResets', 'yanfeiSealStamina'];
  const targetAudits = ['directEnergy', 'mixedBuffs', 'remainingShieldGrants', 'equipmentHealing', 'partyDefense', 'characterGrants', 'incoming', 'currentEquipment', 'additionalEquipment', 'remainingEquipment', 'bennettInspiration', 'remainingEventGrants', 'fallImmunity', ...conditionAudits];
  const targetRows = new Map(targetAudits.map(name => [name, indexRows(results[name]?.rows, row => row.entity)]));
  const targetFields = new Map(targetAudits.map(name => [name, new Set(results[name]?.verified)]));
  for (const option of calculators.buffs.filter(row => row.target)) {
    const { entity, field, id, listed, target } = option;
    const info = context.get(entity);
    const owner = /^\/(?:passives|constellations|talents|effects)\/\d+/.exec(field)?.[0] ?? '/buffs';
    const declared = gear.get(fieldKey(entity, owner)) ?? [];
    const index = Number(field.split('/').at(-1));
    const idWithModifier = index ? id + '.' + index : id;
    const observed = declared.map(row => row.modifiers?.find(reading => reading.id === idWithModifier));
    const paired = observed.length === declared.length && observed.length > 0;
    const isSet = info?.kind === 'set';
    const source = isSet ? equipmentSource + 'sets.json#/' + entity + '/effect' + declared[0]?.pieces + 'Pc'
      : equipmentSource + 'weapons.json#/' + entity + '/metadata';
    const check = modifierChecks[idWithModifier];
    const matched = paired && observed.every((reading, i) => {
      const independent = isSet ? exactSetValue(normalized(declared[i].description).replace(/。$/, ''), target) : reading?.sourceValue;
      return reading && !reading.issue && !reading.unverified.length && reading.excluded && matches(reading.amount, independent);
    });
    const evidence = info?.kind === 'character'
      ? (characterProofs.get(fieldKey(entity, owner)) ?? []).filter(entry => entry.field === field)
      : matched ? [{ audit: 'equipment', field, cases: declared.length,
        refs: unique([source, !isSet && check ? modifierSource + '#/' + idWithModifier : null]) }] : [];
    const grant = field.slice(0, field.lastIndexOf('/modifiers/'));
    const rescue = results.ifaRescueReactions;
    if (entity === 'ifa' && ['ifa.rescue-essentials', 'ifa.c2.rescue-essentials'].includes(id) && rescue?.verified.includes(entity + grant)) {
      const families = rescueFamilies[target] ?? [];
      const probes = rescue.rows.filter(row => row.field === owner && families.includes(row.probe.family));
      if (families.length && families.every(family => quantitativeProbes(probes.filter(row => row.probe.family === family)))) {
        evidence.push({ audit: 'ifaRescueReactions', field, target, cases: probes.length, refs: unique(probes.flatMap(sourceRefs)) });
      }
    }
    for (const row of registeredProofs.get(fieldKey(entity, field)) ?? []) {
      if (row.id === id && row.target === target && matches(row.actual, row.expected)) evidence.push({ audit: row.audit, field,
        cases: row.cases.length, scope: row.scope, refs: row.refs });
    }
    const sameTarget = (menu.get(entity) ?? []).filter(candidate => covers(owner, candidate.field) && candidate.target === target);
    for (const name of targetAudits) {
      const verified = targetFields.get(name);
      if (!verified.has(entity + field) && !verified.has(entity + grant) && !verified.has(entity + owner)) continue;
      const probes = (targetRows.get(name).get(entity) ?? []).filter(row => {
        if (row.field !== owner && row.field !== grant && row.field !== field) return false;
        const stat = row.attribute ?? row.output ?? row.stat ?? row.settings?.attribute;
        if (stat !== target && 'attribute.' + stat !== target) return false;
        if (row.field === field && (row.id === id || row.effectId === id || row.modifierId === idWithModifier)) return true;
        const rule = row.effect ?? row.settings?.rule;
        return rule ? rule === idWithModifier || (rule === id && sameTarget.filter(item => item.id === id).length === 1)
          : sameTarget.length === 1;
      });
      const provenZero = probes.some(row => row.expectedContribution === 0) && probes.some(row => row.expectedContribution === null)
        && probes.every(row => row.field === field && !row.issue && row.status === 'known' && row.expected === 0 && row.value === 0
          && (row.expectedContribution === 0 || row.expectedContribution === null) && row.contribution === row.expectedContribution);
      if (quantitativeProbes(probes) || provenZero) evidence.push({ audit: name, field: probes[0].field, target, cases: probes.length,
        refs: unique([info?.kind !== 'character' ? source : null, probes.flatMap(sourceRefs)]) });
    }
    const status = listed && !option.issue ? evidence.length ? 'available' : 'bound-unverified' : 'needs-binding';
    if (evidence.length) effectProofs.set(fieldKey(entity, field), { check, target, evidence });
    add(entity, field, status, { subject: 'modifier', id, target, inputs: option.inputs,
      recipient: option.recipient, supplier: option.supplier, proofs: evidence,
      refs: unique([sourceRefs(option), evidence.flatMap(entry => entry.refs)]) });
  }

  const readingAt = (entity, field) => field.slice(1).split('/').reduce((value, part) => value?.[part], context.get(entity)?.metadata);
  const authoredRef = (entity, field) => 'src/game-data/data/' + folders[context.get(entity).kind] + '/' + entity + '.json#' + field;
  const capturedCharacter = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';
  const resolutionAudits = ['grantedHealing', 'mixedBuffs', 'remainingShieldGrants', 'equipmentHealing', 'partyDefense', 'reactionElevation',
    'triggeredStrikes', 'bennettInspiration', 'remainingEventGrants', 'ifaRescueReactions', 'fallImmunity', 'columbinaRevival', 'additionalConstellationHits', ...conditionAudits];
  const resolutions = new Map(resolutionAudits.map(name => [name, indexRows(results[name]?.resolved, row => fieldKey(row.entity, row.field))]));
  const resolvedAt = (audit, entity, field) => resolutions.get(audit)?.get(fieldKey(entity, field))?.[0];
  const verifiedFields = new Map();
  function verifiedAt(audit, entity, field) {
    if (!verifiedFields.has(audit)) verifiedFields.set(audit, new Set(results[audit]?.verified));
    return verifiedFields.get(audit).has(fieldKey(entity, field));
  }

  function entriesFor(audit, entity, field) {
    if (!primaryRows.has(audit)) primaryRows.set(audit, indexRows(results[audit]?.rows, row => row.entity));
    return (primaryRows.get(audit).get(entity) ?? []).filter(row => row.field === field);
  }

  function caseProof(audit, entity, sourceField, field, filter, scope, refs = [], declarationEntity = entity) {
    const cases = entriesFor(audit, entity, sourceField).filter(filter);
    if (!quantitativeProbes(cases)) return [];
    return [{ audit, field, sourceField, cases: cases.length, scope, refs: unique([
      authoredRef(declarationEntity, field), cases.flatMap(sourceRefs), refs,
    ]) }];
  }

  function findHeal(entity, key) {
    const [category, id] = key.split('.');
    const talents = context.get(entity)?.metadata.talents ?? [];
    const index = talents.findIndex(talent => talent.category === category);
    const heals = talents[index]?.heals ?? [];
    const healIndex = heals.findIndex(heal => heal.id === entity + '.' + category + '.heal.' + id);
    return healIndex === -1 ? null : { heal: heals[healIndex], field: '/talents/' + index + '/heals/' + healIndex, index };
  }

  // The twins share source wording, but each reading must prove its own declaration.
  const proseKey = (entity, field) => entity.replace(/^lumine-(anemo|hydro)$/, 'aether-$1') + field;

  function linkedGrantedHeals(entity, field, statement) {
    const clause = grantedHealingProse[proseKey(entity, field)]?.find(([phrase]) => statement.includes(phrase));
    if (!clause) return null;
    const [, group, rank] = field.split('/');
    const origin = group === 'passives' ? 'passive' : 'constellation';
    const [, keys, scope] = clause;
    const heals = keys.map(key => findHeal(entity, key));
    return heals.every(entry => entry?.heal.origin?.[origin] === Number(rank)) ? { heals, scope } : null;
  }

  function grantedHealingProofs(entity, field, statement) {
    if (!verifiedAt('grantedHealing', entity, field)) return [];
    const linked = linkedGrantedHeals(entity, field, statement);
    if (!linked) return [];
    const resolution = resolvedAt('grantedHealing', entity, field);
    const scope = linked.scope ?? resolution?.resolved ?? '按本次已确认的触发状态和受益者核验治疗量。';
    const proofs = linked.heals.map(declaration => caseProof('grantedHealing', entity, field, declaration.field,
      row => row.healId === declaration.heal.id, scope));
    return proofs.every(entries => entries.length) ? proofs.flat() : [];
  }

  function grantedHealingBinding(entity, field, statement) {
    const linked = linkedGrantedHeals(entity, field, statement);
    if (!linked) return;
    return { status: 'bound-unverified', scope: '治疗已绑定到由本条款授予的入口，仍需补齐数值和适用条件的独立验证。',
      refs: linked.heals.map(entry => authoredRef(entity, entry.field)) };
  }

  function scopedBuffProofs(audit, mappings, entity, field, statement) {
    const resolution = resolvedAt(audit, entity, field);
    return (mappings[proseKey(entity, field)] ?? [])
      .filter(([phrase]) => statement.includes(phrase)).flatMap(([, buff, targets, mode, scope]) => {
        const pointer = field + '/buffs/' + buff;
        if (!verifiedAt(audit, entity, pointer)) return [];
        const modifiers = readingAt(entity, pointer)?.modifiers ?? [];
        // An elemental effective amount has two modifier branches, both use the same audited output.
        return targets.flatMap(target => {
          if (!modifiers.some(modifier => modifier.target === target)) return [];
          return caseProof(audit, entity, field, pointer, row => row.output === target && (!mode ||
            row.probe?.input?.values?.some(([, key, value]) => key === 'wriothesley.overhealAttackSpeedMode' && value?.value?.value === mode)),
          scope ?? (mode === 'on-field' ? '确认场上溢疗状态后，核验莱欧斯利自身本次20%普攻攻速。'
            : mode === 'off-field' ? '确认后台溢疗状态后，核验队伍本次10%普攻攻速。' : resolution?.resolved))
            .map(entry => ({ ...entry, target }));
        });
      });
  }

  function reactionElevationProofs(entity, field, statement) {
    const audit = 'reactionElevation';
    if (!resolvedAt(audit, entity, field)) return [];
    const buffs = readingAt(entity, field)?.buffs ?? [];
    return (reactionElevationProse[fieldKey(entity, field)] ?? []).filter(([phrase]) => statement.includes(phrase))
      .flatMap(([, id, target, filter, scope]) => {
        const index = buffs.findIndex(buff => buff.id === id);
        const pointer = field + '/buffs/' + index;
        if (index < 0 || !verifiedAt(audit, entity, pointer)) return [];
        const modifier = buffs[index].modifiers.findIndex(entry => entry.target === target);
        return modifier < 0 ? [] : caseProof(audit, entity, field, pointer + '/modifiers/' + modifier, filter, scope)
          .map(entry => ({ ...entry, target }));
      });
  }

  function partyDefenseProofs(entity, field, statement) {
    const audit = 'partyDefense';
    if (!verifiedAt(audit, entity, field)) return [];
    const scope = resolvedAt(audit, entity, field)?.resolved;
    const buffs = (partyDefenseProse[fieldKey(entity, field)] ?? []).filter(([phrase]) => statement.includes(phrase))
      .flatMap(([, pointer, targets, limit, filter]) => {
        const modifiers = readingAt(entity, pointer)?.modifiers ?? [];
        return modifiers.flatMap(({ target, condition }, index) => {
          if (!targets.includes(target)) return [];
          const proven = row => {
            if (row.output !== target || filter && !filter(row)) return false;
            if (entity !== 'layla' || target !== effectiveAbsorption) return true;
            const element = row.probe.input.eventFacts.incomingShieldElement?.value?.value;
            return element != null && (element === 'cryo') === (condition?.call === 'layla.curtain-of-slumber.cryo');
          };
          return caseProof(audit, entity, field, pointer + '/modifiers/' + index, proven, limit ?? scope).map(entry => ({ ...entry, target }));
        });
      });
    const [phrase, key, healScope] = partyDefenseHealingProse[fieldKey(entity, field)] ?? [];
    if (!phrase || !statement.includes(phrase)) return buffs;
    const declaration = findHeal(entity, key);
    const [, group, index] = field.split('/');
    const sourceIndex = declaration?.heal.origin?.[group === 'passives' ? 'passive' : 'constellation'];
    if (sourceIndex !== Number(index)) return buffs;
    return [...buffs, ...caseProof(audit, entity, field, declaration.field, row => row.output === declaration.heal.id, healScope)];
  }

  function eventGrantProofs(entity, field, statement) {
    const audit = 'remainingEventGrants';
    const scope = resolvedAt(audit, entity, field)?.resolved;
    if (!scope) return [];
    const healing = (eventGrantProse[fieldKey(entity, field)] ?? []).filter(([phrase]) => statement.includes(phrase))
      .flatMap(([, key, limit]) => {
        const declaration = findHeal(entity, key);
        if (!declaration || !verifiedAt(audit, entity, declaration.field)) return [];
        return caseProof(audit, entity, field, declaration.field,
          row => row.healId === declaration.heal.id && row.pointer === declaration.field, limit ?? scope);
      });
    if (!healing.length || entity !== 'lynette' || field !== '/passives/2') return healing;
    const pointer = '/passives/2/buffs/0/modifiers/0';
    const target = 'attribute.staminaRestored';
    if (readingAt(entity, pointer)?.target !== target || !verifiedAt(audit, entity, pointer)) return [];
    const stamina = caseProof(audit, entity, field, pointer, row => row.pointer === pointer && row.output === target,
      '确认接触、受益者及水团的水中耐力回复基准后，核验25%额外回复。');
    return stamina.length ? [...healing, ...stamina.map(entry => ({ ...entry, target }))] : [];
  }

  function triggeredStrikeProofs(entity, field, statement) {
    const audit = 'triggeredStrikes';
    const form = /^(manekina?)-(anemo|geo|electro|hydro|pyro|cryo|dendro)$/.exec(entity);
    const source = form?.[1] ?? entity;
    if (!resolvedAt(audit, source, field)) return [];
    if (['manekin', 'manekina'].includes(entity) && field === '/passives/0'
      && statement.includes('如果场上存在奇偶自己创造的「禁限区域」')) {
      const cases = entriesFor(audit, entity, field).filter(row => row.settings?.character === entity && row.settings.element === 'physical');
      if (cases.length !== 1 || cases[0].value !== 0 || cases[0].expected !== 0 || cases[0].issue) return [];
      return [{ audit, field, sourceField: field, cases: cases.length, refs: unique(cases.flatMap(sourceRefs)),
        scope: '本形态无法创建禁限区域，条件不适用。各元素形态的数值由各自的条款证明。' }];
    }
    const mappings = form && field === '/passives/0'
      ? [['造成相当于奇偶攻击力200%的自身元素范围伤害', entity + '.passive.zone-exit', '给定禁限区域在本次离场时爆炸，核验对应元素形态的200%攻击力伤害。']]
      : triggeredStrikeProse[fieldKey(entity, field)] ?? [];
    const isWeapon = context.get(entity)?.kind === 'weapon';
    const hitRoot = isWeapon ? '/hits' : field + '/hits';
    const declarations = readingAt(entity, hitRoot) ?? [];
    return mappings.filter(([phrase]) => statement.includes(phrase)).flatMap(([, hit, scope, filter]) => {
      const index = declarations.findIndex(declaration => declaration.id === hit);
      return index < 0 ? [] : caseProof(audit, source, field, hitRoot + '/' + index,
        row => row.settings?.hit === hit && (!filter || filter(row.settings)), scope, [], entity);
    });
  }

  function bennettAttackProofs(entity, field, statement) {
    if (!bennettAttackBinding(entity, field, statement)) return [];
    const audit = 'bennettInspiration';
    const c1 = field === '/constellations/0';
    const pointer = '/talents/2/buffs/0/modifiers/';
    const proofs = (c1 ? [0, 1] : [0]).map(index => {
      const modifier = pointer + index;
      if (!verifiedAt(audit, entity, modifier)) return [];
      const scope = index === 1 ? '单独核验一命额外采用班尼特基础攻击力的20%。'
        : c1 ? '单独核验一命使原始倍率项在受益者低于、等于70%或生命比例未知时均可生效。'
          : '用班尼特和凯亚核验零命受益者严格高于70%时按班尼特基础攻击力和爆发有效等级取值。';
      return caseProof(audit, entity, modifier, modifier, row => row.attribute === 'attribute.attack' && (c1 || row.probe.constellation === 0), scope);
    });
    return proofs.every(entries => entries.length) ? proofs.flat() : [];
  }

  function otherCharacterProofs(entity, field, statement) {
    if (readingAt(entity, field)?.moonsignLevel === 1 && /(?:^|，)[\p{Script=Han}·]+在队伍中时，队伍的月兆将会上升一级$/u.test(statement)) {
      const readings = entriesFor('characterBuffs', entity, field);
      const key = (rank, others) => readings.some(row => row.settings.key === 'fullMoonsign' && row.settings.others?.length === others
        && row.expected === rank && row.value === rank && !row.issue);
      if (key(0, 0) && key(1, 1)) return caseProof('characterBuffs', entity, field, field + '/moonsignLevel',
        row => ['firstMoonsign', 'fullMoonsign'].includes(row.settings.key), '用该角色单独入队和与另一名月兆角色组队的结果核对月兆等级。');
    }
    const movement = resolvedAt('movementSpeedClauses', entity, field);
    const speed = resolvedAt('combatSpeedClauses', entity, field);
    const movementText = /移动速度(?:提升|提高)\d+%/.test(statement) || statement.includes('迅行效果无法叠加')
      || ['ororon', 'xianyun', 'neuvillette'].includes(entity) && statement === '无法与效果完全相同的固有天赋叠加';
    const speedText = statement.includes('攻击速度') && !statement.includes('变格') && !statement.includes('抗打断');
    if (movement && movementText || speed && speedText) {
      const audit = movement && movementText ? 'movementSpeedClauses' : 'combatSpeedClauses';
      const proofs = [...targetFields.get(audit)].filter(key => key.startsWith(entity + field + '/buffs/') && key.includes('/modifiers/'))
        .flatMap(key => {
          const pointer = key.slice(entity.length);
          return caseProof(audit, entity, pointer, pointer, row => row.output === readingAt(entity, pointer)?.target,
            resolvedAt(audit, entity, field).resolved);
        });
      if (proofs.length) return proofs;
    }
    if (entity === 'furina' && field === '/constellations/1' && verifiedAt('characterBuffs', entity, field)) {
      const pointer = '/talents/2/buffs/0/modifiers/';
      const source = capturedCharacter + 'constellations/furina.json#c2';
      if (statement.includes('获得的「气氛值」提升250%')) return caseProof('characterBuffs', entity, field, pointer + '0',
        row => row.settings.rank === 2 && row.settings.stat === 'damageBonus' && row.settings.changes?.length > 0,
        '以队伍实际生命变化核对二命气氛增长及其对应的爆发增伤。', [source]);
      if (statement.includes('每1点「气氛值」都将使芙宁娜的生命值上限提升0.35%') || statement.includes('生命值上限提升140%')) {
        return caseProof('characterBuffs', entity, field, pointer + '2', row => row.settings.stat === 'hpPercent' && 'points' in row.settings,
          '分别核对未满额、溢出100点与溢出500点时的生命加成，以及未知的溢出量。', [source]);
      }
    }
    if (entity === 'mitya' && field === '/constellations/5' && statement === '稳态：侦测炉心造成原本115%的伤害'
      && verifiedAt('mityaSteadyCore', entity, field + '/buffs/1/modifiers/0')) {
      return caseProof('mityaSteadyCore', entity, field, field + '/buffs/1/modifiers/0', row => row.output === 'attribute.baseMultiplier',
        resolvedAt('mityaSteadyCore', entity, field)?.resolved);
    }
    const conditionalHeal = entity === 'kukishinobu' && field === '/passives/1' && statement.includes('治疗量提升值：元素精通的75%')
      ? '/talents/1/heals/0/extra' : entity === 'vodyanitsa' && field === '/constellations/3' && statement.includes('低于40%：本次治疗量提升50%')
        ? '/talents/1/heals/0/multiplier' : undefined;
    if (conditionalHeal && verifiedAt('conditionalHealingSources', entity, conditionalHeal)) {
      return caseProof('conditionalHealingSources', entity, conditionalHeal, conditionalHeal, () => true,
        resolvedAt('conditionalHealingSources', entity, conditionalHeal)?.resolved);
    }
    if (entity === 'wriothesley' && ['/passives/0', '/constellations/3'].includes(field)) {
      const ascension = field === '/passives/0';
      const phrase = ascension ? '回复量相当于莱欧斯利生命值上限的30%' : '回复量提升为50%生命值上限';
      if (!statement.includes(phrase)) return [];
      const declaration = findHeal(entity, 'normal.rebuke');
      if (declaration?.heal.origin?.passive !== 0 || declaration.heal.basisFactor?.call !== 'wriothesley.rebuke-healing-rate'
        || !verifiedAt('mixedBuffs', entity, declaration.field)) return [];
      return caseProof('mixedBuffs', entity, '/constellations/3', declaration.field,
        row => row.output === 'healing' && (row.probe?.settings?.constellation < 4) === ascension,
        ascension ? '按已确认的凌跃拳命中核验零至三命时的30%生命上限自疗。' : '按已确认的凌跃拳命中核验四命起的50%生命上限自疗。');
    }
    if (entity === 'dori' && field === '/constellations/5') {
      if (statement === '雷元素附魔') {
        const talent = readingAt(entity, '/talents/0');
        return (talent?.hits ?? []).flatMap((hit, index) => {
          const pointer = '/talents/0/hits/' + index + '/infusion';
          if (!hit.infusion || !verifiedAt('mixedBuffs', entity, pointer)) return [];
          return caseProof('mixedBuffs', entity, field, pointer, row => row.output === 'infusion' && row.probe?.hit === hit.id,
            '核验确认附魔有效时的普攻、重击和下落对应雷伤。');
        });
      }
      if (!statement.includes('相当于多莉生命值上限4%的生命值')) return [];
      const declaration = findHeal(entity, 'normal.sprinkling-weight');
      if (declaration?.heal.origin?.constellation !== 5 || !verifiedAt('mixedBuffs', entity, declaration.field)) return [];
      return caseProof('mixedBuffs', entity, field, declaration.field, row => row.output === 'healing',
        '确认本次普攻治疗有效和实际受益者后，核验按多莉生命上限4%计算的治疗。');
    }
    return [];
  }

  function sideEffectProofs(entity, field, statement) {
    if (field === '/constellations/3') {
      const energy = { dehya: '恢复1.5点元素能量', escoffier: '恢复2点元素能量', yumemizukimizuki: '恢复5点元素能量' }[entity];
      if (energy && statement.includes(energy)) {
        const pointer = field + '/buffs/0';
        if (readingAt(entity, pointer)?.id === entity + '.directEnergy.c4' && verifiedAt('directEnergy', entity, pointer)) {
          return caseProof('directEnergy', entity, pointer, pointer, row => row.attribute === 'attribute.directEnergyRestored',
            '核验确认符合回能条件后的当次能量。');
        }
      }
    }
    const hit = {
      'baizhu/constellations/1': ['白术攻击力250%的草元素伤害', 'baizhu.c2.gossamer-sprite', 'characterGrants'],
      'charlotte/constellations/5': ['夏洛蒂攻击力180%的冰元素范围伤害', 'charlotte.burst.c6-coordinated', 'talentGrants'],
      'wriothesley/passives/0': ['造成的伤害提升50%', 'wriothesley.a0.rebuke-vaulting-fist', 'characterGrants'],
    }[fieldKey(entity, field)];
    if (!hit || !statement.includes(hit[0])) return [];
    const entry = calculators.hits.find(row => row.entity === entity && row.hit === hit[1] && row.selected && !row.issue);
    return entry ? caseProof(hit[2], entity, field, entry.field,
      row => row.settings?.hit === hit[1] || hit[2] === 'talentGrants' && ['六命协同冰伤', '未触发协同', '五命锁定'].includes(row.probe),
      '核验所列命中的当次伤害。', sourceRefs(entry)) : [];
  }

  function talentTextProofs(entity, field, statement) {
    return (talentHealingProse[fieldKey(entity, field)] ?? []).filter(([phrase]) => statement.includes(phrase)).flatMap(([, key]) => {
      const entry = findHeal(entity, key);
      if (!entry || field !== '/talents/' + entry.index + '/description' || entry.heal.origin || !Number.isInteger(entry.heal.detail)) return [];
      const detail = '/talents/' + entry.index + '/details/' + entry.heal.detail;
      if (!verifiedAt('talentHealing', entity, detail)) return [];
      const captured = capturedCharacter + 'talents/' + entity + '.json#combat' + (entry.index + 1);
      return caseProof('talentHealing', entity, detail, entry.field, row => !row.healId || row.healId === entry.heal.id,
        '核验相应技能在本次已确认条件下的治疗量和受益者。', [captured, authoredRef(entity, detail)]);
    });
  }

  function normalAttackProofs(entity, field, statement) {
    const root = field.replace(/\/description$/, '');
    if (readingAt(entity, root)?.category !== 'normal') return [];
    const candidates = (provenHits.get(entity) ?? []).filter(row => row.field.startsWith(root + '/hits/'));
    const elements = { 火: 'pyro', 水: 'hydro', 风: 'anemo', 雷: 'electro', 草: 'dendro', 冰: 'cryo', 岩: 'geo' };
    const normal = /^(?:对前方)?进行至多([一二三四五六七八九])段的?(?:连续(?:攻击|剑击|挥砍|枪击|弓箭射击)|攻击|水花攻击|电击)(?:，造成([火水风雷草冰岩])元素(?:范围)?伤害)?$/.exec(statement);
    const aimed = /^(?:释放时，)?聚满了[\p{Script=Han}]+的(?:箭矢|魔箭)(?:会|在命中敌人时|会在命中敌人时)造成(?:高额的)?([火水风雷草冰岩])元素伤害$/u.exec(statement);
    const firstCharge = /^一段蓄力：射出附有([火水风雷草冰岩])元素的箭矢，造成\1元素伤害$/.exec(statement);
    let selected;
    let scope;
    if (normal) {
      const stages = '一二三四五六七八九'.slice(0, '一二三四五六七八九'.indexOf(normal[1]) + 1).split('');
      const attacks = candidates.filter(row => row.category === 'normal' && /^[一二三四五六七八九]段伤害(?:（第\d+击）)?$/.test(readingAt(entity, row.field)?.name));
      if (!stages.every(stage => attacks.some(row => row.name.startsWith(stage))) || attacks.some(row => !stages.includes(row.name[0]))) return [];
      if (normal[2] && attacks.some(row => row.element !== elements[normal[2]])) return [];
      selected = attacks;
      scope = '逐段核对普通攻击的命中身份和数值。';
    } else if (aimed || firstCharge) {
      const name = firstCharge ? '一段蓄力瞄准射击' : '满蓄力瞄准射击';
      const element = elements[(firstCharge ?? aimed)[1]];
      selected = candidates.filter(row => row.category === 'charged' && row.name === name && row.element === element);
      if (selected.length !== 1) return [];
      scope = '用相应蓄力档的箭矢和元素核对单次命中伤害。';
    } else if (['停止旋转时，会进行一次格外有力的挥砍', '重击结束时，会进行一次格外有力的挥砍'].includes(statement)) {
      const cycle = candidates.find(row => row.category === 'charged' && row.name === '重击循环伤害');
      selected = candidates.filter(row => row.category === 'charged' && row.name === '重击终结伤害');
      if (!cycle || selected.length !== 1 || selected[0].comparison.expected <= cycle.comparison.expected) return [];
      scope = '核对终结挥砍的单次伤害，并与同一天赋的循环挥砍独立比较。';
    } else if (statement === '消耗一定体力，瞬间向前方挥出两剑') {
      selected = candidates.filter(row => row.category === 'charged' && /^重击伤害（第[12]击）$/.test(row.name));
      if (new Set(selected.map(row => row.name)).size !== 2) return [];
      scope = '两剑各有独立的重击选项、倍率和实际伤害对照。';
    } else {
      const plunge = /^(?:凝聚([火水风雷草冰岩])元素的力量，)?(?:从空中下坠冲击地面，攻击下落路径上的敌人，并在落地时|从空中射出箭雨，并迅速下坠冲击地面，在落地时|从空中射出箭雨，并迅速下坠冲击地面，攻击下落路径上的敌人，在落地时)造成(?:([火水风雷草冰岩])元素)?范围伤害$/.exec(statement);
      if (!plunge || plunge[1] && plunge[1] !== plunge[2]) return [];
      const names = ['下坠期间伤害', '低空坠地冲击伤害', '高空坠地冲击伤害'];
      selected = candidates.filter(row => row.category === 'plunge' && names.includes(row.name) && (!plunge[2] || row.element === elements[plunge[2]]));
      if (!names.every(name => selected.some(row => row.name === name))) return [];
      scope = '逐项核对下坠期间、低空和高空落地伤害。';
    }
    return selected.map(row => ({ audit: 'evaluatedHits', field: row.field, cases: 1, refs: [
      authoredRef(entity, row.field), 'evaluatedHits#' + entity + row.field,
    ], scope }));
  }

  function manekinProofs(entity, field, statement) {
    if (!/^manekin(?:a)?-[a-z]+$/.test(entity)) return [];
    const probes = manekinCases.get(entity) ?? [];
    const menu = provenHits.get(entity) ?? [];
    const element = context.get(entity).metadata.identity.element;
    if (probes.some(row => row.issue)) return [];
    const skillStrike = field === '/talents/1/description' && statement === '奇偶对附近的敌人进行一次攻击，造成自身元素属性的范围伤害，并迅速后退';
    const zoneStrike = field === '/talents/2/description' && statement === '奇偶唤出跟随自身的「禁限区域」，对附近的敌人造成一次奇偶自身元素属性的伤害';
    const zoneEntry = field === '/talents/2/description' && statement === '此外，敌人进入「禁限区域」时，也会受到一次奇偶自身元素属性的伤害，该效果每0.5秒至多触发一次';
    const zoneExit = field === '/passives/0' && statement.includes('造成相当于奇偶攻击力200%的自身元素范围伤害');
    if (skillStrike || zoneStrike || zoneEntry || zoneExit) {
      const suffix = skillStrike ? 'skill.param1' : zoneStrike ? 'burst.param1' : zoneEntry ? 'burst.param2' : 'passive.zone-exit';
      const selected = menu.find(row => row.hit === entity + '.' + suffix);
      const readings = selected && probes.filter(row => row.hit === selected.hit && row.element === element);
      if (!readings?.some(row => row.value > 0 && matches(row.value, row.expected))) return [];
      if (zoneEntry && ![1, 499, 500, 501].every(time => readings.some(row => row.timeMs === time && (time === 1 || time === 501 ? row.value > 0 : row.value === 0)))) return [];
      if (zoneExit && !probes.some(row => row.field === '/passives/0/locked' && row.value === 0)) return [];
      return [{ audit: 'manekin', field: selected.field, cases: readings.length,
        refs: [authoredRef(entity, selected.field), ...readings.map(row => 'manekin#' + entity + '/' + row.field)], scope: '按本形态的元素和技能记录核验此次命中。' }];
    }
    if (field === '/passives/1' && statement === '奇偶处于队伍后台时，若元素能量低于30%，每秒为自己恢复2点元素能量') {
      const readings = ['/passives/1/energy', '/passives/1/threshold', '/passives/1/locked'].map(field => probes.find(row => row.field === field));
      if (readings.every(Boolean) && readings[0].value?.length && readings[1].value?.length && readings[2].value === 0) return [{ audit: 'manekin', field,
        cases: readings.length, refs: readings.map(row => 'manekin#' + entity + row.field), scope: '按30%门槛、后台状态和突破解锁逐次核对能量变化。' }];
    }
    return [];
  }

  function equipmentTextProofs(entity, field, statement) {
    if (field === '/buffs' && (entity === 'ultimateoverlordsmegamagicsword' && statement.includes('依照她们的数目，攻击力至多进一步提升12%')
      || entity === 'hereticsmoltenblade' && statement.includes('基于上一秒记录的移动距离，使装备者获得最低18%、最高36%的攻击力加成'))) {
      const pointer = '/buffs/2/modifiers/0';
      if (verifiedAt('variableWeaponConditions', entity, pointer)) return caseProof('variableWeaponConditions', entity, pointer, pointer,
        row => row.output === 'attribute.attackPercent', resolvedAt('variableWeaponConditions', entity, pointer)?.resolved);
    }
    const entry = equipmentHealingProse[fieldKey(entity, field)];
    if (!entry || statement !== entry[0]) return [];
    const grants = field === '/buffs' ? field : field + '/buffs';
    return entry[1].flatMap(([index, attribute, grantIndex = 0]) => {
      const base = grants + '/' + grantIndex;
      const buff = readingAt(entity, base);
      const pointer = base + '/modifiers/' + index;
      if (buff?.modifiers?.[index]?.target !== 'attribute.' + attribute || !verifiedAt('equipmentHealing', entity, pointer)) return [];
      const scope = attribute === equipmentHealingOutput ? '按已确认的本次回复和受益者核验治疗量。'
        : attribute === 'directEnergyRestored' ? '按已确认的一次回复核验持有者的能量恢复量。'
          : attribute === 'equipmentBaseHealingTotal' ? '核验持有者已确认完成五秒回复后的基础总量。'
            : attribute === 'equipmentBaseHealingTick' ? '固定游戏配置为每秒回复持有者生命上限的6%，与五秒总量分别核验。' : '按套装件数核验持有者的属性。';
      return caseProof('equipmentHealing', entity, pointer, pointer, row => row.attribute === attribute && (!row.effect || row.effect === buff.id), scope);
    });
  }

  function equipmentCategoryProofs(entity, option, candidate, statement) {
    const match = /^(普通攻击|重击|下落攻击|元素战技|元素爆发)(?:[和与](普通攻击|重击|下落攻击|元素战技|元素爆发))?(?:造成的|的)?(伤害|暴击率|暴击伤害)(?:提升|提高|增加)(\d+(?:\.\d+)?)%$/.exec(statement);
    if (!match) return [];
    const stats = { 伤害: 'attribute.damageBonus', 暴击率: 'attribute.critRate', 暴击伤害: 'attribute.critDamage' };
    const categories = { 普通攻击: 'normal', 重击: 'charged', 下落攻击: 'plunge', 元素战技: 'skill', 元素爆发: 'burst' };
    const grant = readingAt(entity, option.field.split('/modifiers/')[0]);
    const modifier = readingAt(entity, option.field);
    if (!grant || !modifier) return [];
    const appliesTo = modifier.appliesTo ?? grant.appliesTo;
    if (stats[match[3]] !== candidate.target || grant.condition || grant.trigger || modifier.condition
      || !appliesTo?.categories || Object.keys(appliesTo).length !== 1) return [];
    const selected = [categories[match[1]], categories[match[2]]].filter(Boolean);
    if (appliesTo.categories.length !== selected.length || !selected.every(name => appliesTo.categories.includes(name))) return [];
    const value = modifier.value?.refinement?.[0] ?? modifier.value;
    if (!matches(value, Number(match[4]) / 100)) return [];
    return candidate.evidence;
  }

  function bennettAttackBinding(entity, field, statement) {
    if (entity !== 'bennett') return;
    const c1 = field === '/constellations/0' && statement === '美妙旅程的攻击力提升效果不再有生命值限制，数值上追加班尼特基础攻击力的20%';
    const burst = field === '/talents/2/description' && statement.startsWith('领域内的角色如果生命值高于70%，会基于班尼特的基础攻击力');
    if (!c1 && !burst) return;
    const pointer = '/talents/2/buffs/0';
    const grant = readingAt(entity, pointer);
    const [base, extra] = grant?.modifiers ?? [];
    if (grant?.id !== 'bennett.inspiration' || base?.target !== 'attribute.attack' || extra?.target !== 'attribute.attack'
      || base.value?.inputs?.basis?.stat !== 'whiteAttack' || base.value.inputs.rate?.parameter !== 'param4'
      || base.condition?.call !== 'condition.any' || base.condition.inputs?.term0?.call !== 'constellation.one'
      || base.condition.inputs.term1?.call !== 'hp.above70' || extra.value?.inputs?.basis?.stat !== 'whiteAttack'
      || extra.value.inputs.rate !== .2 || extra.condition?.call !== 'constellation.one') return;
    return { status: 'bound-unverified', scope: c1 ? '爆发领域的攻击力贡献绑定一命门槛和20%基础攻击力追加项。'
      : '爆发领域的攻击力贡献绑定基础攻击力与天赋倍率，生命门槛会在一命解除。', refs: [
      authoredRef(entity, pointer + '/modifiers/0'), authoredRef(entity, pointer + '/modifiers/1'),
      capturedCharacter + 'talents/bennett.json#combat3', capturedCharacter + 'constellations/bennett.json#c1',
    ] };
  }

  function prose(row, subject, proofForPart, binding, refs = [], bindingForPart) {
    const { entity, field, text } = row;
    const key = fieldKey(entity, field);
    const owner = key.replace(/\/description$/, '');
    const excerpts = (signedExcerpts.get(owner) ?? []).flatMap(reading => {
      const excerpt = normalized(reading.sourceExcerpt);
      const whole = normalized(text);
      if (whole.indexOf(excerpt) < 0 || whole.indexOf(excerpt) !== whole.lastIndexOf(excerpt)) return [];
      return [{ text: excerpt, audit: reading.audit, field: reading.field, cases: reading.cases.length, scope: reading.scope, refs: reading.refs }];
    });
    const original = normalized(text);
    for (const match of original.matchAll(statIncrease)) {
      const [, stat, number, unit] = match;
      if (stat === '生命值' || (unit === '点') !== (stat === '元素精通') || original.indexOf(match[0]) !== original.lastIndexOf(match[0])) continue;
      const amount = Number(number) / (unit === '%' ? 100 : 1);
      const measured = (characterStatProofs.get(owner) ?? []).filter(probe => {
        const declared = readingAt(entity, probe.field)?.value;
        return probe.target === 'attribute.' + statedStats[stat] && matches(declared?.amount ?? declared, amount)
          && probe.cases.some(reading => matches(reading.expected, amount));
      });
      if (new Set(measured.map(probe => probe.field)).size !== 1) continue;
      for (const probe of measured) excerpts.push({ text: match[0], audit: probe.audit, field: probe.field, cases: probe.cases.length,
        scope: '原文的属性和数值与该修饰项的生效和排除读数相符。', refs: unique([authoredRef(entity, probe.field), probe.refs]) });
    }
    if (subject === 'equipment-clause') {
      const sourceText = normalized(text);
      const rates = /(?:造成(?:额外|等同于)?(?:(\d+(?:\.\d+)?)%攻击力?|攻击力(\d+(?:\.\d+)?)%)(?:的)?(?:小范围物理|额外|范围)?伤害|基于生命值上限的(\d+(?:\.\d+)?)%，造成范围伤害)/g;
      for (const match of sourceText.matchAll(rates)) {
        const ratio = Number(match[1] ?? match[2] ?? match[3]) / 100;
        const stat = match[3] ? 'hp' : 'attack';
        const selected = (provenEquipmentHits.get(entity) ?? []).filter(hit => {
          const { template, inputs } = readingAt(entity, hit.field)?.base ?? {};
          const parameter = inputs?.ratio;
          return template === stat + '-damage-base' && inputs.attribute?.stat === stat
            && matches(typeof parameter === 'number' ? parameter : parameter?.refinement?.[0], ratio);
        });
        if (selected.length !== 1) continue;
        const [hit] = selected;
        excerpts.push({ text: match[0], audit: 'calculator.equipmentHits', field: hit.field, cases: 1,
          scope: '以第一精炼档核对追加命中的基础属性、原文倍率和最终伤害。', refs: unique([refs, authoredRef(entity, hit.field), sourceRefs(hit)]) });
      }
    }
    const branch = field.replace(/\/description$/, '');
    if (subject === 'character-clause' || subject === 'talent-description') {
      const measures = [
        ['characterEffectRanges', /(攻击范围提升|影响范围(?:提升|扩大)|喷火距离提高)(\d+(?:\.\d+)?)(%)/g],
        ['directCooldownAmounts', /(冷却时间(?:减少|降低|缩短))(\d+(?:\.\d+)?)(秒|%)/g],
        ['conditionalCastCooldowns', /(冷却时间(?:减少|降低|缩短))(\d+(?:\.\d+)?)(秒|%)/g],
      ];
      for (const [audit, pattern] of measures) {
        const readings = (targetRows.get(audit).get(entity) ?? []).filter(reading => covers(branch, reading.field)
          && targetFields.get(audit).has(entity + reading.field));
        for (const match of original.matchAll(pattern)) {
          if (original.indexOf(match[0]) !== original.lastIndexOf(match[0])) continue;
          const amount = match[3] === '%' ? Number(match[2]) / 100 : Number(match[2]) * 1000;
          const range = match[1].startsWith('攻击范围') ? 'attribute.attackRangeBonus' : match[1].startsWith('影响范围') ? 'attribute.impactRangeBonus'
            : match[1].startsWith('喷火距离') ? 'attribute.flameReachBonus' : undefined;
          const fields = new Set(readings.filter(reading => (range ? reading.output === range : /CooldownReduction(?:Ms)?$/.test(reading.output)
            && reading.output.endsWith('Ms') === (match[3] === '秒')) && matches(reading.expected, amount)).map(reading => reading.field));
          if (fields.size !== 1) continue;
          const [field] = fields;
          const checks = readings.filter(reading => reading.field === field);
          if (!quantitativeProbes(checks) || !checks.some(reading => reading.expected === 0)) continue;
          excerpts.push({ text: match[0], audit, field, cases: checks.length, scope: '已核对原文规定的单位、当次数值及不生效分支。',
            refs: unique([authoredRef(entity, field), checks.flatMap(sourceRefs)]) });
        }
      }
    }
    for (const audit of ['directEnergy', 'confirmedEnergyCases', 'remainingEnergyFacts', 'equipmentEnergyGrants']) {
      const energyRows = (targetRows.get(audit).get(entity) ?? []).filter(reading => covers(branch, reading.field)
        && (reading.attribute ?? reading.output) === 'attribute.directEnergyRestored' && targetFields.get(audit).has(entity + reading.field));
      if (!energyRows.length) continue;
      for (const match of normalized(text).matchAll(/(?:恢复|回复|返还)(\d+(?:\.\d+)?)点元素能量/g)) {
        const amount = Number(match[1]);
        const grants = new Set(energyRows.filter(reading => matches(reading.value, amount) && matches(reading.expected, amount)
          && (subject !== 'equipment-clause' || (reading.probe?.refinement ?? reading.refinement ?? 1) === 1)).map(reading => reading.field));
        if (grants.size !== 1) continue;
        const pointer = [...grants][0];
        const checks = energyRows.filter(reading => reading.field === pointer);
        if (quantitativeProbes(checks) && checks.some(reading => reading.expected === 0 && reading.value === 0)) {
          excerpts.push({ text: match[0], audit, field: pointer, cases: checks.length,
            scope: '核对本次触发的能量、受益者和不生效分支。', refs: unique(checks.flatMap(sourceRefs)) });
        }
      }
    }
    for (const [index, part] of splitProse(text, mixedProseBoundaries[key]).entries()) {
      const statement = normalized(part).replace(/[，。；]$/, '').replace(/^·\s*/, '');
      const explicit = scopedProse[key]?.find(([phrase]) => phrase === statement);
      const explicitlyAuditedCap = partyDefenseProse[key]?.some(([phrase]) => phrase === statement);
      const standaloneTiming = !explicitlyAuditedCap && timingSentences.some(pattern => pattern.test(statement));
      const linked = subject === 'equipment-clause'
        ? [equipmentProseProofs(entity, field, statement), equipmentAuraProse(entity, field, statement)].map(({ whole, parts }) => ({ proofs: whole, parts }))
        : [characterMovementDefenseProse(entity, field, statement), characterTriggerProse(entity, field, statement)];
      const partial = [...excerpts, ...linked.flatMap(row => row.parts)].filter(entry => statement.includes(entry.text) && entry.text !== statement);
      const independentlyProven = explicit || standaloneTiming ? [] : [...proofForPart(statement), ...linked.flatMap(row => row.proofs),
        ...excerpts.filter(entry => entry.text === statement)];
      const bound = !independentlyProven.length && bindingForPart?.(statement);
      const scope = explicit?.[2] ?? bound?.scope ?? (unique(independentlyProven.map(entry => entry.scope)).join(' ') || undefined);
      const numeric = numericActions.some(pattern => pattern.test(statement));
      const nonNumeric = ['生活用途', '未开放的命座'].includes(row.status)
        || subject === 'talent-description' && talentHeadings.has(statement);
      const status = explicit?.[1] ?? (nonNumeric ? 'non-numeric' : independentlyProven.length ? 'available'
        : standaloneTiming ? 'timeline-only' : bound?.status ?? (numeric ? binding : 'needs-review'));
      const candidates = needed[status] && [...row.hitIds ?? row.hits ?? [], ...row.buffIds ?? row.grants ?? []];
      add(entity, field, status, { subject, name: row.name, text: part, clause: index + 1,
        ...(scope ? { scope } : {}), ...(independentlyProven.length ? { proofs: independentlyProven } : {}),
        ...(partial.length ? { provenParts: partial } : {}),
        ...(candidates?.length ? { candidateIds: candidates } : {}),
        ...(row.pieces ? { pieces: row.pieces } : {}),
        refs: unique([refs, bound?.refs ?? [], ...[...independentlyProven, ...partial].flatMap(entry => entry.refs ?? [])]) });
    }
  }

  for (const clause of results.currentClauseEvidence) {
    const key = fieldKey(clause.entity, clause.field);
    const audit = characterClauses.get(key)?.[0];
    const wholeProofs = (characterProofs.get(key) ?? []).filter(entry => entry.wholeField);
    const branch = readingAt(clause.entity, clause.field);
    const anyBinding = clause.grants?.length || clause.hits?.length || branch?.hits?.length || branch?.buffs?.length;
    const binding = anyBinding ? 'needs-review' : 'needs-binding';
    const document = 'src/game-data/data/characters/' + clause.entity + '.json#' + clause.field + '/description';
    prose(clause, 'character-clause', statement => {
      if (audit?.verifiedLevels && /^(?:[\p{Script=Han}·、，]+的)?(?:技能等级|天赋等级)提[高升]3级$|^(?:至多提升至15级|最多提升至15级)$/u.test(statement)) {
        return [{ audit: 'characterClauses', field: clause.field, refs: [document] }];
      }
      const { entity, field } = clause;
      if (entity === 'yanfei' && field === '/constellations/0'
        && statement === '烟绯进行重击时，每持有一枚丹火印，都会提高烟绯在咏唱期间的抗打断能力，并额外降低本次重击10%的体力消耗') {
        const proofs = [1, 2, 3, 4].flatMap(seals => {
          const grant = branch?.buffs?.findIndex(buff => buff.id === 'yanfei.c1.charged-poise.' + seals) ?? -1;
          if (grant < 0) return [];
          const checks = [['attribute.incomingPoiseDamageMultiplier', 'characterInterruptionResistance'],
            ['attribute.staminaCostReduction.charged', 'yanfeiSealStamina']];
          return checks.flatMap(([target, source]) => {
            const index = branch.buffs[grant].modifiers.findIndex(modifier => modifier.target === target);
            const pointer = `${field}/buffs/${grant}/modifiers/${index}`;
            return index >= 0 && verifiedAt(source, entity, pointer) ? caseProof(source, entity, pointer, pointer,
              row => row.output === target, '按本次重击的印数核对咏唱抗打断和额外体耗减免，并验证命座门槛。') : [];
          });
        });
        return proofs.length === 8 ? proofs : [];
      }
      const fallField = field + '/buffs/0/modifiers/0';
      const precise = [
        ...(entity === 'columbina' && field === '/passives/3' && statement.includes('恢复值基于哥伦比娅的好感等级')
          && verifiedAt('columbinaRevival', entity, field) ? caseProof('columbinaRevival', entity, field, findHeal(entity, 'skill.revival').field,
            row => row.healId === 'columbina.skill.heal.revival', resolvedAt('columbinaRevival', entity, field)?.resolved) : []),
        ...(statement.endsWith('不会承受坠落伤害') && verifiedAt('fallImmunity', entity, fallField)
          ? caseProof('fallImmunity', entity, fallField, fallField, row => row.output === 'attribute.fallDamageReduction', resolvedAt('fallImmunity', entity, field)?.resolved) : []),
        ...(entity === 'ifa' && (field === '/passives/0' && /每1点夜魂值|扩散、星扩散、感电、月感电/.test(statement)
          || field === '/constellations/1' && /超过60点|上限提升50点|需要解锁突破天赋/.test(statement))
          && resolvedAt('ifaRescueReactions', entity, field) ? caseProof('ifaRescueReactions', entity, field, field, () => true,
          '按本次夜魂加持、队伍夜魂值及实际受益人验证普通、月与星反应增伤。') : []),
        ...manekinProofs(entity, field, statement), ...grantedHealingProofs(entity, field, statement),
        ...scopedBuffProofs('mixedBuffs', mixedBuffProse, entity, field, statement),
        ...scopedBuffProofs('remainingShieldGrants', remainingShieldProse, entity, field, statement),
        ...partyDefenseProofs(entity, field, statement), ...reactionElevationProofs(entity, field, statement),
        ...triggeredStrikeProofs(entity, field, statement), ...bennettAttackProofs(entity, field, statement), ...eventGrantProofs(entity, field, statement),
        ...otherCharacterProofs(entity, field, statement), ...sideEffectProofs(entity, field, statement),
      ];
      const scoped = proseKey(entity, field);
      if (precise.length || grantedHealingProse[scoped] || mixedBuffProse[scoped] || remainingShieldProse[scoped]
        || partyDefenseProse[scoped] || partyDefenseHealingProse[scoped] || reactionElevationProse[scoped] || triggeredStrikeProse[scoped] || eventGrantProse[scoped]
        || mixedProseBoundaries[scoped] || scoped === 'bennett/constellations/0' || scoped === 'dori/constellations/5'
        || scoped === 'wriothesley/passives/0' || ownsCharacterTriggerField(entity, field)) return precise;
      if (audit?.grantGate !== false && numericActions.some(pattern => pattern.test(statement))) return wholeProofs;
      return [];
    }, binding, [document], statement => grantedHealingBinding(clause.entity, clause.field, statement)
      ?? bennettAttackBinding(clause.entity, clause.field, statement));
  }

  for (const talent of calculators.talentDescriptions) {
    // The bound hit list does not establish which sentence describes which hit.
    const direct = (results.triggerHitEvidence ?? []).filter(row => row.entity === talent.entity
      && row.field + '/description' === talent.field);
    prose(talent, 'talent-description', statement => [...normalAttackProofs(talent.entity, talent.field, statement),
      ...manekinProofs(talent.entity, talent.field, statement), ...talentTextProofs(talent.entity, talent.field, statement),
      ...bennettAttackProofs(talent.entity, talent.field, statement)],
      'needs-review', direct.flatMap(sourceRefs), statement => bennettAttackBinding(talent.entity, talent.field, statement));
  }

  for (const [key, refinements] of gear) {
    const row = refinements[0];
    if (!row.description) continue;
    const options = (menu.get(row.entity) ?? []).filter(option => row.kind === 'weapon'
      ? option.field.startsWith('/buffs/') : covers(row.field, option.field));
    const source = row.kind === 'weapon' ? equipmentSource + 'weapons.json#/' + row.entity + '/metadata/r1/description'
      : equipmentSource + 'sets.json#/' + row.entity + '/effect' + row.pieces + 'Pc';
    const pending = gaps.get(key) ?? [];
    const hitIds = calculators.equipmentHits.filter(hit => hit.entity === row.entity
      && (row.kind === 'weapon' || covers(row.field, hit.field))).map(hit => hit.hit);
    prose({ ...row, text: row.description, hitIds, buffIds: [...new Set(options.map(option => option.id))] }, 'equipment-clause', statement => {
      const healing = equipmentTextProofs(row.entity, row.field, statement);
      if (healing.length) return healing;
      const triggered = triggeredStrikeProofs(row.entity, row.field, statement);
      if (triggered.length || triggeredStrikeProse[key]) return triggered;
      return options.flatMap(option => {
        const candidate = effectProofs.get(fieldKey(row.entity, option.field));
        if (!candidate) return [];
        const direct = row.kind === 'set' ? Number.isFinite(exactSetValue(statement, candidate.target))
          : candidate.check && new RegExp('^(?:' + candidate.check.pattern + ')$').test(statement);
        return direct ? candidate.evidence : equipmentCategoryProofs(row.entity, option, candidate, statement);
      });
    }, options.length || hitIds.length ? 'needs-review' : 'needs-binding', [source, ...pending.flatMap(sourceRefs)]);

    const exactAudits = ['currentEquipment', 'additionalEquipment', 'remainingEquipment', 'incoming']
      .filter(audit => results[audit]?.verified?.includes(key));
    for (const audit of exactAudits) {
      const scoped = proof(audit, row.entity, row.field);
      if (!scoped) continue;
      add(row.entity, row.field, 'available', { subject: 'equipment-audit', text: row.description,
        pieces: row.pieces, proofs: [scoped], refs: unique([source, scoped.refs]),
        scope: '专项对照只覆盖所列用例中的输出、条件与受益者。' });
    }
  }

  const sourceGaps = indexRows(results.unregisteredClauses?.gaps, row => fieldKey(row.entity, row.field));
  const resolutionGaps = [...resolutions].flatMap(([audit, index]) => [...index.values()].flat().flatMap(row => {
    if (!row.remaining || !context.has(row.entity)) return [];
    const readings = entriesFor(audit, row.entity, row.field);
    if (!quantitativeProbes(readings)) return [];
    const key = proseKey(row.entity, row.field);
    return [{ ...row, reason: row.remaining, status: verifiedValuePendingTiming.has(key) ? 'timeline-only' : 'needs-evidence',
      sources: unique([sourceRefs(row), readings.flatMap(sourceRefs)]) }];
  }));
  const combatGaps = resolutionAudits.flatMap(audit => (results[audit]?.gaps ?? []).map(row => ({ ...row,
    status: row.status ?? (audit === 'equipmentHealing' && row.entity !== 'adventurer' ? 'timeline-only' : 'needs-evidence'),
  })));
  const explicitlyClassified = resolutionAudits.flatMap(audit => (results[audit]?.gaps ?? []).filter(row => row.status));
  const readPending = indexRows([...explicitlyClassified, ...resolutionGaps, ...combatGaps], row => fieldKey(row.entity, row.field) + '\n' + row.reason);
  const manual = [
    ...results.lifecycleGaps.map(row => ({ ...row, lifecycle: true })),
    ...(results.entityFieldGaps ?? []),
    ...(results.unregisteredClauses?.timing ?? []).map(row => ({ ...row, timingCandidate: true })),
    ...results.interpretations.flatMap(row => row.fields.map(field => ({ ...row, field, interpretation: true }))),
    ...resolutionGaps, ...combatGaps,
  ];
  const reported = new Set();
  for (const gap of manual) {
    const key = fieldKey(gap.entity, gap.field);
    const pendingKey = key + '\n' + gap.reason;
    if (reported.has(pendingKey)) continue;
    reported.add(pendingKey);
    const scoped = readPending.get(pendingKey) ?? [];
    const scopedStatus = scoped[0]?.status ?? gap.status;
    const scheduled = scheduledEnergyGrants[key];
    const verifiedEnergy = Number.isInteger(scheduled) && verifiedAt('directEnergy', gap.entity, gap.field + '/buffs/' + scheduled);
    const pendingTimeline = (gap.lifecycle && boundedLifecycle[key])
      || (gap.timingCandidate && (onlyTimelineInAudit.has(key) || verifiedEnergy) && gap.reason)
      || (scopedStatus === 'timeline-only' && gap.reason);
    const numeric = (sourceGaps.get(key) ?? []).some(row => row.reason === gap.reason);
    const status = pendingTimeline ? 'timeline-only' : gap.interpretation || ['needs-evidence', 'unavailable'].includes(scopedStatus) ? 'needs-evidence'
      : numeric ? 'needs-binding' : 'needs-review';
    add(gap.entity, gap.field, status, { subject: 'pending-branch', scope: gap.reason, missing: gap.missing, pieces: gap.pieces,
      ...(pendingTimeline ? { scope: pendingTimeline } : { needed: gap.reason }), refs: unique([
        sourceRefs(gap), scoped.flatMap(sourceRefs), gap.document ? 'src/game-data/data/' + gap.document + '.json#' + gap.field : null,
      ]) });
  }

  const summary = { total: rows.length, byStatus: {}, byKind: {}, bySubject: {} };
  for (const { kind, status, subject } of rows) {
    summary.byStatus[status] = (summary.byStatus[status] ?? 0) + 1;
    for (const counts of [summary.byKind[kind] ??= {}, summary.bySubject[subject] ??= {}]) {
      counts[status] = (counts[status] ?? 0) + 1;
    }
  }
  const unresolved = rows.filter(row => Object.hasOwn(needed, row.status));
  summary.unresolvedProse = unresolved.filter(row => ['character-clause', 'talent-description', 'equipment-clause'].includes(row.subject)).length;
  summary.unresolvedProseWithMeasuredParts = unresolved.filter(row => row.provenParts?.length).length;
  return { rows, summary, gaps: unresolved };
}
