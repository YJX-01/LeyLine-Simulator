import { existsSync } from 'node:fs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, novice, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const sourceRoot = '../data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const test = (settings = {}, factor = 1) => ({ settings, factor });
const no = settings => test(settings, 0);
const facts = values => ({ facts: values });
const peer = { recipient: 'peer' };
const party = (settings, active = true) => test({ ...settings, ...peer }, Number(active));
const switchFact = (entity, name, settings = {}) => [
  test({ ...settings, ...facts({ [entity + '.' + name]: true }) }),
  no({ ...settings, ...facts({ [entity + '.' + name]: false }) }),
];
const threshold = (key, positive, negative, settings = {}) => [
  test({ ...settings, ...facts({ [key]: positive }) }),
  no({ ...settings, ...facts({ [key]: negative }) }),
];
const hitCases = (hits, other, settings = {}) => [
  ...hits.map(hit => test({ ...settings, hit })), no({ ...settings, hit: other }),
];
const categories = (positive, negative, settings = {}) => [
  ...positive.map(category => test({ ...settings, category })), no({ ...settings, category: negative }),
];
const cast = (skill, actorId = 'actor') => ({ kind: 'action', actorId, skillId: skill, targetIds: [] });
const hitEvent = (hitId, targetId = 'enemy') => ({
  kind: 'hit', actorId: 'actor', hitId, targetIds: [targetId],
});
const reactionEvent = (reactionId, actorId = 'actor') => ({ kind: 'reaction', actorId, targetIds: ['enemy'], reactionId });
const eventCases = (event, other, duration, settings = {}) => [
  test({ ...settings, event }), test({ ...settings, event, time: duration - 1 }),
  no({ ...settings, event, time: duration }), no({ ...settings, event: other }), no(settings),
];
const eachStack = (key, counts, settings = {}) => counts.map(count =>
  test({ ...settings, facts: { ...settings.facts, [key]: count } }, count));
const targetHitCases = (entity, hits, other, duration) => [
  ...eventCases(hitEvent(entity + '.' + hits[0]), hitEvent(entity + '.' + other), duration),
  ...hits.slice(1).map(hit => test({ event: hitEvent(entity + '.' + hit) })),
  no({ event: hitEvent(entity + '.' + hits[0], 'other') }),
  no({ event: { ...hitEvent(entity + '.' + hits[0]), actorId: 'peer' } }),
];

// Specify the hit, recipient, state and source phrase independently of the linked effects.
// A full certificate is reserved for clauses whose other combat behavior is covered by these probes.
const certificates = [
  ...['aether', 'lumine'].flatMap(who => {
    const anemo = who + '-anemo', electro = who + '-electro', dendro = who + '-dendro', pyro = who + '-pyro';
    const lotus = { [dendro + '.lotusField']: true };
    return [
      [anemo, 'c2', 'energyRecharge', /元素充能效率提升(\d+)%/, [test(), no(peer)], { full: true }],
      [electro, 'c2', 'target.resistance.electro', /雷元素抗性降低(\d+)%/, eventCases(
        hitEvent(electro + '.burst.param2'), hitEvent(electro + '.burst.param1'), 8000,
      ).concat(no({ event: hitEvent(electro + '.burst.param2', 'other') })), { full: true, scale: -.01 }],
      [dendro, 'a0', 'elementalMastery', /元素精通提升(\d+)点/,
        eachStack(dendro + '.lotusLightStacks', [0, 1, 5, 10], { ...peer, recipientFacts: lotus })
          .concat(no({ ...peer, recipientFacts: { ...lotus, onField: false }, facts: { [dendro + '.lotusLightStacks']: 5 } }),
            no({ ...peer, recipientFacts: { [dendro + '.lotusField']: false }, facts: { [dendro + '.lotusLightStacks']: 5 } })), { scale: 1 }],
      ...['dendro', 'hydro', 'electro', 'pyro'].map(element => [dendro, 'c6', element + 'Bonus',
        element === 'dendro' ? /获得(\d+)%草元素伤害加成/ : /获得(\d+)%对应元素伤害加成/,
        [
          party({ facts: { [dendro + '.lotusTransfiguration']: element === 'dendro' ? 'none' : element }, recipientFacts: lotus }),
          party({ facts: { [dendro + '.lotusTransfiguration']: element === 'hydro' ? 'pyro' : 'hydro' }, recipientFacts: lotus }, element === 'dendro'),
          party({ facts: { [dendro + '.lotusTransfiguration']: element === 'dendro' ? 'none' : element }, recipientFacts: { ...lotus, onField: false } }, false),
          party({ facts: { [dendro + '.lotusTransfiguration']: element === 'dendro' ? 'none' : element }, recipientFacts: { [dendro + '.lotusField']: false } }, false),
        ], { full: true }]),
      [pyro, 'c6', 'critDamage', /暴击伤害提升(\d+)%/,
        categories(['normal', 'charged', 'plunge'], 'skill', facts({ [pyro + '.nightsoulPyroInfusion']: true }))
          .concat(no({ category: 'normal', facts: { [pyro + '.nightsoulPyroInfusion']: false } }))],
    ];
  }),
  ['albedo', 'a0', 'damageBonus', /造成的伤害提高(\d+)%/, threshold('targetHpRatio', .49, .5, { hit: 'skill.param2' })
    .concat(no({ hit: 'skill.param1', facts: { targetHpRatio: .49 } })), { full: true }],
  ['albedo', 'c6', 'damageBonus', /造成的伤害提高(\d+)%/, [
    party({ recipientFacts: { 'albedo.isotomaArea': true, 'albedo.crystallizeShield': true, 'albedo.isotomaMoondrift': false } }),
    party({ recipientFacts: { 'albedo.isotomaArea': true, 'albedo.crystallizeShield': false, 'albedo.isotomaMoondrift': true } }),
    party({ recipientFacts: { 'albedo.isotomaArea': true, 'albedo.crystallizeShield': false, 'albedo.isotomaMoondrift': false } }, false),
    party({ recipientFacts: { 'albedo.isotomaArea': false, 'albedo.crystallizeShield': true, 'albedo.isotomaMoondrift': false } }, false),
    party({ recipientFacts: { 'albedo.isotomaArea': true, 'albedo.crystallizeShield': true, 'albedo.isotomaMoondrift': false, onField: false } }, false),
  ], { full: true }],
  ['alhaitham', 'c2', 'elementalMastery', /元素精通提升(\d+)点/,
    eachStack('alhaitham.mirrorMasteryStacks', [0, 1, 2, 4]).concat(no({ ...peer, facts: { 'alhaitham.mirrorMasteryStacks': 4 } })), { scale: 1 }],
  ['alhaitham', 'c4', 'elementalMastery', /元素精通提升(\d+)点/,
    eachStack('alhaitham.consumedMirrors', [0, 1, 3], peer).concat(no(facts({ 'alhaitham.consumedMirrors': 3 }))), { scale: 1 }],
  ['alhaitham', 'c4', 'dendroBonus', /获得(\d+)%草元素伤害加成/,
    eachStack('alhaitham.generatedMirrors', [0, 1, 3]).concat(no({ ...peer, facts: { 'alhaitham.generatedMirrors': 3 } }))],
  ['aloy', 'a0', 'attackPercent', /埃洛伊的攻击力提升(\d+)%/, switchFact('aloy', 'coilAttackWindow'), { rules: ['coil-boost-self'] }],
  ['aloy', 'a0', 'attackPercent', /其他角色的攻击力提升(\d+)%/, switchFact('aloy', 'coilAttackWindow', peer)
    .concat(no(facts({ 'aloy.coilAttackWindow': true }))), { rules: ['coil-boost-team'] }],
  ['aloy', 'a1', 'cryoBonus', /提升([\d.]+)%冰元素伤害加成[^。]*?获得(\d+)%/,
    eachStack('aloy.iceSeconds', [0, 1, 5], { element: 'cryo', facts: { 'aloy.rushingIce': true } }).concat(
      test({ element: 'cryo', facts: { 'aloy.rushingIce': true, 'aloy.iceSeconds': 10 }, capture: 2 }),
      no({ element: 'physical', facts: { 'aloy.rushingIce': true, 'aloy.iceSeconds': 5 } }),
      no({ element: 'cryo', facts: { 'aloy.rushingIce': false, 'aloy.iceSeconds': 5 } }),
    ), { full: true }],
  ['amber', 'a0', 'critRate', /暴击率提高(\d+)%/, hitCases(['burst.param1'], 'skill.param2')],
  ['amber', 'a1', 'attackPercent', /攻击力提高(\d+)%/, switchFact('amber', 'weakPointWindow')],
  ['amber', 'c2', 'damageBonus', /额外造成(\d+)%伤害/, switchFact('amber', 'manualDetonation', { hit: 'skill.param2' })
    .concat(no({ hit: 'burst.param1', facts: { 'amber.manualDetonation': true } }))],
  ['aratakiitto', 'c4', 'attackPercent', /攻击力提升(\d+)%/, switchFact('aratakiitto', 'oniKingEnded', peer)],
  ['aratakiitto', 'c4', 'defensePercent', /防御力提升(\d+)%/, switchFact('aratakiitto', 'oniKingEnded', peer)],
  ['arlecchino', 'a2', 'pyroBonus', /获得(\d+)%火元素伤害加成/, switchFact('arlecchino', 'inCombat')],
  ['beidou', 'a1', 'damageBonus', /造成的伤害提高(\d+)%/, categories(['normal', 'charged'], 'burst',
    facts({ 'beidou.perfectCounterWindow': true })).concat(no(facts({ 'beidou.perfectCounterWindow': false })))],
  ['beidou', 'a1', 'normalAttackSpeed', /攻击速度提高(\d+)%/, switchFact('beidou', 'perfectCounterWindow')],
  ['beidou', 'c6', 'target.resistance.electro', /雷元素抗性降低(\d+)%/,
    eventCases(cast('beidou.burst'), cast('beidou.skill'), 15000, {
      facts: { 'beidou.stormbreakerNear': true }, omit: ['beidou.stormbreaker'],
    }).concat(
      test(facts({ 'beidou.stormbreaker': true, 'beidou.stormbreakerNear': true })),
      no(facts({ 'beidou.stormbreaker': true, 'beidou.stormbreakerNear': false })),
      no({ event: cast('beidou.burst'), facts: { 'beidou.stormbreakerNear': true } }),
    ), { scale: -.01, full: true }],
  ['bennett', 'c2', 'energyRecharge', /元素充能效率提高(\d+)%/, threshold('hpRatio', .69, .70), { full: true }],
  ['charlotte', 'c4', 'damageBonus', /造成的伤害提升(\d+)%/, hitCases(['burst.param3', 'burst.param6'], 'skill.param1',
    facts({ 'charlotte.photographicMark': true })).concat(no({ hit: 'burst.param3', facts: { 'charlotte.photographicMark': false } }))],
  ['collei', 'c1', 'energyRecharge', /元素充能效率提升(\d+)%/, threshold('onField', false, true), { full: true }],
  ['columbina', 'c2', 'hpPercent', /生命值上限提升(\d+)%/, switchFact('columbina', 'light')],
  ...['hydro', 'electro', 'dendro', 'geo'].map(element => [
    'columbina', 'c6', 'critDamage', /暴击伤害提升(\d+)%/,
    switchFact('columbina', 'c6.' + element, { ...peer, element }).concat(no({
      ...peer, element: 'pyro', facts: { ['columbina.c6.' + element]: true },
    })), { rules: ['c6-crit-' + element] },
  ]),
  ['dehya', 'c1', 'hpPercent', /生命值上限提升(\d+)%/, [test(), no(peer)]],
  ['diluc', 'c1', 'damageBonus', /造成的伤害提高(\d+)%/, threshold('targetHpRatio', .51, .5), { full: true }],
  ['freminet', 'c1', 'critRate', /暴击率提高(\d+)%/,
    hitCases(Array.from({ length: 8 }, (_, i) => 'skill.param' + (i + 4)), 'skill.param1'), { full: true }],
  ['gaming', 'a1', 'damageBonus', /造成的伤害提升(\d+)%/,
    threshold('hpRatio', .5, .49, { hit: 'skill.param1' }).concat(no({ hit: 'normal.param1', facts: { hpRatio: .8 } }))],
  ...[['critRate', /暴击率提升(\d+)%/], ['critDamage', /暴击伤害提升(\d+)%/]].map(([attribute, phrase]) => {
    const gate = { fullMoonsign: true, 'jahoda.fullBottleWindow': true };
    const receiver = { 'jahoda.recipientMoonsign': true, 'jahoda.recipientNearby': true };
    return ['jahoda', 'c6', attribute, phrase, [
      party({ facts: gate, recipientFacts: receiver }),
      party({ facts: { ...gate, fullMoonsign: false }, recipientFacts: receiver }, false),
      party({ facts: { ...gate, 'jahoda.fullBottleWindow': false }, recipientFacts: receiver }, false),
      party({ facts: gate, recipientFacts: { ...receiver, 'jahoda.recipientMoonsign': false } }, false),
      party({ facts: gate, recipientFacts: { ...receiver, 'jahoda.recipientNearby': false } }, false),
    ]];
  }),
  ['kaeya', 'c1', 'critRate', /暴击率提升(\d+)%/, categories(['normal', 'charged'], 'burst', facts({ 'aura.cryo': true, 'aura.frozen': false }))
    .concat(test({ category: 'normal', facts: { 'aura.cryo': false, 'aura.frozen': true } }),
      no({ category: 'normal', facts: { 'aura.cryo': false, 'aura.frozen': false } })), { full: true }],
  ['kamisatoayato', 'c1', 'damageBonus', /造成的伤害提升(\d+)%/, hitCases(
    ['skill.param1', 'skill.param2', 'skill.param3'], 'skill.param6', facts({ targetHpRatio: .5 }),
  ).concat(no({ hit: 'skill.param1', facts: { targetHpRatio: .51 } }),
    ...['c6.shunsuiken', 'c6.shunsuiken-second'].map(hit => test({ hit, rank: 6, facts: { targetHpRatio: .5 } }))), { full: true }],
  ['kamisatoayato', 'c2', 'hpPercent', /提升(\d+)%生命值上限/, threshold('namisen', 3, 2).concat(test(facts({ namisen: 5 })))],
  ['kamisatoayaka', 'c4', 'target.defenseReduction', /防御力降低(\d+)%/, targetHitCases('kamisatoayaka',
    ['burst.param1', 'burst.param2', 'c2.smaller-frostflake-cut', 'c2.smaller-frostflake-bloom'], 'skill.param1', 6000), { full: true }],
  ['keqing', 'c4', 'attackPercent', /攻击力提升(\d+)%/,
    eventCases(reactionEvent('electro-charged'), reactionEvent('vaporize'), 10000).concat(
      ...['aggravate', 'overloaded', 'lunar-charged', 'superconduct', 'hyperbloom', 'quicken'].map(id => test({ event: reactionEvent(id) })),
      no({ event: reactionEvent('electro-charged', 'peer') }),
    ), { full: true }],
  ['lauma', 'c2', 'reaction.lunar.damageBonus', /月绽放反应伤害提升(\d+)%/, [
    party({ family: 'lunar-bloom', facts: { fullMoonsign: true } }),
    party({ family: 'lunar-crystallize', facts: { fullMoonsign: true } }, false),
    party({ family: 'lunar-bloom', facts: { fullMoonsign: false } }, false),
  ], { rules: ['c2-skill-full-moon'] }],
  ['mavuika', 'c1', 'attackPercent', /攻击力提升(\d+)%/, switchFact('mavuika', 'c1Fuel')],
  ['mavuika', 'c2', 'target.defenseReduction', /防御力降低(\d+)%/, [
    test(facts({ 'mavuika.ringActive': true, 'mavuika.flamestrider': false })),
    no(facts({ 'mavuika.ringActive': false, 'mavuika.flamestrider': true })),
    test({ rank: 6, facts: { 'mavuika.ringActive': false, 'mavuika.flamestrider': true } }),
    no({ rank: 6, facts: { 'mavuika.ringActive': false, 'mavuika.flamestrider': false } }),
  ]],
  ['mona', 'c4', 'critRate', /暴击率提升(\d+)%/, switchFact('mona', 'omen', peer).concat(switchFact('mona', 'omen')), { full: true }],
  ['nahida', 'c2', 'target.defenseReduction', /防御力降低(\d+)%/, [
    test(facts({ 'nahida.seedMark': true, 'nahida.seedQuicken': true })),
    no(facts({ 'nahida.seedMark': false, 'nahida.seedQuicken': true })),
    no(facts({ 'nahida.seedMark': true, 'nahida.seedQuicken': false })),
  ]],
  ['nefer', 'c4', 'target.resistance.dendro', /草元素抗性降低(\d+)%/, switchFact('nefer', 'shadowDanceShred'), { scale: -.01 }],
  ['navia', 'c4', 'target.resistance.geo', /岩元素抗性降低(\d+)%/, targetHitCases('navia',
    ['burst.param1', 'burst.param2', 'c2.supporting-fire'], 'skill.param1', 8000), { full: true, scale: -.01 }],
  ['ororon', 'c1', 'damageBonus', /造成的伤害提升(\d+)%/,
    switchFact('ororon', 'nighttide', { hit: 'a0.hypersense', ascension: 1 }).concat(no({
      hit: 'skill.param1', facts: { 'ororon.nighttide': true },
    }))],
  ['razor', 'c4', 'target.defenseReduction', /防御力降低(\d+)%/,
    targetHitCases('razor', ['skill.param1'], 'skill.param2', 7000), { full: true }],
  ['rosaria', 'c6', 'target.resistance.physical', /物理抗性降低(\d+)%/,
    targetHitCases('rosaria', ['burst.param1', 'burst.param2', 'burst.param3'], 'skill.param1', 10000), { full: true, scale: -.01 }],
  ['sangonomiyakokomi', 'a3', 'critRate', /暴击率降低(\d+)%/, [test(), no(peer)], { scale: -.01 }],
  ['sangonomiyakokomi', 'c4', 'normalAttackSpeed', /攻击速度提升(\d+)%/, switchFact('sangonomiyakokomi', 'garment')],
  ['sangonomiyakokomi', 'c6', 'hydroBonus', /获得(\d+)%水元素伤害加成/, [
    test({ element: 'hydro', facts: { 'sangonomiyakokomi.garment': true, 'sangonomiyakokomi.c6Healing': true } }),
    no({ element: 'hydro', facts: { 'sangonomiyakokomi.garment': true, 'sangonomiyakokomi.c6Healing': false } }),
    no({ element: 'hydro', facts: { 'sangonomiyakokomi.garment': false, 'sangonomiyakokomi.c6Healing': true } }),
    no({ element: 'physical', facts: { 'sangonomiyakokomi.garment': true, 'sangonomiyakokomi.c6Healing': true } }),
  ]],
  ['sethos', 'c1', 'critRate', /暴击率提升(\d+)%/, hitCases(['normal.param7'], 'normal.param6'), { full: true }],
  ...[['a0', 'cryoBonus', /冰元素伤害加成提高(\d+)%/, true], ['c2', 'critDamage', /暴击伤害提高(\d+)%/, false]]
    .map(([slot, attribute, phrase, full]) => ['shenhe', slot, attribute, phrase, [
      party({ element: 'cryo', facts: { 'shenhe.burstField': true } }),
      party({ element: 'cryo', facts: { 'shenhe.burstField': true }, recipientFacts: { onField: false } }, false),
      party({ element: 'cryo', facts: { 'shenhe.burstField': false } }, false),
      party({ element: 'hydro', facts: { 'shenhe.burstField': true } }, false),
    ], { full }]),
  ['shenhe', 'a1', 'damageBonus', /点按：元素战技和元素爆发造成的伤害提高(\d+)%/,
    categories(['skill', 'burst'], 'normal', { ...peer, facts: { 'shenhe.tapTalisman': true } }).concat(no({
      ...peer, category: 'burst', facts: { 'shenhe.tapTalisman': false },
    })), { rules: ['talisman-tap'] }],
  ['shenhe', 'a1', 'damageBonus', /长按：普通攻击、重击和下落攻击造成的伤害提高(\d+)%/,
    categories(['normal', 'charged', 'plunge'], 'skill', { ...peer, facts: { 'shenhe.holdTalisman': true } }).concat(no({
      ...peer, category: 'normal', facts: { 'shenhe.holdTalisman': false },
    })), { rules: ['talisman-hold'] }],
  ['skirk', 'c2', 'attackPercent', /攻击力提升(\d+)%/, [
    test(facts({ 'skirk.sevenfold': true, 'skirk.c2Withering': true })),
    no(facts({ 'skirk.sevenfold': false, 'skirk.c2Withering': true })),
    no(facts({ 'skirk.sevenfold': true, 'skirk.c2Withering': false })),
  ]],
  ['skirk', 'c4', 'attackPercent', /攻击力提升(\d+)%\/(\d+)%\/(\d+)%/, [
    no(facts({ 'skirk.deathCrossingStacks': 0 })), ...[1, 2, 3].map(stacks => test({
      ascension: 4, capture: stacks, facts: { 'skirk.deathCrossingStacks': stacks },
    })), no({ ascension: 3, facts: { 'skirk.deathCrossingStacks': 3 } }),
  ], { full: true }],
  ['tighnari', 'c1', 'critRate', /暴击率提高(\d+)%/, categories(['charged'], 'normal'), { full: true }],
  ['valeriy', 'c6', 'damageBonus', /造成的伤害提升(\d+)%/, hitCases(['normal.param5', 'burst.param2'], 'normal.param1')],
  ['valeriy', 'c6', 'critRate', /暴击率提升(\d+)%/, switchFact('valeriy', 'c6Suppressed', { ...peer, element: 'electro' })
    .concat(no({ ...peer, element: 'cryo', facts: { 'valeriy.c6Suppressed': true } }))],
  ['valeriy', 'c6', 'critDamage', /暴击伤害也会提升(\d+)%/,
    switchFact('valeriy', 'c6Suppressed', { ...peer, element: 'electro', family: 'stellar-conduct' })
      .concat(no({ ...peer, element: 'electro', family: 'ordinary', facts: { 'valeriy.c6Suppressed': true } }),
        no({ ...peer, element: 'cryo', family: 'stellar-conduct', facts: { 'valeriy.c6Suppressed': true } }))],
  ...['anemo', 'pyro', 'hydro', 'electro', 'cryo'].map(element => [
    'varka', 'c4', element + 'Bonus', /获得(\d+)%风元素伤害加成/,
    switchFact('varka', 'c4Gift' + (element === 'anemo' ? '' : '.' + element), { ...peer, element }).concat(no({
      ...peer, element: 'geo', facts: { ['varka.c4Gift' + (element === 'anemo' ? '' : '.' + element)]: true },
    })), { rules: ['c4-gift-' + element] },
  ]),
  ['vesna', 'c1', 'reaction.stellar-swirl.damageBonus', /星扩散反应伤害提升(\d+)%/,
    switchFact('vesna', 'stance', { family: 'stellar-swirl' }).concat(no({ family: 'ordinary', facts: { 'vesna.stance': true } }))],
  ['vodyanitsa', 'a0', 'target.resistance.anemo', /风元素抗性降低(\d+)%/, switchFact('vodyanitsa', 'wanderingVortex'), { scale: -.01 }],
  ['vodyanitsa', 'c6', 'reaction.stellar-swirl.elevation', /星扩散反应伤害擢升(\d+)%/,
    switchFact('vodyanitsa', 'longSong', { ...peer, family: 'stellar-swirl' }).concat(no({
      ...peer, family: 'ordinary', facts: { 'vodyanitsa.longSong': true },
    }))],
  ['vodyanitsa', 'c6', 'damageBonus', /水元素伤害与冰元素伤害提升(\d+)%/, [
    ...['hydro', 'cryo'].flatMap(element => switchFact('vodyanitsa', 'longSong', { ...peer, element })),
    no({ ...peer, element: 'anemo', facts: { 'vodyanitsa.longSong': true } }),
  ]],
  ['xiao', 'c2', 'energyRecharge', /元素充能效率提高(\d+)%/, threshold('onField', false, true), { full: true }],
  ['xiao', 'c4', 'defensePercent', /获得(\d+)%防御力提升/, threshold('hpRatio', .49, .5), { full: true }],
  ['xingqiu', 'a1', 'hydroBonus', /获得(\d+)%水元素伤害加成/, [test(), no(peer)], { full: true }],
  ['xingqiu', 'c2', 'target.resistance.hydro', /水元素抗性降低(\d+)%/,
    targetHitCases('xingqiu', ['burst.param1'], 'skill.param1', 4000), { scale: -.01 }],
  ['yanfei', 'c2', 'critRate', /暴击率提高(\d+)%/, threshold('targetHpRatio', .49, .5, { category: 'charged' })
    .concat(no({ category: 'normal', facts: { targetHpRatio: .49 } })), { full: true }],
  ...[['critRate', /暴击率提升(\d+)%/], ['critDamage', /暴击伤害提升(\d+)%/],
    ['reaction.transformative.critRate', /暴击率固定为(\d+)%/], ['reaction.transformative.critDamage', /暴击伤害固定为(\d+)%/]]
    .map(([attribute, phrase]) => {
      const ordinary = attribute.startsWith('reaction.');
      return ['yumemizukimizuki', 'c6', attribute, phrase, switchFact('yumemizukimizuki', 'dreamdrifter', {
        ...peer, family: ordinary ? 'transformative' : 'stellar-swirl', reaction: ordinary ? 'swirl' : undefined,
      }).concat(no({
        ...peer, family: ordinary ? 'transformative' : 'ordinary', reaction: ordinary ? 'overloaded' : undefined,
        facts: { 'yumemizukimizuki.dreamdrifter': true },
      })), { full: true }];
    }),
];

const linkedCharacterIds = new Set(['kaeya', ...certificates.map(([id]) => id)]);
export const currentRosterBuffIds = [...linkedCharacterIds];

function getSource(character, slot, branch) {
  const [prefix] = slot;
  const index = Number(slot.slice(1));
  const group = prefix === 'a' ? 'talents' : 'constellations';
  const sourceId = character.id.replace(/^(aether|lumine)-/, 'traveler');
  const path = sourceRoot + group + '/' + sourceId + '.json';
  const file = new URL(path, import.meta.url);
  const key = prefix === 'a' ? 'passive' + (index + 1) : slot;
  if (existsSync(file)) {
    const values = Object.entries(readContentSource(file));
    const match = values.find(([id, entry]) => id === key && entry?.name === branch.name)
      ?? values.find(([, entry]) => entry?.name === branch.name);
    if (match?.[1].description) return { text: match[1].description, source: 'tools/' + path.slice(3) + '#' + match[0] };
  }
  return { text: branch.description, source: 'src/game-data/data/characters/' + character.id + '.json#' +
    (prefix === 'a' ? '/passives/' + index : '/constellations/' + (index - 1)) + '/description' };
}

export function auditCurrentRosterBuffs(entities, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const prepared = new Map(), rows = [], verified = new Set(), complete = new Set();
  const build = (character, ascension = 0, constellation = 0) => ({
    ...auditBuild(character, weapons.get(novice[character.identity.weaponType])),
    level: ascension === 0 ? 1 : character.progression.promotion[ascension].maxLevel,
    ascension, constellation,
  });
  function teamFor(character, ascension, rank, peerId) {
    const id = JSON.stringify([character.id, ascension, rank, peerId]);
    if (!prepared.has(id)) {
      const result = engine.prepareStructuredBuilds([
        { id: 'actor', build: build(character, ascension, rank) },
        { id: 'peer', build: build(characters.get(peerId)) },
      ]);
      if (!result.ok) throw new Error(character.id + ': ' + JSON.stringify(result.diagnostics));
      prepared.set(id, result.team);
    }
    return prepared.get(id);
  }

  function contribution(character, team, key, rules, settings, ascension) {
    const recipient = settings.recipient ?? 'actor';
    const attacking = settings.hit || recipient === 'actor' ? character : characters.get(settings.peerId ?? 'kaeya');
    const id = settings.hit && character.id + '.' + settings.hit;
    const talent = id ? attacking.talents.find(t => t.hits.some(h => h.id === id)) : attacking.talents[0];
    const hit = id ? talent?.hits.find(h => h.id === id) : talent?.hits[0];
    if (!hit) throw new Error(character.id + ': 缺少查询命中 ' + id);
    const { setup, request } = auditHit(attacking, talent, hit, build(character, ascension).level);
    const frame = request.frame;
    setup.events.find(event => event.id === 'hit').actorId = recipient;
    setup.events.find(event => event.id === 'hit').timeMs = settings.time ?? 1;
    if (settings.event) {
      const trigger = { id: 'trigger', timeMs: 0, order: 0, sourceEventIds: [], facts: {}, ...settings.event };
      if (trigger.kind === 'hit') {
        const source = character.talents.find(t => t.hits.some(h => h.id === trigger.hitId));
        if (!source) throw new Error(character.id + ': 缺少触发命中 ' + trigger.hitId);
        trigger.skillId = source.id;
        trigger.category = source.hits.find(h => h.id === trigger.hitId).category;
      }
      setup.events.unshift(trigger);
    }
    setup.targets.push({ ...structuredClone(setup.targets[0]), id: 'other' });
    setAuditDefaults(character, frame);
    setGateFacts(character, frame, settings.facts ?? {});
    for (const name of settings.omit ?? []) {
      delete frame.facts[name];
      for (const override of frame.factOverrides) delete override.facts[name];
    }
    frame.factOverrides.push({ subject: { kind: 'actor', id: 'peer' }, facts: {
      onField: bool(true), ...Object.fromEntries(Object.entries(settings.recipientFacts ?? {}).map(
        ([name, value]) => [name, typeof value === 'boolean' ? bool(value) : number('scalar', value)],
      )),
    } });
    const context = engine.createStructuredCombatContext(team, setup);
    const actor = context.actors.find(actor => actor.id === 'actor');
    const matching = actor.effects.filter(effect => rules.some(rule => rule.id === effect.id));
    for (const other of context.actors) other.effects = [];
    const target = key.startsWith('target.');
    const binding = { key: ref(target ? key : 'attribute.' + key), at: { kind: 'current', phase: 'same' },
      ...(target ? { kind: 'enemy' } : { kind: 'attribute', actor: { role: 'owner' } }) };
    Object.assign(frame, { ownerId: recipient, recipientId: recipient, contributorId: null, hit: {
      skillId: talent.id, hitId: hit.id, category: settings.category ?? hit.category,
      element: settings.element ?? hit.element, origin: hit.origin, family: settings.family ?? 'ordinary',
      reactionId: settings.reaction ?? null,
    } });
    const read = () => {
      const value = engine.evaluateCombatBindings(team.program, context, { value: binding }, frame).outputs.value;
      return value?.state === 'known' && value.value.kind === 'quantity' ? value.value.value : null;
    };
    const before = read();
    actor.effects = matching;
    const after = read();
    return before === null || after === null ? null : after - before;
  }

  for (const [entity, slot, key, phrase, cases, options = {}] of certificates) {
    const character = characters.get(entity);
    const passive = slot[0] === 'a', rank = passive ? 0 : Number(slot.slice(1));
    const index = passive ? Number(slot.slice(1)) : rank - 1;
    const group = passive ? 'passives' : 'constellations';
    const branch = character[group][index];
    const clause = '/' + group + '/' + index;
    const { text, source } = getSource(character, slot, branch);
    const match = text.replaceAll('**', '').match(phrase);
    if (!match) throw new Error(entity + clause + ': 原文条款与提取条件不符 ' + phrase);
    const attribute = key.startsWith('target.') ? key : 'attribute.' + key;
    const authored = character.metadata[group][index].buffs ?? [];
    const names = options.rules?.map(rule => entity + '.' + rule);
    const paths = authored.flatMap((buff, i) => names && !names.includes(buff.id) ? [] :
      buff.modifiers.flatMap((modifier, j) => modifier.target === attribute ? [clause + '/buffs/' + i + '/modifiers/' + j] : []));
    const field = paths.length === 1 ? paths[0] : clause + '/buffs';
    const includes = definition => !names || names.some(name => definition.id === name || definition.id.startsWith(name + '.'));
    const allowed = branch.ruleIds.filter(includes);
    const ascension = passive ? branch.unlockAscension ?? 0 : 6;
    const activeCase = cases.find(probe => probe.factor > 0);
    const unlocks = passive ? ascension > 0 : true;
    const probes = cases.concat(unlocks ? [{ ...activeCase, locked: true }] : []);
    for (const { settings, factor, locked } of probes) {
      const currentAscension = locked && passive ? ascension - 1 : settings.ascension ?? ascension;
      const currentRank = locked && !passive ? rank - 1 : settings.rank ?? rank;
      const team = teamFor(character, currentAscension, currentRank, settings.peerId ?? 'kaeya');
      const expected = locked ? 0 : Number(match[settings.capture ?? 1]) * (options.scale ?? .01) * factor;
      const value = contribution(character, team, key, allowed, settings, currentAscension);
      const ok = paths.length > 0 && Number.isFinite(value) && Math.abs(value - expected) < 1e-8;
      rows.push({ entity, field, clause, source, settings: { ...settings, attribute: key, rank: currentRank, ascension: currentAscension },
        expected, value, ...(ok ? {} : { issue: '角色增益与原文中的数值或作用范围不符' }) });
    }
    if (options.full) complete.add(entity + clause);
  }
  const failed = new Set(rows.filter(row => row.issue).flatMap(row => [row.entity + row.field, row.entity + row.clause]));
  for (const { entity, field } of rows) if (!failed.has(entity + field)) verified.add(entity + field);
  for (const clause of complete) if (!failed.has(clause)) verified.add(clause);
  return { rows, verified, summary: {
    currentRosterBuffCases: rows.length,
    currentRosterBuffFailures: rows.filter(row => row.issue).length,
    currentRosterBuffFields: verified.size,
    currentRosterBuffClauses: [...complete].filter(clause => verified.has(clause)).length,
  } };
}
