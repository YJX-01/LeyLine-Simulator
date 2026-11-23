import { readContentSource } from './content-source.mjs';
import { loadContentSchema } from './load-content-schema.mjs';
import { auditBuild, novice } from './roster-audit-settings.mjs';

const snapshot = '../data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const catalogue = '../data/sources/catalog/genshin-db/';
const read = path => readContentSource(new URL(path + '.json', import.meta.url));
const growth = read(catalogue + 'characters');
const weaponGrowth = read(catalogue + 'weapons');
const curves = read(catalogue + 'character-curves');
const rates = read(snapshot + 'stats/talents');
const sourceId = id => id.includes('-') ? 'traveler' + id.split('-')[1] : id;
const whiteId = id => id.split('-')[0];
const fieldFor = clause => '/' + (clause[0] === 'a' ? 'passives/' : 'constellations/') + (Number(clause.slice(1)) - 1);
const ascensionFor = clause => ({ a1: 1, a2: 4 }[clause] ?? 0);
const value = (value, unit) => ({ provenance: 'explicit', sourceRefs: [], value: value === null ? null : unit
  ? { kind: 'quantity', unit, value } : { kind: 'boolean', value } });
const inputs = (actor, values) => ({ subject: actor ? { kind: 'actor', id: actor } : { kind: 'event' }, values });

const healCase = (id, clause, talent, name, stat, rate, recipient, evidence, facts, options = {}) =>
  ({ id, clause, talent, key: `${id}.${talent}.heal.${name}`, stat, rate, recipient, evidence, facts, ...options });

// Coefficients and cases are transcribed from the captured text. Curves use captured parameter values directly.
const cases = [
  ...['aether', 'lumine'].flatMap(twin => {
    const anemo = twin + '-anemo', hydro = twin + '-hydro';
    return [
      healCase(anemo, 'a2', 'skill', 'slain-wind', 'hp', .02, 'self', ['风涡剑打败敌人', '每秒恢复2%'], { query: { secondWindTick: true } }),
      healCase(hydro, 'a1', 'skill', 'spotless-waters', 'hp', .07, 'self', ['拾取源水之滴后将恢复7%'], { query: { spotlessWatersPickup: true } }),
      healCase(hydro, 'c6', 'skill', 'tides-of-justice', 'hp', .06, 'party', ['生命值百分比最低', '其生命值上限的6%'],
        { query: { spotlessWatersPickup: true }, recipient: { tidesOfJusticeRecipient: true } }, { recipientBasis: true, ascension: 1 }),
    ];
  }),
  healCase('alyosha', 'a1', 'burst', 'tugarin-active', 'attack', 1.2, 'on-field', ['进行攻击时', '当前场上角色', '120%'],
    { query: { tugarinAttacked: true }, recipient: { tugarinNearbyRecipient: true } }),
  healCase('alyosha', 'c4', 'burst', 'tugarin-lowest', 'attack', .6, 'party', ['进行攻击时', '生命值百分比最低', '60%'],
    { query: { tugarinAttacked: true }, recipient: { tugarinLowestHpRecipient: true } }),
  healCase('baizhu', 'a3', 'skill', 'herbal-nourishment', 'hp', .025, 'on-field', ['与部分采集物交互', '当前场上角色', '2.5%'],
    { query: { herbalNourishmentCollected: true } }),
  healCase('baizhu', 'c2', 'skill', 'gossamer-sprite-splice', 'hp', rates.baizhu.combat2.param2[0], 'party', ['游丝徵灵的20%回复量'],
    { query: { gossamerSpriteReturned: true } }, { flat: rates.baizhu.combat2.param3[0], multiplier: .2 }),
  healCase('charlotte', 'c1', 'burst', 'verification', 'attack', .8, 'party', ['为角色施加「核实」印记', '夏洛蒂攻击力的80%'],
    { query: { verificationTick: true }, recipient: { verificationRecipient: true } }),
  healCase('charlotte', 'c6', 'burst', 'focused-impression', 'attack', .42, 'on-field', ['攻击范围内的当前场上角色', '夏洛蒂攻击力的42%'],
    { query: { 'c6-focus': true, focusHealReady: true }, recipient: { focusHealArea: true } }),
  healCase('dehya', 'a2', 'skill', 'stout-heart-initial', 'hp', .2, 'self', ['低于40%', '生命值上限的20%'],
    { query: { stoutHeartReady: true }, owner: { ':hpRatio': [.399, 'scalar'] } },
    { checks: [['owner', ':hpRatio', [.4, 'scalar'], 'excluded'], ['owner', ':hpRatio', [null, 'scalar'], 'unknown']] }),
  healCase('dehya', 'a2', 'skill', 'stout-heart-tick', 'hp', .06, 'self', ['每2秒', '生命值上限的6%'],
    { query: { stoutHeartTick: true }, owner: { ':hpRatio': [.7, 'scalar'] } }),
  healCase('dehya', 'c4', 'burst', 'flame-ignition', 'hp', .025, 'self', ['炽鬃拳与焚落踢命中敌人', '1.5点元素能量', '生命值上限的2.5%'],
    { owner: { 'directEnergy.c4': true } }),
  healCase('escoffier', 'a1', 'burst', 'restorative-diet', 'attack', 1.3824, 'on-field', ['当前场上角色', '攻击力的138.24%'],
    { query: { restorativeDietTick: true } }),
  healCase('escoffier', 'c4', 'burst', 'restorative-diet-double', 'attack', 1.3824, 'on-field', ['治疗量提升100%', '暴击率', '至多触发7次'],
    { query: { restorativeDietTick: true }, owner: { 'directEnergy.c4': true } }, { ascension: 1, lockedAscension: 0 }),
  healCase('furina', 'a1', 'skill', 'endless-waltz', 'hp', .02, 'party', ['治疗回复量溢出', '生命值上限的2%'],
    { query: { endlessWaltzExternalHeal: true, endlessWaltzOverflow: true, endlessWaltzTick: true }, recipient: { endlessWaltzNearbyRecipient: true } },
    { recipientBasis: true }),
  healCase('furina', 'c6', 'skill', 'center-of-attention', 'hp', .04, 'party', ['每1秒', '芙宁娜生命值上限的4%'],
    { query: { centerOusiaHealTick: true }, recipient: { centerOusiaHealRecipient: true } }),
  healCase('gaming', 'a1', 'skill', 'dance-of-amity', 'hp', .015, 'self', ['踏云献瑞命中敌人后', '生命值上限的1.5%'],
    { query: { danceOfAmityTick: true } }),
  healCase('gaming', 'c1', 'burst', 'man-chai-reunion', 'hp', .15, 'self', ['文仔成功与嘉明会合', '恢复15%生命值'],
    { query: { manChaiReunion: true } }),
  healCase('gorou', 'c4', 'burst', 'lapping-hound', 'defense', .5, 'on-field', ['「难破」或「摧碎」', '领域内的当前场上角色', '防御力的50%'],
    { query: { generalsGloryTick: true }, owner: { burstDomain: true }, recipient: { generalsGloryRecipient: true } }, { geo: true }),
  healCase('iansan', 'a2', 'burst', 'warm-up', 'attack', .6, 'on-field', ['恢复至少1点夜魂值', '伊安珊攻击力的60%'],
    { query: { nightsoulRestored: [1, 'count'], warmUpHealingReady: true }, owner: { warmUpActive: true } },
    { checks: [['query', 'nightsoulRestored', [0, 'count'], 'excluded'], ['query', 'nightsoulRestored', [null, 'count'], 'unknown']] }),
  healCase('ifa', 'a4', 'skill', 'field-medic', 'hp', .4, 'on-field', ['低于40%', '消耗10点燃素为其恢复40%生命值'],
    { query: { fieldMedicPhlogiston: true }, recipient: { ':hpRatio': [.399, 'scalar'] } },
    { recipientBasis: true, checks: [['recipient', ':hpRatio', [.4, 'scalar'], 'excluded'], ['recipient', ':hpRatio', [null, 'scalar'], 'unknown']] }),
  healCase('jean', 'a1', 'normal', 'wind-companion', 'attack', .15, 'party', ['50%的几率', '琴攻击力15%'],
    { query: { windCompanionHit: true, windCompanionRoll: true } }),
  healCase('kaeya', 'a1', 'skill', 'cold-blooded-strike', 'attack', .15, 'self', ['每击中一个单位', '攻击力15%'],
    { query: { frostgnawHit: true } }),
  healCase('kaveh', 'a1', 'skill', 'architects-undertaking', 'elementalMastery', 3, 'self', ['包含烈绽放、超绽放', '元素精通的300%'],
    { query: { dendroCoreDamageTaken: true, architectsUndertakingReady: true } }, { weapon: 'rainslasher' }),
  healCase('sangonomiyakokomi', 'c2', 'skill', 'sea-moon-bonus', 'hp', .045, 'on-field', ['低于或等于50%', '化海月：生命值上限的4.5%'],
    { query: { bakeKurageHealing: true }, recipient: { ':hpRatio': [.5, 'scalar'] } },
    { checks: [['recipient', ':hpRatio', [.501, 'scalar'], 'excluded'], ['recipient', ':hpRatio', [null, 'scalar'], 'unknown']] }),
  healCase('sangonomiyakokomi', 'c2', 'burst', 'ceremonial-garment-bonus', 'hp', .006, 'party', ['低于或等于50%', '普通攻击与重击：生命值上限的0.6%'],
    { query: { garmentHealingHit: true }, owner: { garment: true }, recipient: { ':hpRatio': [.5, 'scalar'] } },
    { checks: [['recipient', ':hpRatio', [.501, 'scalar'], 'excluded'], ['recipient', ':hpRatio', [null, 'scalar'], 'unknown']] }),
  healCase('sayu', 'a1', 'skill', 'someone-more-capable', 'elementalMastery', 1.2, 'party', ['扩散或星扩散', '300点生命值', '额外恢复1.2点生命值'],
    { query: { swirlHealingReady: true }, owner: { ':onField': true } }, { flat: 300, weapon: 'rainslasher' }),
  healCase('sayu', 'a2', 'burst', 'daruma-splash', 'attack', rates.sayu.combat3.param6[0], 'on-field', ['身边的其他场上角色', '回复量20%'],
    { recipient: { darumaSplashRecipient: true } }, { flat: rates.sayu.combat3.param5[0], multiplier: .2 }),
  healCase('sayu', 'c6', 'burst', 'daruma-mastery', 'elementalMastery', 3, 'on-field', ['回复量提高3点', '至多提高6000点回复量'],
    { recipient: { darumaMainHealConfirmed: true } }, { weapon: 'rainslasher' }),
  healCase('sayu', 'c6', 'burst', 'daruma-splash-mastery', 'elementalMastery', .6, 'on-field', ['回复量提高3点', '至多提高6000点回复量'],
    { recipient: { darumaSplashRecipient: true } }, { weapon: 'rainslasher', ascension: 4, lockedAscension: 3 }),
  ...[.5, .8, 1.5].map((rate, index) => healCase('xianyun', 'c4', 'skill', 'cloudwave-' + (index + 1), 'attack', rate, 'party',
    ['1/2/3次步天梯', '50%/80%/150%'], { query: { cloudwaveHealingHit: true, skyladderUses: [index + 1, 'count'] }, recipient: { cloudwaveHealingRecipient: true } },
    { checks: [0, (index + 1) % 3 + 1, null].map(steps => ['query', 'skyladderUses', [steps, 'count'], steps === null ? 'unknown' : 'excluded']) })),
  ...[['broken', '雨帘剑受击破碎'], ['expired', '持续时间结束']].map(([trigger, text]) =>
    healCase('xingqiu', 'a1', 'skill', 'rain-sword-' + trigger, 'hp', .06, 'on-field', [text, '最大生命值的6%'], { query: { ['rainSword-' + trigger]: true } })),
  ...[['skill', 'Throw'], ['burst', 'Jump']].map(([slot, source]) =>
    healCase('yaoyao', 'a2', slot, 'in-others-shoes', 'hp', .008, 'party', ['白玉萝卜炸裂', '生命值上限的0.8%'],
      { recipient: { ['radishRegen' + source]: true } }, { peerOffField: true })),
  healCase('yaoyao', 'c6', 'skill', 'mega-radish', 'hp', .075, 'on-field', ['超厉害·大萝卜', '生命值上限的7.5%'],
    { query: { c6MegaRadishReady: true }, recipient: { megaRadishHealRecipient: true } }),
  ...[['self', 2], ['peer', 1]].map(([kind, multiplier]) => healCase('yumemizukimizuki', 'c4', 'burst', 'snack-c4-' + kind,
    'elementalMastery', rates.yumemizukimizuki.combat3.param3[0], kind === 'self' ? 'self' : 'other', ['同时造成伤害与治疗'],
    { recipient: { snackHealCollector: true, ':hpRatio': [.701, 'scalar'] } }, { flat: rates.yumemizukimizuki.combat3.param7[0], multiplier,
      weapon: 'sacrificialfragments', checks: [['recipient', ':hpRatio', [.7, 'scalar'], 'excluded'], ['recipient', ':hpRatio', [null, 'scalar'], 'unknown']] })),
];

export const confirmedPassiveHealingIds = [...new Set(cases.map(row => row.id))];
export const confirmedPassiveHealingSupportIds = ['kaeya', 'noelle', 'ningguang'];
export const confirmedPassiveHealingWeaponIds = ['rainslasher', 'sacrificialfragments'];
export const confirmedPassiveHealingSetIds = ['maidenbeloved', 'travelingdoctor'];

function sourceFor(id, clause) {
  const group = clause[0] === 'a' ? 'talents' : 'constellations';
  const file = snapshot + 'ChineseSimplified/' + group + '/' + sourceId(id);
  const key = clause[0] === 'a' ? 'passive' + clause.slice(1) : clause;
  return { text: read(file)[key]?.description ?? '', reference: 'tools/' + file.slice(3) + '.json#' + key };
}

function whiteStat(build, stat) {
  const c = growth[whiteId(build.character.id)].stats, w = weaponGrowth[build.weapon.id].stats;
  const promoted = c.promotion[build.ascension];
  const weaponStat = w.base.specialized + (w.promotion[0].specialized ?? 0);
  const specialization = { hp: 'FIGHT_PROP_HP_PERCENT', attack: 'FIGHT_PROP_ATTACK_PERCENT', defense: 'FIGHT_PROP_DEFENSE_PERCENT',
    elementalMastery: 'FIGHT_PROP_ELEMENT_MASTERY' }[stat];
  const specialized = (c.specialized === specialization ? promoted.specialized : 0) + (w.specialized === specialization ? weaponStat : 0);
  if (stat === 'elementalMastery') return specialized;
  const base = c.base[stat] * curves[build.level][c.curve[stat]] + promoted[stat]
    + (stat === 'attack' ? w.base.attack + w.promotion[0].attack : 0);
  return base * (1 + specialized);
}

function expectedAmount(row, owner, receiver, ownerSet, receiverSet, recipientHealth) {
  const { stat, rate, flat = 0, multiplier = 1, recipientBasis } = row;
  let basis = whiteStat(recipientBasis ? receiver : owner, stat);
  if (row.id === 'dehya' && owner.constellation >= 1) basis *= 1.2;
  if (row.id === 'charlotte' && owner.constellation >= 2) basis *= 1.1;
  if (row.id === 'xianyun') basis *= 1.2;
  const outgoing = (ownerSet ? .15 : 0) + (row.id === 'sangonomiyakokomi' ? .25 : 0)
    + (row.id === 'baizhu' && owner.ascension >= 1 && recipientHealth < .5 ? .2 : 0);
  const incoming = receiverSet ? .2 : 0;
  return (basis * rate + flat) * multiplier * (1 + outgoing + incoming);
}

const gapCases = [
  ['barbara', 'c6', '复苏', '治疗加成、受治疗加成如何影响芭芭拉复苏的生命值仍缺独立对照。'],
  ['columbina', 'a4', '复苏', '缺游戏实测的地区边界、复苏生命值舍入、治疗加成及受治疗加成交互。'],
  ['dahlia', 'c6', '复苏', '治疗加成、受治疗加成如何影响塔利雅复苏的生命值仍缺独立对照。'],
  ['qiqi', 'c6', '复苏', '治疗加成、受治疗加成如何影响七七复苏的生命值仍缺独立对照。'],
  ['lynette', 'a3', '环境恢复', '原文确认接触复苏水团的生命和水中耐力增益为25%。仍缺水团基础恢复值、全队归属及是否适用普通治疗增益的一手记录。'],
  ['ifa', 'a4', '环境恢复', '给定受魂附龙的生命上限可核算基础回复量，治疗加成与实际到账仍缺受控对照。'],
  ['sayu', 'a2', '治疗历史', '溅射使用确认的主目标与溅射对象。召唤时属性快照和主目标受治疗加成是否传递仍需原始对照。'],
  ['yumemizukimizuki', 'c4', '治疗历史', '七成以上的点心治疗已核验。还需同次拾取绑定伤害与治疗，并自动应用每次爆发四次的能量限次。'],
];

const resolvedCases = [
  ...['aether', 'lumine'].flatMap(twin => [
    [twin + '-anemo', 'a2', '风涡剑击败后的单次自疗按自身生命上限2%计算。', '需记录击败事件、触发间隔和实际各跳。'],
    [twin + '-hydro', 'a1', '旅行者确认拾取自身水纹剑产生的源水之滴时，自疗按自身生命上限7%计算。', '需自动联结露滴命中、源水之滴生成、数量上限和拾取。'],
    [twin + '-hydro', 'c6', '确认拾取自身水纹剑的水滴且选定附近最低生命比例受益者后，额外治疗按受益者自身生命上限6%计算。', '其他来源的水滴、并列时的择取和自身列入受益名单的范围仍需实测。'],
  ]),
  ['alyosha', 'a1', '图加林发动攻击后，附近场上角色受到120%阿罗夏攻击力的治疗。', '需自动联结图加林攻击事件和实际范围。'],
  ['alyosha', 'c4', '明确附近最低生命比例角色后，额外治疗按60%阿罗夏攻击力计算。', '需自动确定范围及并列时的受益者。'],
  ['baizhu', 'a3', '确认符合条件的采集物交互后，场上角色受到白术生命上限2.5%的治疗。', '需自动识别支持的采集物交互。'],
  ['charlotte', 'c1', '核实印记单跳对确认持有者按80%夏洛蒂攻击力治疗。', '需自动联结元素爆发治疗、印记授予和单个受益者的实际各跳。'],
  ['dehya', 'a2', '立即回复适用严格40%阈值，回复自身生命上限20%。后续单跳按6%独立登记。', '需从受伤前后生命自动识别触发和周期，维护20秒限次。'],
  ['dehya', 'c4', '两种命中确认同一生效条件后恢复自身生命上限2.5%，沿用既有1.5能量条件。', '需自动将命中归属于同一触发，并维护共用0.2秒限次。'],
  ['escoffier', 'a1', '康复食疗有效单跳对附近场上角色按爱可菲攻击力138.24%回复。', '需自动联结施放、逐跳及范围。'],
  ['escoffier', 'c4', '确认暴击率判定成功和限次符合时，同次治疗追加基础量100%，沿用既有2能量条件。', '需自动联结概率判定、持续期延长及单轮7次限额。'],
  ['furina', 'a1', '明确非芙宁娜的来源、溢出与实际受益者后，单跳按每位受益者自己的生命上限2%计算。', '需自动识别原治疗的来源、溢出和范围，并生成各跳。'],
  ['gaming', 'a1', '踏云献瑞命中后的单次自疗按自身生命上限1.5%计算。', '需自动联结命中和0.8秒中的实际各跳。'],
  ['gaming', 'c1', '文仔成功会合单次治疗按嘉明生命上限15%计算。', '需自动联结文仔的会合事件。'],
  ['gorou', 'c4', '大将威仪仅在二或至少三名岩元素角色的对应位阶下治疗场上范围内角色，单跳按五郎防御力50%计算。', '需自动联结领域范围与1.5秒治疗时钟。'],
  ['iansan', 'a2', '热身效应内至少实际恢复1点夜魂值时，按60%伊安珊攻击力治疗场上角色。', '需自动联结夜魂迸发、恢复来源、夜魂变化及2.8秒限次。'],
  ['ifa', 'a4', '明确燃素和地区资格时，场上队员低于40%生命可回复其自身上限40%。', '需处理魂附龙的生命、实际燃素消耗和区域记录。'],
  ['jean', 'a1', '确认琴普攻命中且50%判定成功时，按琴攻击力15%治疗全队。', '需自动登记普通攻击的命中概率事件。'],
  ['kaeya', 'a1', '霜袭每命中一个目标，按凯亚攻击力15%自疗。', '需自动将各命中与单次治疗关联。'],
  ['kaveh', 'a1', '明确草原核或其烈绽放、超绽放命中和0.5秒限次资格后，按卡维精通300%自疗。', '需自动识别入向反应伤害和限次。'],
  ['sangonomiyakokomi', 'c2', '按受益者生命比例判定，恰好50%仍生效，分别追加心海生命上限4.5%及0.6%。', '需把同次基础治疗和追加量自动合并登记。'],
  ['sayu', 'a1', '早柚在场触发扩散或星扩散且可生效后，全队按300加1.2倍精通回复。', '需自动联结反应拥有者及2秒限次。'],
  ['sayu', 'a2', '明确主治疗后的另一场上受益者，溅射按主治疗基础量20%计算，并支持C6追加量。', '召唤时属性快照和主目标受治疗加成传递仍需对照，联机实际溅射目标依记录。'],
  ['xianyun', 'c4', '明确冲击波有效命中后，按本次1/2/3次步天梯分别以闲云攻击力50%/80%/150%治疗实际受益者。', '需自动联结同次鹤云幻化的步天梯和实际命中、范围、5秒限次。'],
  ['xingqiu', 'a1', '受击破碎及持续结束分别登记，各按行秋最大生命6%治疗当前角色。', '需自动读取每柄雨帘剑的结束或破碎记录。'],
  ['yaoyao', 'a2', '明确爆炸时在场受益者后，单跳按瑶瑶生命上限0.8%治疗，受益者可已退场。', '需自动关联两种月桂的爆炸、各原始受益者和持续回复。'],
  ['yumemizukimizuki', 'c4', '七成以上时，明确点心拾取者后也可治疗，并保留本人两倍的回复量。', '需把同次拾取绑定伤害和治疗，并读取每次爆发4次的能量限额。'],
];

function scenarios(row, bonusesAvailable) {
  const rows = [{ title: '有效治疗', status: 'applied' }];
  if (bonusesAvailable) rows.push({ title: '治疗与受治疗加成', status: 'applied', gear: true });
  for (const [scope, facts] of Object.entries(row.facts)) for (const [key, setting] of Object.entries(facts)) {
    if (typeof setting !== 'boolean') continue;
    rows.push({ title: key + '明确不成立', status: 'excluded', fact: [scope, key, false] },
      { title: key + '未记录', status: 'unknown', fact: [scope, key, null] });
  }
  for (const [scope, key, reading, status] of row.checks ?? []) rows.push({ title: key + '边界', status, fact: [scope, key, reading] });
  if (row.recipient === 'self' || row.recipient === 'other') rows.push({ title: '受益身份不符', status: 'excluded', wrongRecipient: true });
  if (row.recipient === 'on-field') rows.push({ title: '受益人不在场', status: 'excluded', field: false },
    { title: '受益人场上状态缺失', status: 'unknown', field: null });
  if (row.recipient === 'party') rows.push({ title: '施救者也受益', status: 'applied', ownerHealed: true });
  if (row.clause[0] === 'c') rows.push({ title: '命座未解锁', status: 'excluded', locked: true });
  if (row.lockedAscension !== undefined || ascensionFor(row.clause) > 0) rows.push({ title: '突破未解锁', status: 'excluded', lockedAscension: true });
  if (row.geo) rows.push({ title: '仅一名岩元素角色', status: 'excluded', geoCount: 1 },
    { title: '三名岩元素角色', status: 'applied', geoCount: 3 });
  return rows;
}

function trialFacts(row, trial, healer, receiver) {
  const when = structuredClone(row.facts);
  if (trial.fact) {
    const [scope, key, reading] = trial.fact;
    when[scope][key] = reading;
  }
  const active = Object.hasOwn(trial, 'field') ? trial.field : !row.peerOffField;
  const receiverHp = when.recipient?.[':hpRatio'] ?? [.75, 'scalar'];
  const actorDefaults = { ':hpRatio': [.85, 'scalar'], ':onField': receiver === healer ? active : !active };
  const receiverDefaults = { ':hpRatio': receiverHp, ':onField': active };
  if (row.id === 'xianyun') actorDefaults.skyladderAttackWindow = true;
  if (row.id === 'gorou') actorDefaults.bannerDomain = false;
  if (row.id === 'alyosha') actorDefaults.hunterPrecision = false;
  if (row.id === 'charlotte') actorDefaults.cameraTargets = [1, 'count'];
  if (row.id === 'iansan') {
    actorDefaults.standardMovement = false;
    actorDefaults.kineticMarkerActive = false;
  }
  const factRows = new Map([[healer, { ...actorDefaults, ...when.owner }]]);
  if (receiver === healer) factRows.set(healer, { ...receiverDefaults, ...factRows.get(healer), ...when.recipient });
  else factRows.set(receiver, { ...receiverDefaults, ...when.recipient });
  const entries = facts => Object.fromEntries(Object.entries(facts).map(([key, reading]) => [key[0] === ':' ? key.slice(1) : row.id + '.' + key,
    Array.isArray(reading) ? value(...reading) : value(reading)]));
  return [...[...factRows].map(([actor, facts]) => inputs(actor, entries(facts))), inputs(null, entries(when.query ?? {}))];
}

export async function auditConfirmedPassiveHealing(entities, engine) {
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const { characters: characterList, weapons: weaponList, sets: setList = [] } = entities;
  const characters = new Map(characterList.map(character => [character.id, character]));
  const weapons = new Map(weaponList.map(weapon => [weapon.id, weapon]));
  const sets = new Map(setList.map(set => [set.id, set]));
  const reference = character => ({ namespace: character.namespace, id: character.id, revision: character.revision });
  const build = (id, { ascension = 0, rank = 0, weapon, set } = {}) => {
    const character = characters.get(id);
    if (!character) throw new Error('缺少治疗校验角色 ' + id);
    return { ...auditBuild(character, weapons.get(weapon ?? novice[character.identity.weaponType]), set ? [set] : []),
      ascension, level: ascension ? growth[whiteId(id)].stats.promotion[ascension].maxlevel : 1, constellation: rank,
      ...(set && { theoreticalSetSlots: set.slots.slice(0, 2).map(slot => ({ slot, setId: set.id })) }) };
  };
  const rows = [];
  for (const row of cases.filter(test => characters.has(test.id))) {
    const { id, clause } = row;
    const field = fieldFor(clause);
    const source = sourceFor(id, clause);
    const metadata = characters.get(id).talents.find(talent => talent.category === row.talent)?.heals?.find(heal => heal.id === row.key);
    const rank = clause[0] === 'c' ? Number(clause.slice(1)) : 0;
    const declared = clause[0] === 'a' ? metadata?.origin?.passive : metadata?.origin?.constellation;
    const sourceConfirmed = declared === Number(clause.slice(1)) - 1 && row.evidence.every(fragment => source.text.includes(fragment));
    if (!sourceConfirmed) {
      rows.push({ entity: id, field, healId: row.key, scenario: '来源', source: source.reference, issue: '治疗入口或抓取原文不符' });
      continue;
    }
    const groups = new Map();
    for (const trial of scenarios(row, sets.has('maidenbeloved') && sets.has('travelingdoctor'))) {
      const key = JSON.stringify([!!trial.gear, !!trial.locked, !!trial.lockedAscension, trial.geoCount ?? (row.geo ? 2 : 0)]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(trial);
    }
    for (const [key, trials] of groups) {
      const [bonuses, locked, lockedAscension, geoCount] = JSON.parse(key);
      const project = createEmptyProject();
      project.enemy = defaultEnemy();
      const ownerSet = bonuses ? sets.get('maidenbeloved') : undefined;
      const peerSet = bonuses ? sets.get('travelingdoctor') : undefined;
      const ascension = lockedAscension ? row.lockedAscension ?? ascensionFor(clause) - 1 : row.ascension ?? ascensionFor(clause);
      const ownerBuild = build(id, { rank: locked ? rank - 1 : rank, ascension, weapon: row.weapon, set: ownerSet });
      const peerBuild = build(id === 'kaeya' ? 'noelle' : 'kaeya', { set: peerSet });
      const owner = addActorFromBuild(project, ownerBuild), peer = addActorFromBuild(project, peerBuild);
      if (geoCount >= 2) addActorFromBuild(project, build('noelle'));
      if (geoCount >= 3) addActorFromBuild(project, build('ningguang'));
      const queries = trials.map((trial, order) => {
        const same = trial.ownerHealed || (row.recipient === 'self' ? !trial.wrongRecipient : row.recipient === 'other' && trial.wrongRecipient);
        const receiver = same ? owner : peer;
        const record = 'heal-' + order;
        const facts = trialFacts(row, trial, owner, receiver);
        project.timeline.push({ id: record, kind: 'state-change', timeMs: 1000, order, actor: owner, definition: project.candidate.actors[0].character,
          talentHeal: { definition: reference(ownerBuild.character), healId: row.key, recipientId: receiver, facts } });
        return { record, trial, receiver, same, expected: trial.status === 'applied'
          ? expectedAmount(row, ownerBuild, same ? ownerBuild : peerBuild, ownerSet, !same && peerSet, row.facts.recipient?.[':hpRatio']?.[0])
          : trial.status === 'excluded' ? 0 : null };
      });
      const before = JSON.stringify(project);
      const timeline = engine.evaluateTimeline(project);
      const changes = timeline.combatChanges?.filter(change => change.kind === 'talent-healing') ?? [];
      const intact = JSON.stringify(project) === before;
      for (const { record, trial, receiver, same, expected } of queries) {
        const matches = changes.filter(change => change.source === record);
        const output = matches[0];
        const actual = output?.healing ?? null;
        const sameAmount = actual === expected || actual !== null && expected !== null && Math.abs(actual - expected) < 1e-7;
        const passed = intact && changes.length === queries.length && matches.length === 1 && output?.actor === owner
          && output.recipient === receiver && output.effect === row.key && output.status === trial.status && sameAmount;
        rows.push({ entity: id, field, healId: row.key, source: source.reference, scenario: trial.title, recipient: same ? 'owner' : 'peer',
          expectedStatus: trial.status, actualStatus: output?.status ?? null, expected, actual,
          ...(!passed && { issue: '治疗数值、来源、受益身份、资格或运行隔离不符', missing: output?.missing ?? timeline.issues }) });
      }
    }
  }
  const passed = new Map();
  for (const row of rows) {
    const key = row.entity + row.field;
    passed.set(key, !row.issue && (passed.get(key) ?? true));
  }
  const verified = new Set([...passed].filter(([, good]) => good).map(([key]) => key));
  const gaps = gapCases.filter(([entity]) => characters.has(entity)).map(([entity, clause, kind, reason]) => ({ entity,
    field: fieldFor(clause), kind, sources: [sourceFor(entity, clause).reference], needed: reason, reason }));
  const resolved = resolvedCases.map(([entity, clause, resolved, remaining]) => ({ entity, field: fieldFor(clause), resolved, remaining }))
    .filter(row => verified.has(row.entity + row.field));
  return { rows, verified, gaps, resolved, summary: { confirmedPassiveHealingClauses: verified.size, confirmedPassiveHealingScenarios: rows.length,
    confirmedPassiveHealingFailures: rows.filter(row => row.issue).length } };
}
