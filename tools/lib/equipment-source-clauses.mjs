import { readContentSource } from './content-source.mjs';

const sourceRoot = 'tools/data/sources/catalog/genshin-db/';
const weapons = readContentSource(new URL('../data/sources/catalog/genshin-db/weapons.json', import.meta.url));
const sets = readContentSource(new URL('../data/sources/catalog/genshin-db/sets.json', import.meta.url));
const normal = text => text.replaceAll('**', '').trim().replace(/[，。；]$/, '').replace(/^·\s*/, '');
const attack = 'attackPercent';
const damage = 'damageBonus';
const crit = 'critRate';
const mastery = 'elementalMastery';
const energy = 'energyRecharge';
const contexts = 'equipmentContexts';
const current = 'currentEquipment';
const additional = 'additionalEquipment';
const remaining = 'remainingEquipment';
const mixed = 'mixedEquipmentModifierNumbers';
const energyGrant = 'equipmentEnergyGrants';
const weaponField = '/buffs';
const set2 = '/effects/0';
const set4 = '/effects/1';
const base = 'baseDamageBonus';
const skills = ['normal', 'charged', 'plunge', 'skill', 'burst'];
const rankPath = (id, rank) => `weapons.json#/${id}/metadata/r${rank}/description`;
const setPath = (id, pieces) => `sets.json#/${id}/effect${pieces}Pc`;

const rules = [];
const buff = (suffix, target, occurrence = 0) => ({ suffix, target: 'attribute.' + target, occurrence });
const check = (audit, field, grants, required, select = () => true) => ({ audit, field, grants, required, select });
const context = (field, grants, required, select) => check(contexts, field, grants, required, select);
const weapon = (id, sentence, scope, checks, part) => rules.push({ id, field: weaponField, sentence, scope, checks, part });
const set = (id, pieces, sentence, scope, checks, part) =>
  rules.push({ id, field: pieces === 2 ? set2 : set4, pieces, sentence, scope, checks, part });

const each = (key, values, rest = {}) => values.map(value => ({ ...rest, [key]: value }));
const categories = (values, rest) => each('category', values, rest);
const layerCases = (layers, rest) => each('layers', layers, rest);
const ownerAndPeer = rest => each('recipient', ['actor', 'peer0'], rest);
const selectStat = stat => settings => settings.stat === stat;
const selectCategory = category => settings => settings.category === category;
const near = (value, expected) => Number.isFinite(value) && Number.isFinite(expected) && Math.abs(value - expected) < 1e-7;

for (const id of ['akuoumaru', 'wavebreakersfin', 'mouunsmoon']) {
  const cost = id === 'wavebreakersfin' ? 90 : 80;
  weapon(id, '队伍中所有角色的元素能量上限的总和，每1点能使装备此武器的角色的元素爆发造成的伤害提高0.12%，通过这种方式，元素爆发造成的伤害至多提高40%',
    '按持有者和队友的能量上限合计计算爆发增伤，覆盖无能量队友、缺失资料、上限封顶和非爆发排除。',
    [context('/buffs/0', [buff('watatsumi', damage)], [
      { category: 'burst', energy: cost, party: [] }, { category: 'burst', energy: 340 },
      { category: 'burst', party: ['skirk'], energy: cost }, { category: 'burst', energy: null },
      { category: 'skill', energy: 340 },
    ])]);
}

for (const id of ['blackcliffagate', 'blackclifflongsword', 'blackcliffpole', 'blackcliffslasher', 'blackcliffwarbow']) {
  const checks = [context(attack, [buff('defeat', attack)], [
    { time: 1, count: 1 }, { time: 2001, count: 3 }, { time: 4301, count: 3 },
    { time: 30000, count: 3 }, { time: 31000, count: 2 }, { time: 32000, count: 1 }, { time: 33000, count: 0 },
  ])];
  const scope = '按持有者击败记录核验每层攻击力、四次击败时的三层上限及各层独立到期。';
  weapon(id, '击败敌人后，攻击力提升12%，持续30秒', scope, checks);
  weapon(id, '该效果至多叠加3层，每层持续时间独立', scope, checks);
}
for (const id of ['lithicblade', 'lithicspear']) {
  const checks = [context('/buffs/0', [buff('liyue', attack), buff('liyue', crit)],
    [attack, crit].flatMap(stat => [
      ...each('owner', id === 'lithicblade' ? ['noelle', 'beidou'] : ['rosaria', 'xiangling'], { others: [], stat }),
      { others: ['zibai'], stat }, { others: ['aether-geo', 'skirk', 'nicole'], stat },
      { others: ['zhongli', 'zibai', 'xingqiu'], stat }, { others: [null], stat }, { recipient: 'peer0', stat },
    ]))];
  const scope = '对照璃月与非璃月持有者及队友，核验每名璃月角色的攻击力和暴击率贡献、零至四人档位及队友排除。';
  weapon(id, `队伍中每有一位璃月角色，装备${id === 'lithicblade' ? '该' : '此'}武器的角色便获得7%攻击力提升与3%暴击率提升`, scope, checks);
  weapon(id, '至多获得4层提升效果', scope, checks);
}

const rechargeWindow = [
  { time: 1, who: 'actor', category: 'burst', recipient: 'actor', recharge: 1 },
  { time: 11999, who: 'actor', category: 'burst', recipient: 'actor', recharge: 1 },
  { time: 12000, who: 'actor', category: 'burst', recipient: 'actor', recharge: 1 },
  { time: 1, who: 'peer0', category: 'burst', recipient: 'actor', recharge: 1 },
  { time: 1, who: 'actor', category: 'skill', recipient: 'actor', recharge: 1 },
  { time: 1, who: 'actor', category: 'burst', recipient: 'peer0', recharge: 1 },
];
weapon('engulfinglightning', '攻击力获得提升，提升程度相当于元素充能效率超出100%部分的28%，至多通过这种方式提升80%',
  '按持有者实际充能效率核验零值、超出100%部分的换算和封顶，并对照爆发充能和队友。',
  [context('/buffs/1', [buff('attack', attack)], [...rechargeWindow,
    ...each('recharge', [.9, 1.12, 2, 5], { time: 12000, who: 'actor', category: 'burst', recipient: 'actor' }),
  ])]);
weapon('engulfinglightning', '施放元素爆发后的12秒内，元素充能效率提升30%',
  '对照持有者施放爆发、战技及队友施放爆发，核验持有者充能提升和12秒到期。',
  [context('/buffs/0', [buff('burst-recharge', energy)], rechargeWindow)]);

const beaconCases = [
  ...[false, true].flatMap(onField => each('time', [0, 499, 500, 7999, 8000, 8499, 8500], { onField, recipient: 'actor' })),
  { who: 'peer0', key: 'damageTaken' }, { who: 'actor', key: 'damageTaken', val: 0 },
  { who: 'actor', key: 'hpRatioChange' }, { who: 'actor', key: 'targetsDamaged' }, { recipient: 'peer0', time: 500 },
];
const beacon = [context('/buffs', [buff('skill', attack), buff('injured', attack)], beaconCases)];
for (const sentence of ['元素战技命中敌人后，攻击力提升20%，持续8秒', '受到伤害后，攻击力提升20%，持续8秒', '上述2种效果角色处于队伍后台时也能触发']) {
  weapon('beaconofthereedsea', sentence, '对照战技命中与受伤各自生效、两段叠加和分别到期，以及场上、后台、队友及零受伤分支。', beacon);
}
weapon('beaconofthereedsea', '此外，不处于护盾庇护下时，生命值上限提高32%', '对照有盾、无盾和队友，核验持有者的生命上限加成。',
  [context('/buffs/2', [buff('unshielded', 'hpPercent')], [...ownerAndPeer({ shielded: false }), ...ownerAndPeer({ shielded: true })])]);

weapon('rainbowserpentsrainbow', '装备者处于队伍后台时，装备者的攻击命中敌人后的8秒内，攻击力提升28%',
  '对照命中时和求值时的上场状态、施放者、事件类型及8秒边界，另核验后台命中刷新与队友排除。',
  [context('/buffs/0', [buff('off-field-hit', attack)], [
    ...each('time', [1, 7999, 8000], { onField: false, now: false, who: 'actor', kind: 'hit' }),
    { onField: true, now: false, who: 'actor', kind: 'hit', time: 1 }, { onField: false, now: true, who: 'actor', kind: 'hit', time: 1 },
    { onField: false, who: 'peer0', kind: 'hit' }, { onField: false, who: 'actor', kind: 'action' },
    ...each('time', [8000, 8499, 8500], { refresh: true, recipient: 'actor' }), { refresh: true, recipient: 'peer0' },
  ])]);

weapon('aquasimulacra', '周围存在敌人时，装备该武器的角色造成的伤害都会提升20%，不论该角色处于场上或是处于队伍后台',
  '对照零个、一个和多名附近敌人，核验持有者在场上及后台的伤害加成。',
  [context(damage, [buff('nearby-bonus', damage)], [false, true].flatMap(onField => each('count', [0, 1, 2, 3], { onField })))]);
const spindle = context('/buffs/0', [buff('defense-skill-base.base', base)], [
  ...[false, true].flatMap(field => each('time', [0, 99, 100, 1499, 1500, 1599, 1600], { field, recipient: 'actor', category: 'skill' })),
  { category: 'normal', time: 0, recipient: 'actor' }, { category: 'burst', time: 0, recipient: 'actor' },
  { category: 'skill', time: 0, recipient: 'peer0' }, { who: 'peer0', category: 'skill', targets: 1 },
  ...each('targets', [0, null], { who: 'actor', category: 'skill' }),
]);
weapon('cinnabarspindle', '元素战技造成的伤害值提高，提高数值相当于防御力的40%',
  '按已有伤害记录和给定防御力，核验持有者战技的基础伤害增加量与其他类别、目标或受益者排除。', [spindle]);
weapon('cinnabarspindle', '该效果每1.5秒最多触发一次，并将在元素战技造成伤害后的0.1秒后清除效果',
  '用已记录的战技伤害命中核验100毫秒清除、1500毫秒再触发和未造成伤害的分支。', [spindle]);
for (const [sentence, fragment, grants, eligible] of [
  ['身边至少有2个敌人时，获得16%攻击力提升与16%防御力提升', '获得16%攻击力提升与16%防御力提升',
    [[attack, 'multiple'], ['defensePercent', 'multiple']], [1, 2, 3]],
  ['身边的敌人少于2个时，获得24%攻击力提升', '获得24%攻击力提升', [[attack, 'single']], [0, 1, 2]],
]) {
  weapon('deathmatch', sentence, '按给定的已更新附近敌人数对照少于两名与至少两名的当前属性档位。',
    grants.map(([stat, suffix]) => context(stat, [buff(suffix, stat)], [true, false].flatMap(onField => each('count', eligible, { onField })))),
    fragment);
}

weapon('twinnephrite', '击败敌人后的15秒内，移动速度和攻击力提升12%', '核验持有者击败后两项属性的单层数值和15秒独立窗口。',
  [attack, 'movementSpeed'].map(stat => context(stat, [buff('defeat', stat)], [{ time: 1, count: 1 }, { time: 16000, count: 1 }, { time: 18000, count: 0 }])));
for (const [id, sentence, part, suffix, stat, cast, ms] of [
  ['oathsworneye', '施放元素战技后，元素充能效率提升24%，持续10秒', undefined, 'recharge', energy, 'skill', 10000],
  ['skyridersword', '施放元素爆发后，提高12%攻击力和移动速度，持续15秒', '提高12%攻击力', 'swiftness', attack, 'burst', 15000],
  ['tamayurateinoohanashi', '施放元素战技时，提高20%攻击力和10%移动速度，持续10秒', '10%移动速度', 'swiftness', 'movementSpeed', 'skill', 10000],
  ['lightbearingmoonshard', '装备者施放元素战技后的5秒内，月结晶反应伤害提升64%', undefined, 'lunar-crystallize', 'reaction.lunar.damageBonus', 'skill', 5000],
]) {
  weapon(id, sentence, '对照持有者施放、错误动作、队友施放和到期边界，核验该项属性。',
    [context(stat, [buff(suffix, stat)], [
      ...each('time', [1, ms - 1, ms], { who: 'actor', cast, family: 'lunar-crystallize' }),
      { who: 'peer0', cast }, { who: 'actor', cast: 'normal' }, { who: 'actor', cast, family: 'ordinary' },
    ])], part);
}

const hamayumi = ['normal', 'charged'].flatMap(category => [
  ...each('energy', [0, 39.999, 40, null], { recipient: 'actor', category }), { recipient: 'peer0', category, energy: 40 },
]).concat(categories(['plunge', 'skill', 'burst'], { recipient: 'actor', energy: 40 }));
weapon('hamayumi', '普通攻击造成的伤害提升16%，重击造成的伤害提升12%', '用未满及已满的能量、其他攻击类别和队友核验普攻与重击各自的增伤。',
  [context('/buffs', [buff('normal.damageBonus', damage), buff('charged.damageBonus', damage)], hamayumi)]);
weapon('hamayumi', '当装备该武器的角色元素能量等于100%时，这个效果提升100%', '对照差一点到满能与已满能时的两种攻击，核验加成翻倍及类别和队友排除。',
  [context('/buffs', [buff('full-energy', damage), buff('full-energy', damage, 1)], hamayumi)]);
weapon('balladofthefjords', '队伍中存在至少三种不同元素类型的角色时，元素精通提升120点',
  '按队伍角色的元素组成核验不足三种及恰好三种时装备者的元素精通。',
  [context('/buffs/0', [buff('team-elements', mastery)], each('others', [[], ['amber', 'jean'], ['jean', 'kaeya'], ['aether', 'amber', 'kaeya']]))]);

const ring = [context('/buffs/0', [buff('jade-crown', damage)], [
  ...each('added', [0, 40000], { category: 'normal', t: 9999, who: 'actor', cast: 'skill' }),
  { category: 'normal', t: 10000, who: 'actor', cast: 'skill' }, { category: 'charged', who: 'actor', cast: 'skill' },
  { category: 'normal', who: 'peer0', cast: 'skill' }, { category: 'normal', who: 'actor', cast: 'burst' },
])];
for (const sentence of ['施放元素战技时，获得「玉锻之冕」效果：每1000点生命值上限都会使普通攻击造成的伤害提升0.6%，持续10秒',
  '通过这种方式至多使普通攻击造成的伤害提升16%']) {
  weapon('ringofyaxche', sentence, '用两种生命值上限、10秒边界、非普攻和其他动作核验按生命上限计算的普攻增伤及封顶。', ring);
}

for (const [id, sentence, action, casts, ms, stats, suffix] of [
  ['heartofdepth', '施放元素战技后的15秒内，普通攻击与重击造成的伤害提高30%', 'action', ['skill'], 15000, [damage], 'after-cast'],
  ['martialartist', '施放元素战技后的8秒内，普通攻击和重击造成的伤害提升25%', 'action', ['skill'], 8000, [damage], 'after-cast'],
  ['maidenbeloved', '施放元素战技或元素爆发后的10秒内，队伍中所有角色受治疗效果加成提高20%', 'action', ['skill', 'burst'], 10000, ['incomingHealingBonus'], 'after-cast'],
  ['desertpavilionchronicle', '重击命中敌人后，该角色的普通攻击速度提升10%，普通攻击、重击与下落攻击造成的伤害提升40%，持续15秒',
    'hit', ['charged'], 15000, [damage, 'normalAttackSpeed'], 'after-charged'],
]) {
  const trigger = { who: 'actor', cast: casts[0], kind: action, time: 1 };
  set(id, 4, sentence, '对照三件和四件、动作与命中、其他施放者及激活和到期边界，核验受益角色和伤害类别。',
    stats.map(stat => context(stat, [buff(suffix, stat)], [
      ...categories(['normal', 'charged', 'plunge', 'burst'], { ...trigger, rank: 4, recipient: 'actor' }),
      { ...trigger, rank: 3, category: 'normal', recipient: 'actor' }, { ...trigger, rank: 4, recipient: 'peer0' },
      { ...trigger, rank: 4, time: ms }, { ...trigger, rank: 4, cast: casts.at(-1), time: ms - 1 },
      { ...trigger, rank: 4, who: 'peer0' }, { ...trigger, rank: 4, cast: 'plunge' },
      { ...trigger, rank: 4, kind: action === 'action' ? 'hit' : 'action' },
    ])));
}

for (const [id, sentence, elements, targets] of [
  ['lavawalker', '火元素抗性提高40%', ['pyro'], ['pyro', 'cryo', 'physical']],
  ['thundersoother', '雷元素抗性提高40%', ['electro'], ['electro', 'pyro', 'physical']],
  ['tinymiracle', '所有元素抗性提高20%', ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro'],
    ['pyro', 'hydro', 'cryo', 'electro', 'anemo', 'geo', 'dendro', 'physical']],
]) {
  set(id, 2, sentence, '对照一件、二件、装备者与队友及元素和物理抗性，核验具体抗性加成。',
    [context(set2, elements.map(element => buff('resistances', 'resistance.' + element)),
      [1, 2].flatMap(rank => targets.flatMap(target => ownerAndPeer({ rank, target }))))]);
}

const focusRows = layers => ['actor', 'peer'].flatMap(recipient => layerCases(layers, { recipient }));
for (const id of ['royalbow', 'royalgreatsword', 'royalgrimoire', 'royallongsword', 'royalspear']) {
  const focus = [check(additional, '/buffs', [buff('focus', crit)], focusRows([0, 1, 4, 5]), selectStat(crit))];
  const sentence = '攻击造成伤害时，暴击率提升8%，最多堆叠5次';
  weapon(id, sentence, '按给定的专注层数对照持有者和队友的暴击率，已核验零层、单层、四层和五层档位。',
    focus, '暴击率提升8%');
}
for (const id of ['memoryofdust', 'summitshaper', 'theunforged', 'vortexvanquisher']) {
  const layers = id + '.attackLayers';
  const plain = check(mixed, null, [buff('stacked-attack', attack)], [...each(layers, [0, 1, 2, 5, 6]), { [layers]: 5, recipient: 'peer0' }]);
  const shielded = check(mixed, null, [buff('shielded-attack', attack)],
    [...each(layers, [0, 1, 2, 5, 6], { shielded: true }), { [layers]: 5, shielded: false }, { [layers]: 5, shielded: true, recipient: 'peer0' }]);
  weapon(id, '攻击命中后的8秒内，攻击力提升4%', '按给定有效层数核验每层攻击力加成。', [plain], '攻击力提升4%');
  weapon(id, '该效果至多可叠加5层，每0.3秒只能触发一次', '核验给定五层和超出五层时均按五层封顶。', [plain], '该效果至多可叠加5层');
  weapon(id, '此外，处于护盾庇护下时，该效果的攻击力提升效果提高100%',
    '对照有盾、无盾、零层、逐层和封顶，核验在给定有效层数下护盾使攻击力加成翻倍。', [plain, shielded]);
}

weapon('absolution', '生命之契的数值增加时，装备者造成的伤害提升16%',
  '给定生效层数，按每层数值、三层封顶与队友排除核验伤害加成。',
  [check(remaining, '/buffs', [buff('bond-damage', damage)], focusRows([0, 1, 2, 3, 4]), selectStat(damage))],
  '装备者造成的伤害提升16%');
for (const [sentence, suffix] of [
  ['此外，装备者具有生命之契时，造成的伤害提升12%', 'bond-damage'],
  ['若生命之契的数值大于等于生命值上限的30%，造成的伤害将进一步提升24%', 'large-bond-damage'],
]) {
  const ratios = ['actor', 'peer'].flatMap(recipient => each('ratio', [0, .001, .299, .3, .301, 1], { recipient }));
  weapon('crimsonmoonssemblance', sentence, '核验从无生命之契到持有及跨越30%阈值的持有者增伤，并对照队友。',
    [check(remaining, '/buffs', [buff(suffix, damage)], ratios, selectStat(damage))]);
}
for (const [stage, eventText, rate, stat] of [
  ['dawn', '进行下落攻击时，获得「初霞之彩」', 28, 'dawnActive'],
  ['twilight', '施放元素战技或元素爆发时，获得「苍暮之辉」', 40, 'twilightActive'],
]) {
  const fragment = '下落攻击造成的暴击伤害提升' + rate + '%';
  weapon('vividnotions', eventText + '效果：' + fragment, '给定相应状态及是否同时激活另一状态，核验下落攻击暴伤和队友、其他攻击类别排除。',
    [check(remaining, '/buffs', [buff(stage, 'critDamage')], [
      ...[false, true].flatMap(dawnActive => [false, true].flatMap(twilightActive =>
        categories(skills, { dawnActive, twilightActive, recipient: 'actor' }))),
      { category: 'plunge', [stat]: true, recipient: 'peer' },
    ], selectStat('critDamage'))], fragment);
}
for (const [type, category, suffix] of [['元素战技', 'skill', 'skill-crit'], ['元素爆发', 'burst', 'burst-crit']]) {
  const fragment = type + '的暴击率提升2%';
  weapon('wolffang', type + '命中敌人时，' + fragment, '给定仍生效的战技和爆发层数，对照两种暴击率独立加成及队友、其他攻击类别排除。',
    [check(remaining, '/buffs', [buff(suffix, crit)], [
      { category, skill: 0, burst: 0, recipient: 'actor' }, { category, skill: 1, burst: 0, recipient: 'actor' },
      { category, skill: 0, burst: 2, recipient: 'actor' }, { category, skill: 4, burst: 4, recipient: 'actor' },
      { category, skill: 5, burst: 5, recipient: 'actor' }, { category, skill: 4, burst: 4, recipient: 'peer' },
      { category: 'normal', skill: 4, burst: 4, recipient: 'actor' },
    ], selectStat(crit))], fragment);
}

const featherThreshold = '持有3层时，装备者造成的星烁反应伤害的暴击伤害提升50%，且触发星烁反应或造成星烁反应伤害时，还会使装备者恢复4点元素能量';
weapon('whitelakefrostfeather', featherThreshold, '按给定层数比较三层与未满层，对照两种星烁、普通伤害、月结晶和队友的暴伤。',
  [check(additional, '/buffs', [buff('lake-stellar-crit', 'critDamage')], ['actor', 'peer'].flatMap(recipient =>
    ['ordinary', 'stellar-conduct', 'stellar-swirl', 'lunar-crystallize'].flatMap(family => layerCases([0, 1, 2, 3], { recipient, family }))),
  selectStat('critDamage'))], '持有3层时，装备者造成的星烁反应伤害的暴击伤害提升50%');

for (const [id, ratio] of [['primordialjadecutter', '1.2'], ['staffofhoma', '0.8']]) {
  const checks = [check(additional, '/buffs', [buff('hp-to-attack.attack', 'attack')],
    ['actor', 'peer'].flatMap(recipient => [0, 500].flatMap(flatHp =>
      each('hpRatio', [.49, .5, .51, 1], { recipient, flatHp }))), selectStat('attack'))];
  weapon(id, `此外，基于装备该武器的角色生命值上限的${ratio}%，获得攻击力加成`,
    '用两种生命上限及队友核验生命上限转换攻击力的基础项。', checks);
  if (id === 'staffofhoma') {
    weapon(id, '当装备该武器的角色生命值低于50%时，进一步获得1%基于生命值上限的攻击力提升',
      '用49%、50%和51%当前生命比例、两种生命上限及队友核验严格低于50%时的追加换算。', checks);
  }
}

const amos = check(mixed, null, [buff('flight-damage', damage)], [
  ...each('amosbow.flightStacks', [0, 1, 2, 5, 6], { category: 'normal' }),
  { 'amosbow.flightStacks': 5, category: 'charged' }, { category: 'skill' }, { category: 'normal', recipient: 'peer0' },
]);
weapon('amosbow', '普通攻击与重击的箭矢发射后每经过0.1秒，伤害还会提升8%，至多提升5次',
  '按给定飞行层数核验普攻、重击每层伤害加成及五层封顶。', [amos], '伤害还会提升8%，至多提升5次');

const slingshot = skills.filter(category => ['normal', 'charged', 'skill'].includes(category))
  .flatMap(category => each('milliseconds', [299, 300, 301], { category }));
for (const [sentence, suffix] of [
  ['普通攻击与重击的箭矢若在发射后的0.3秒内击中敌人，则造成的伤害增加36%', 'fast'],
  ['否则，造成的伤害下降10%', 'slow'],
]) {
  weapon('slingshot', sentence, '用普攻、重击和战技对照给定飞行时间为299、300与301毫秒时的加成或减益。',
    [check(current, '/buffs', [buff(suffix, damage)], slingshot, row => row.milliseconds !== undefined)]);
}
weapon('polarstar', '处于1/2/3/4层「白夜极星」效果下时，攻击力将提高10/20/30/48%',
  '按给定仍生效的白夜极星层数核验零至四层攻击力档位。',
  [check(current, '/buffs', [1, 2, 3, 4].map(layer => buff('star' + layer, attack)), layerCases([0, 1, 2, 3, 4]),
    row => row.layers !== undefined)]);
weapon('fadingtwilight', '具有夕暮、流霞、朝晖三种状态，分别能使造成的伤害提升6%/10%/14%',
  '明确给定夕暮、流霞或朝晖时，核验各状态自己的伤害加成。',
  [check(current, '/buffs', [1, 2, 3].map(stage => buff('twilight' + stage, damage)), each('mode', ['夕暮', '流霞', '朝晖']))]);
weapon('starcallerswatch', '元素精通提升100点', '按固定词条核验装备者的额外元素精通及队友排除。',
  [check(current, '/buffs/0', [buff('mastery', mastery)], ['actor', 'peer'].flatMap(onField =>
    [false, true].flatMap(active => each('recipient', ['actor', 'peer'], { onField, active }))))]);
weapon('starcallerswatch', '装备者创造护盾后的15秒内，获得「照夜之镜」效果：队伍中自己的当前场上角色对附近的敌人造成的伤害提升28%，每14秒至多获得一次「照夜之镜」效果',
  '给定照夜之镜是否生效，对照场上持有者、场上队友和后台角色的伤害加成。',
  [check(current, '/buffs/1', [buff('night-mirror', damage)], ['actor', 'peer'].flatMap(onField =>
    [false, true].flatMap(active => each('recipient', ['actor', 'peer'], { onField, active }))))],
  '造成的伤害提升28%');

const flatDamage = (suffix, included, active = true) => check(additional, '/buffs', [buff(suffix, base)],
  [0, 240].flatMap(added => [
    ...categories(skills, { active: true, recipient: 'actor', added }), { added, active: true, recipient: 'peer', category: included[0] },
    ...active ? [{ added, active: false, recipient: 'actor', category: included[0] }] : [],
  ]), selectStat(base));
for (const [id, sentence, part, suffix, included, basis] of [
  ['hunterspath', '重击命中敌人后，将获得「无休止的狩猎」：重击造成的伤害值提高，提高值相当于元素精通数值的160%',
    '重击造成的伤害值提高，提高值相当于元素精通数值的160%', 'tireless-hunt', ['charged'], '元素精通'],
  ['lightoffoliarincision', '普通攻击造成元素伤害后，获得「裁叶」效果：普通攻击和元素战技造成的伤害提高，提高值相当于元素精通的120%',
    '普通攻击和元素战技造成的伤害提高，提高值相当于元素精通的120%', 'foliar-incision', ['normal', 'skill'], '元素精通'],
  ['sturdybone', '此外，使用冲刺或替代冲刺的能力后，普通攻击造成的伤害提高，提高数值相当于攻击力的16%，该效果在生效18次或7秒后消失',
    '普通攻击造成的伤害提高，提高数值相当于攻击力的16%', 'dash', ['normal'], '攻击力'],
  ['everlastingmoonglow', '普通攻击造成的伤害增加，增加值为装备该武器的角色生命值上限的1%',
    undefined, 'normal-hp', ['normal'], '生命值上限'],
  ['redhornstonethresher', '普通攻击与重击造成的伤害值提高，提高数值相当于防御力的40%',
    undefined, 'normal-charged-base', ['normal', 'charged'], '防御力'],
]) {
  weapon(id, sentence, `用两种${basis}数值、伤害类别和队友核验当次基础伤害增加量。`,
    [flatDamage(suffix, included, Boolean(part))], part);
}

for (const [sentence, required] of [
  ['基于元素充能效率的25%，提高元素爆发造成的伤害', [1, 2.79, 2.8]],
  ['至多通过这种方式获得75%提升', [2.79, 2.8, 2.81, 4]],
]) {
  set('emblemofseveredfate', 4, sentence, '对照四件件数门槛、爆发与非爆发、实际充能效率的换算和75%封顶。',
    [check(additional, set4, [buff('4', damage)], [
      ...each('recharge', required, { pieces: 4, category: 'burst' }),
      { pieces: 3, category: 'burst', recharge: 2.8 }, { pieces: 4, category: 'skill', recharge: 2.8 },
      { pieces: 5, category: 'burst', recharge: 2.8 },
    ], selectStat(damage))]);
}
const pale = (stat, suffix) => check(additional, set4, [buff(suffix, stat)], [
  ...layerCases([0, 1, 2], { pieces: 4, element: 'physical' }),
  { layers: 2, pieces: 3, element: 'physical' }, { layers: 2, pieces: 5, element: 'physical' },
], selectStat(stat));
set('paleflame', 4, '元素战技命中敌人后，攻击力提升9%', '给定战技有效层数，核验四件套每层攻击力。',
  [pale(attack, 'skill-atk')], '攻击力提升9%');
set('paleflame', 4, '叠满2层时，2件套的效果提升100%', '对照三、四、五件及零至两层的物伤加成，核验四件满层时两件套效果翻倍。',
  [pale('physicalBonus', 'full-physical')]);

set('noblesseoblige', 2, '元素爆发造成的伤害提升20%', '对照一、二及四件，核验两件套只提高爆发伤害。',
  [check(additional, set2, [buff('burst-bonus.bonus', damage)], [1, 2, 4].flatMap(pieces => categories(skills, { pieces })))]);
set('noblesseoblige', 4, '施放元素爆发后，队伍中所有角色攻击力提升20%，持续12秒',
  '按四件套持有者的爆发记录核验双方20%攻击力、无爆发对照、件数门槛和12秒边界。',
  [check(additional, set4, [buff('burst-team-attack.team-attack', attack)],
    ['actor', 'peer'].flatMap(recipient => [
      ...each('time', [0, 11999, 12000], { active: true, recipient, pieces: 4 }),
      { active: true, recipient, pieces: 3, time: 0 }, { active: false, recipient, pieces: 4, time: 0 },
    ]), row => !row.twoWearers)]);
set('noblesseoblige', 4, '该效果不可叠加', '按两位四件套持有者先后施放爆发的记录，核验重叠期间的加成仍为20%。',
  [check(additional, set4, [buff('burst-team-attack.team-attack', attack)],
    ['actor', 'peer'].flatMap(recipient => each('time', [99, 100, 12000, 12100], { recipient })), row => row.twoWearers)]);

for (const [fragment, stat, suffix] of [
  ['攻击力将提高7%/16%/25%', attack, 'attack'],
  ['水元素伤害加成提升4%/9%/15%', 'hydroBonus', 'hydro'],
]) {
  set('nymphsdream', 4, '处于1/2/3层及以上「镜中水仙」效果下时，攻击力将提高7%/16%/25%，水元素伤害加成提升4%/9%/15%',
    '按三、四件与给定零至三层核验该属性的档位，水伤求值保留两件套基值。',
    [check(current, set4, [1, 2, 3].map(layer => buff('nymph-' + suffix + '-' + layer, stat)),
      [3, 4].flatMap(count => layerCases([0, 1, 2, 3], { count })), selectStat(stat))], fragment);
}
set('goldentroupe', 4, '此外，处于队伍后台时，元素战技造成的伤害还将进一步提升25%，该效果将在登场后2秒移除',
  '给定后台增伤状态，对照三、四件及战技、普攻和爆发，核验额外25%战技伤害。',
  [check(current, set4, [buff('backstage', damage)], [3, 4].flatMap(count => [false, true].flatMap(backstageActive =>
    categories(['normal', 'skill', 'burst'], { count, backstageActive }))))], '元素战技造成的伤害还将进一步提升25%');
set('shimenawasreminiscence', 4, '施放元素战技时，如果角色的元素能量高于或等于15点，则会流失15点元素能量，使接下来的10秒内，普通攻击、重击、下落攻击造成的伤害提高50%，持续期间内该效果不会再次触发',
  '给定本次增伤状态及施放时能量，核验14至16点门槛、三件与四件和三种受益攻击类别。',
  [check(current, set4, [buff('energy-spent', damage)], [3, 4].flatMap(count => [false, true].flatMap(active =>
    [14, 15, 16].flatMap(energy => categories(skills, { count, active, energy })))))], '普通攻击、重击、下落攻击造成的伤害提高50%');

const mailedFlowerChecks = [attack, mastery].map(stat => context('/buffs/0', [buff('whispers-of-wind-and-flower', stat)], [
  ...each('scenario', ['skill', 'reaction', 'both', 'shield contact', 'cast', 'ordinary hit', 'no enemy', 'other actor',
    'other reactor', 'off-field cannot extend', 'expired', 'refresh expires', 'effect persists off-field'], { recipient: 'actor' }),
  { scenario: 'skill', recipient: 'peer0' },
  ...each('phase', ['before', 'after'], { kind: 'hit' }),
], selectStat(stat)));
weapon('mailedflower', '元素战技命中敌人或触发元素反应后的8秒内，攻击力提升12%，元素精通提升48点',
  '按持有者命中或反应记录核验攻击力和精通，覆盖触发击前后、队友排除、刷新和8秒到期。', mailedFlowerChecks);
for (const [id, sentence, stat] of [
  ['tidalshadow', '受到治疗后，攻击力提升24%，持续8秒', attack],
  ['songofstillness', '受到治疗后，造成的伤害提升16%，持续8秒', damage],
]) {
  const checks = [context('/buffs', [buff('after-trigger', stat)], [
    ...each('time', [1, 7999, 8000], { who: 'actor', fact: 'healingReceived', recipient: 'actor' }),
    { field: true, who: 'actor', fact: 'healingReceived', value: 1, recipient: 'actor' },
    { field: false, who: 'actor', fact: 'healingReceived', value: 500, recipient: 'actor' },
    { who: 'actor', fact: 'healingReceived', value: 0, recipient: 'actor' },
    { who: 'peer0', fact: 'healingReceived', recipient: 'actor' },
    { who: 'actor', fact: 'healingReceived', recipient: 'peer0' },
    ...each('fact', ['healingDone', 'hpRatioChange'], { who: 'actor', recipient: 'actor' }),
  ])];
  for (const text of [sentence, '角色处于队伍后台也能触发']) {
    weapon(id, text, '核验有实际受疗量时触发、后台受疗、零受疗、治疗他人和8秒边界，并排除队友。', checks);
  }
}
for (const [id, ordinary, lunar, full, transformSuffix, lunarSuffix, fullSuffix, audit] of [
  ['blackmarrowlantern', '绽放', '月绽放', 'full', 'bloom', 'lunar-bloom', 'lunar-bloom', contexts],
  ['prospectorsshovel', '感电', '月感电', 'fullMoonsign', 'electro-charged', 'lunar-charged', 'lunar-charged-full', current],
]) {
  const combined = id === 'blackmarrowlantern';
  const regular = transformSuffix;
  const lunarReaction = lunarSuffix;
  const regularCheck = check(audit, '/buffs', [buff(transformSuffix, 'reaction.transformative.damageBonus')], [
    ...each(full, [false, true], { reactionId: regular }), { reactionId: combined ? 'hyperbloom' : 'superconduct' },
    ...combined ? [{ reactionId: regular, recipient: 'peer0' }] : [],
  ], row => row.family === 'transformative');
  const lunarCheck = (suffix, occurrence = 0) => check(audit, '/buffs', [buff(suffix, 'reaction.lunar.damageBonus', occurrence)], [
    ...each(full, [false, true], { reactionId: lunarReaction }), { reactionId: combined ? 'lunar-charged' : 'lunar-bloom' },
    ...combined ? [{ reactionId: lunarReaction, recipient: 'peer0' }] : [],
  ], row => row.family.startsWith('lunar-'));
  const typeText = combined ? '月绽放反应伤害' : '月感电反应造成的伤害';
  weapon(id, `${ordinary}反应造成的伤害提升48%，${typeText}提升12%`, '对照各自普通、月曜反应及相邻无效反应，核验两种伤害加成。',
    [regularCheck, lunarCheck(lunarSuffix)]);
  weapon(id, `月兆·满辉：${typeText}额外提升12%`, '对照满辉与非满辉时对应月曜反应的增伤，并排除其他反应。',
    [lunarCheck(fullSuffix, combined ? 1 : 0)]);
}

const confirmedEnergy = '合法精炼与本次触发';
const energyValue = (rankOne, extra = []) => check(energyGrant, null, [buff('directEnergy', 'directEnergyRestored')], [
  { refinement: 1, label: confirmedEnergy, expected: rankOne }, { label: confirmedEnergy },
  { label: '未满足本次条件或触发间隔', expected: 0 }, { label: '未装备', expected: 0 },
  { label: '未应用', expected: 0 }, { label: '排除不受益角色', expected: 0 }, ...extra,
], row => row.output === 'attribute.directEnergyRestored');
for (const [id, sentence, fragment, amount, scope] of [
  ['angelosheptades', '此外，装备者创造护盾时，还会获得「指引者的餍足」效果，使装备者恢复14点元素能量，该效果每14秒至多触发一次',
    '使装备者恢复14点元素能量', 14, '给定本次指引者的餍足，核验持有者的单次回能。'],
  ['bloodsoakedruins', '并为装备者恢复12点元素能量，每14秒至多通过这种方式恢复一次元素能量',
    '为装备者恢复12点元素能量', 12, '给定本次月感电已满足回能触发，核验持有者的单次回能。'],
  ['cranesechoingcall', '队伍中附近的角色的下落攻击命中敌人时，为装备者恢复2.5点元素能量，每0.7秒至多通过这种方式恢复一次元素能量，装备者处于队伍后台时依然能通过这种方式恢复元素能量',
    '为装备者恢复2.5点元素能量', 2.5, '给定本次下落攻击已满足回能触发，核验持有者的单次回能。'],
  ['everlastingmoonglow', '在施放元素爆发后的12秒内，普通攻击命中敌人时恢复0.6点元素能量，每0.1秒至多通过这种方式恢复一次元素能量',
    '恢复0.6点元素能量', .6, '给定本次普攻已满足回能触发，核验持有者的单次回能。'],
  ['exaiphanesblade', '旅行者装备时，命中敌人后，攻击力提升16%，持续8秒，并使旅行者恢复3点元素能量',
    '使旅行者恢复3点元素能量', 3, '给定本次命中触发，核验旅行者回能及非旅行者排除。'],
  ['frostbreath', '触发冰元素或水元素相关反应后的15秒内，装备者的攻击力提升20%，并为队伍中自己的其他角色恢复6点元素能量',
    '为队伍中自己的其他角色恢复6点元素能量', 6, '给定本次反应已满足回能触发，核验队友受益及持有者排除。'],
  ['jadefallssplendor', '施放元素爆发或创造护盾后的3秒内，将产生「定土玉圭」效果：每2.5秒恢复4.5点元素能量，并基于装备者的生命值上限，每1000点使其对应元素类型的元素伤害加成提高0.3%，至多提高12%',
    '恢复4.5点元素能量', 4.5, '给定本次定土玉圭回能脉冲，核验持有者的单次回能。'],
  ['lumidouceelegy', '叠加至2层或2层的持续时间刷新时，恢复12点元素能量，每12秒至多通过这种方式恢复一次元素能量',
    '恢复12点元素能量', 12, '给定本次燃烧回能触发，核验两层门槛及持有者的单次回能。'],
  ['nocturnescurtaincall', '装备者触发月曜反应或对敌人造成月曜反应伤害时，将为装备者恢复14点元素能量，并获得持续12秒的「丰饶海的神酒」效果：生命值上限进一步提高14%，月曜反应伤害的暴击伤害提升60%',
    '为装备者恢复14点元素能量', 14, '给定本次月曜反应已满足回能触发，核验持有者的单次回能。'],
  ['songofthevigil', '触发元素反应后，为装备者恢复4点元素能量，该效果每9秒至多触发一次',
    '为装备者恢复4点元素能量', 4, '给定本次反应已满足回能触发，核验持有者的单次回能。'],
  ['tomeoftheeternalflow', '叠加至3层或3层的持续时间刷新时，恢复8点元素能量，每12秒至多通过这种方式恢复一次元素能量',
    '恢复8点元素能量', 8, '给定本次万世流涌回能触发，核验三层门槛及持有者的单次回能。'],
  ['whitelakefrostfeather', '持有3层时，装备者造成的星烁反应伤害的暴击伤害提升50%，且触发星烁反应或造成星烁反应伤害时，还会使装备者恢复4点元素能量',
    '使装备者恢复4点元素能量', 4, '给定本次星烁回能触发，核验三层门槛及持有者的单次回能。'],
]) {
  const exclude = ['lumidouceelegy', 'tomeoftheeternalflow', 'whitelakefrostfeather'].includes(id)
    ? [{ label: '叠层尚未达到回能门槛', expected: 0 }]
    : id === 'exaiphanesblade' ? [{ label: '非旅行者命中仍不回复', expected: 0 }] : [];
  weapon(id, sentence, scope, [energyValue(amount, exclude)], fragment);
}

for (const [id, pieces, sentence, fragment, scope, amount, probes] of [
  ['scholar', 4, '获得元素微粒或元素晶球时，队伍中所有弓箭和法器角色额外恢复3点元素能量',
    '队伍中所有弓箭和法器角色额外恢复3点元素能量', '给定本次学士回能触发，核验法器和弓队友、弓持有者及单手剑队友排除。', 3,
    [{ label: '弓箭持有者也受益', expected: 3 }, { label: '弓箭队友受益', expected: 3 }, { label: '单手剑队友不受益', expected: 0 }]],
  ['scrolloftheheroofcindercity', 2, '队伍中附近的角色触发「夜魂迸发」时，装备者恢复6点元素能量',
    '装备者恢复6点元素能量', '给定本次夜魂迸发已触发，核验持有者6点回能及队友排除。', 6,
    [{ label: '队员触发后只给装备者回复', expected: 0 }]],
  ['theexile', 4, '施放元素爆发后，每2秒为队伍中所有角色（不包括自己）恢复2点元素能量',
    '为队伍中所有角色（不包括自己）恢复2点元素能量', '给定本次流放者回能脉冲，核验单次队友回能及持有者排除。', 2,
    [{ label: '装备者本人不吃自己的回复', expected: 0 }]],
  ['theexile', 4, '该效果持续6秒，无法叠加', '无法叠加', '给定两位持有者的回能同时生效，对照只计一次的受益结果。', 2,
    [{ label: '同时有两位装备者的回复也只计算一次', expected: 2 }]],
]) {
  set(id, pieces, sentence, scope, [check(energyGrant, null, [buff('directEnergy', 'directEnergyRestored')], [
    { label: '装备生效且本次触发', pieces, expected: amount }, { label: '装备少一件', pieces: pieces - 1, expected: 0 },
    { label: '未发生本次触发', pieces, expected: 0 }, ...probes,
  ], row => row.output === 'attribute.directEnergyRestored')], fragment);
}

function sourceOf(rule) {
  return rule.pieces ? sets[rule.id]?.['effect' + rule.pieces + 'Pc']
    : weapons[rule.id]?.metadata.r1?.description;
}

function includesSentence(text, sentence) {
  return text?.split(/[。；\n]/).some(part => normal(part) === sentence) ?? false;
}

function modifiers(item, rule, grants) {
  const group = rule.pieces ? item.metadata.effects?.[Number(rule.field.at(-1))] : item.metadata;
  if (!group || rule.pieces && group.pieces !== rule.pieces) return [];
  const prefix = rule.pieces ? rule.field + '/buffs' : rule.field;
  return grants.map(({ suffix, target, occurrence }) => {
    const id = rule.id + '.' + suffix;
    const index = group.buffs?.findIndex(grant => grant.id === id) ?? -1;
    const modifier = group.buffs?.[index]?.modifiers?.flatMap((entry, position) => entry.target === target ? [position] : [])[occurrence];
    return modifier === undefined ? null : { id, target, field: prefix + '/' + index + '/modifiers/' + modifier };
  });
}

function rowSettings(row) {
  return { ...row, ...row.probe, ...row.settings, ...row.settings?.facts };
}

function covers(settings, expected) {
  return Object.entries(expected).every(([key, value]) => Array.isArray(value)
    ? Array.isArray(settings[key]) && value.length === settings[key].length && value.every((entry, index) => settings[key][index] === entry)
    : settings[key] === value);
}

function groupByEntity(rows) {
  const index = new Map();
  for (const row of rows) {
    const group = index.get(row.entity) ?? [];
    group.push(row);
    index.set(row.entity, group);
  }
  return index;
}

function checkCases(rows, spec, ranks, rule) {
  if (!rows.length || rows.some(row => row.issue || row.status === 'unavailable' || !(row.expected === null
    ? row.value === null : near(row.value, row.expected)))) return false;
  const hasCoverage = readings => spec.required.every(probe => readings.some(row => covers(rowSettings(row), probe)));
  if (rule.pieces || spec.audit === energyGrant) {
    const amounts = rows.map(row => row.expected).filter(Number.isFinite);
    return new Set(amounts).size > 1 && hasCoverage(rows) && ranks.every(rank => rows.some(row =>
      row.probe?.refinement === rank && row.probe.label === confirmedEnergy && row.expected > 0));
  }
  return ranks.every(rank => {
    const ranked = rows.filter(row => rowSettings(row).rank === rank);
    const amounts = ranked.map(row => row.expected).filter(Number.isFinite);
    return new Set(amounts).size > 1 && hasCoverage(ranked);
  });
}

const key = (entity, field, statement) => JSON.stringify([entity, field, statement]);
const distinct = values => [...new Set(values)];

/** Match a fixed source sentence to completed independent cases for its exact equipment grants. */
export function makeEquipmentProseProofs(entities, results) {
  const definitions = new Map([...entities.weapons, ...entities.sets].map(item => [item.id, item]));
  const rowsByAudit = new Map([contexts, current, additional, remaining, energyGrant]
    .map(audit => [audit, groupByEntity(results[audit]?.rows ?? [])]));
  const mixedByEntity = groupByEntity((results.registeredModifierEvidence ?? []).filter(row => row.audit === mixed));
  const proved = new Map();
  for (const rule of rules) {
    const item = definitions.get(rule.id);
    if (!item || !includesSentence(sourceOf(rule), rule.sentence)) continue;
    if (rule.part && (rule.sentence === rule.part || rule.sentence.indexOf(rule.part) < 0
      || rule.sentence.indexOf(rule.part) !== rule.sentence.lastIndexOf(rule.part))) continue;
    const ranks = rule.pieces ? [] : Object.keys(weapons[rule.id].metadata).filter(key => /^r[1-5]$/.test(key)).map(key => Number(key[1]));
    if (!rule.pieces && (!ranks.length || ranks.length !== item.maxRefinement)) continue;
    const refs = (rule.pieces ? [setPath(rule.id, rule.pieces)] : ranks.map(rank => rankPath(rule.id, rank))).map(path => sourceRoot + path);
    const proofSets = rule.checks.map(spec => {
      const bound = modifiers(item, rule, spec.grants);
      if (bound.length !== spec.grants.length || bound.includes(null)) return [];
      const auditRows = rowsByAudit.get(spec.audit)?.get(rule.id) ?? [];
      return bound.flatMap(grant => {
        const registered = spec.audit === mixed && (mixedByEntity.get(rule.id) ?? []).find(entry =>
          entry.field === grant.field && entry.id === grant.id && entry.target === grant.target);
        const rows = registered ? registered.cases.map(row => ({ ...row, value: row.actual }))
          : auditRows.filter(row => row.field === (spec.field ?? grant.field)
            && (spec.audit !== energyGrant || row.effect === grant.id));
        const cases = rows.filter(row => spec.select(rowSettings(row)));
        if (!checkCases(cases, spec, ranks, rule)) return [];
        const folder = rule.pieces ? 'artifact-sets/' : 'weapons/';
        const document = 'src/game-data/data/' + folder + rule.id + '.json#' + grant.field;
        return [{ audit: spec.audit, field: grant.field, scope: rule.scope, cases: cases.length,
          refs: distinct([...refs, document, ...registered?.refs ?? [], ...cases.flatMap(row => row.sources ?? [])]) }];
      });
    });
    if (proofSets.some((proofs, index) => proofs.length !== rule.checks[index].grants.length)) continue;
    const id = key(rule.id, rule.field, rule.sentence);
    const proof = proved.get(id) ?? { whole: [], parts: [] };
    if (rule.part) proof.parts.push(...proofSets.flat().map(entry => ({ text: rule.part, ...entry })));
    else proof.whole.push(...proofSets.flat());
    proved.set(id, proof);
  }
  return (entity, ownerField, statement) => proved.get(key(entity, ownerField, normal(statement))) ?? { whole: [], parts: [] };
}
