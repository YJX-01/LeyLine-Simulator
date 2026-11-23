import { auditBuild, auditHit } from './roster-evaluation.mjs';

const noviceWeapons = {
  WEAPON_SWORD_ONE_HAND: 'dullblade',
  WEAPON_POLE: 'beginnersprotector',
  WEAPON_CATALYST: 'apprenticesnotes',
  WEAPON_CLAYMORE: 'wastergreatsword',
  WEAPON_BOW: 'huntersbow',
};
const explicit = value => ({ value, provenance: 'explicit', sourceRefs: [] });
const quantity = (unit, value) => explicit({ kind: 'quantity', unit, value });
const boolean = value => explicit({ kind: 'boolean', value });
const enumeration = value => explicit({ kind: 'enum', value });
const attributeRef = id => ({ namespace: 'builtin', id, revision: '1' });
const clauseField = slot => '/' + (slot[0] === 'c' ? 'constellations/' + (Number(slot.slice(1)) - 1) : 'passives/' + slot.slice(1));
const total = result => result.totals.all.state === 'known' ? result.totals.all.value.value : null;

// Clause coefficients are independent expectations from the character text. A parameter reference
// supplies the level curve of the existing hit named by that text.
const constantHits = [
  ['aino', 'c2', 'water-shot', 'coolingFieldAllyHit', { attack: .25, elementalMastery: 1 }],
  ['baizhu', 'c2', 'gossamer-sprite', 'gossamerSpriteReady', { attack: 2.5 }],
  ['chevreuse', 'c2', 'chain-explosion-1', 'chainExplosionReady', { attack: 1.2 }, {}, true],
  ['chevreuse', 'c2', 'chain-explosion-2', 'chainExplosionReady', { attack: 1.2 }, {}, true],
  ['clorinde', 'c1', 'nightwatch-shadow-1', 'nightwatchShadow', { attack: .3 }, {}, true],
  ['clorinde', 'c1', 'nightwatch-shadow-2', 'nightwatchShadow', { attack: .3 }, {}, true],
  ['clorinde', 'c6', 'candle-shadow', 'candleShadow', { attack: 2 }],
  ['collei', 'a0', 'sprout', 'sproutWindow', { attack: .4 }, { 'collei.reactionBeforeRingReturn': true }],
  ['collei', 'c6', 'mini-cuilein-anbar', 'miniCuileinAnbarReady', { attack: 2 }, {}, true],
  ['cyno', 'a0', 'duststalker-bolt', 'endseer', { attack: 1 }],
  ['emilie', 'a0', 'clear-dew', 'twoScentsRefined', { attack: 6 }],
  ['escoffier', 'c6', 'frosty-parfait', 'parfaitReady', { attack: 5 }],
  // KQM TCL docs/characters/electro/fischl.md gives their category and whether Oz captures the panel.
  ['fischl', 'a1', 'sinful-hex-skill', 'ozNearbyElectroReaction', { attack: .8 }, { 'fischl.ozSource': 'skill' }, true],
  ['fischl', 'a1', 'sinful-hex-burst', 'ozNearbyElectroReaction', { attack: .8 }, { 'fischl.ozSource': 'burst' }, true],
  ['fischl', 'c1', 'deep-gaze', 'ravenEyeJointAttack', { attack: .22 }, {}, true],
  ['fischl', 'c4', 'bleak-pilgrimage', null, { attack: 2.22 }],
  ['fischl', 'c6', 'evernight-raven-skill', 'ozJointAttack', { attack: .30 }, { 'fischl.ozSource': 'skill' }],
  ['fischl', 'c6', 'evernight-raven-burst', 'ozJointAttack', { attack: .30 }, { 'fischl.ozSource': 'burst' }],
  ['flins', 'c2', 'thunder-followup', 'c2Followup', { attack: .5 }, { family: 'lunar-charged' }],
  ['ifa', 'c6', 'tonicshot', 'extraTonicshot', { attack: 1.2 }],
  ['ineffa', 'a0', 'thundercloud-discharge', 'birgittaNearThundercloud', { attack: .65 }, { family: 'lunar-charged' }],
  ['ineffa', 'c2', 'edict-burst', 'edictBurstReady', { attack: 3 }, { family: 'lunar-charged' }],
  ['ineffa', 'c6', 'thundercloud-followup', 'thundercloudFollowup', { attack: 1.35 }, { family: 'lunar-charged' }],
  ['kaedeharakazuha', 'a0', 'absorbed-plunge', 'absorbedElement', { attack: 2 }, { active: 'hydro', inactive: 'none' }],
  ['kamisatoayato', 'c6', 'shunsuiken', 'extraSlash', { attack: 4.5 }, {}, true],
  ['kamisatoayato', 'c6', 'shunsuiken-second', 'extraSlash', { attack: 4.5 }, {}, true],
  ['keqing', 'c1', 'thundering-might-departure', 'stilettoRecast', { attack: .5 }, {}, true],
  ['keqing', 'c1', 'thundering-might-arrival', 'stilettoRecast', { attack: .5 }, {}, true],
  ['kirara', 'c4', 'cardamom', 'cardamomReady', { attack: 2 }],
  // The separate direct damage categories are documented in the matching KQM character entries.
  ['klee', 'c4', 'departure-explosion', 'sparksDeparture', { attack: 5.55 }, {}, true],
  ['mitya', 'c4', 'beacon-consumption', 'fiveBeaconsConsumed', { elementalMastery: 3 }, { family: 'stellar-conduct' }],
  ['neuvillette', 'c6', 'current-1', 'extraCurrents', { hp: .1 }],
  ['neuvillette', 'c6', 'current-2', 'extraCurrents', { hp: .1 }],
  ['noelle', 'c4', 'breastplate-break', 'breastplateEnded', { attack: 4 }, {}, true],
  ['odette', 'c1', 'finale-conduct', 'finaleReady', { attack: 3 }, { family: 'stellar-conduct', radiance: 'none' }],
  ['odette', 'c1', 'finale-swirl', 'finaleReady', { attack: 4.5 }, { family: 'stellar-swirl', radiance: 'stellar-swirl' }],
  ['odette', 'c4', 'coordinated-conduct', 'coordinatedReady', { attack: .66 }, { family: 'stellar-conduct', radiance: 'stellar-conduct' }],
  ['odette', 'c4', 'coordinated-swirl', 'coordinatedReady', { attack: .99 }, { family: 'stellar-swirl', radiance: 'stellar-swirl' }],
  ['prune', 'a0', 'absorbed-hammer', 'hunterChimeSwirl', { attack: 1.5 }, { absorbedElement: 'pyro' }],
  ['razor', 'c6', 'lupus-fulgur', 'lupusFulgurReady', { attack: 1 }],
  ['sandrone', 'c4', 'resonator-stellar-conduct', 'resonatorReady', { attack: 1.25 }, {
    family: 'stellar-conduct', 'sandrone.resonatorReaction': 'stellar-conduct',
  }],
  ['sandrone', 'c4', 'resonator-stellar-swirl', 'resonatorReady', { attack: 1.875 }, {
    family: 'stellar-swirl', 'sandrone.resonatorReaction': 'stellar-swirl',
  }],
  ['sandrone', 'c6', 'cluster-laser-ordinary', 'clusterLaserReady', { attack: 1 }, { radiance: 'none' }],
  ['sandrone', 'c6', 'cluster-laser-stellar-conduct', 'clusterLaserReady', { attack: .8 }, { family: 'stellar-conduct', radiance: 'stellar-conduct' }],
  ['sandrone', 'c6', 'cluster-laser-stellar-swirl', 'clusterLaserReady', { attack: 1.2 }, { family: 'stellar-swirl', radiance: 'stellar-swirl' }],
  ['wanderer', 'a1', 'descent-arrow', 'descentDash', { attack: .35 }, { 'wanderer.windfavored': true }],
  ['xiangling', 'c2', 'implosion', 'implosionExpired', { attack: .75 }, {}, true],
  ['yanfei', 'a1', 'blazing-eye', 'chargedCritical', { attack: .8 }, {}, true],
  ['yelan', 'c2', 'exquisite-arrow', 'exquisiteArrowReady', { hp: .14 }, {}, true],
  ...['aether', 'lumine'].flatMap(who => [
    [who + '-anemo', 'a0', 'gale', 'lastNormalSlash', { attack: .6 }, {}, true],
    [who + '-geo', 'a1', 'collapse', 'lastNormalSlash', { attack: .6 }, {}, true],
  ]),
];
const curveHits = [
  ['chasca', 'a1', 'covering-fire', 'nightsoulBurst', 'skill', { attack: 'param3' }, 1.5, {}, []],
  ['chasca', 'a1', 'covering-fire-converted', 'nightsoulBurst', 'skill', { attack: 'param4' }, 1.5, { absorbedElement: 'cryo' }, ['kaeya']],
  ['chiori', 'a0', 'tamoto-coordinated', 'tapestryHit', 'skill', { attack: 'param1', defense: 'param2' }, 1],
  ['chiori', 'c2', 'kinu', 'kinuAttack', 'skill', { attack: 'param5', defense: 'param6' }, 1.7],
  ['chongyun', 'a1', 'rimechaser', 'frostFieldEnded', 'skill', { attack: 'param1' }, 1],
  ['chongyun', 'c6', 'fourth-spirit-blade', null, 'burst', { attack: 'param1' }, 1, {}, [], 4],
  ['eula', 'a0', 'shattered-lightfall', 'spentTwoGrimheart', 'burst', { attack: 'param2' }, .5, {}, [], 1, true],
  ['fischl', 'a0', 'stellar-predator', 'chargedArrowStruckOz', 'normal', { attack: 'param7' }, 1.527, {}, [], 1, true],
  ['kaeya', 'c6', 'fourth-icicle', 'fourthIcicleContact', 'burst', { attack: 'param1' }, 1, {}, [], 4],
  ['kamisatoayaka', 'c2', 'smaller-frostflake-cut', null, 'burst', { attack: 'param1' }, .2, {}, [], 1, true],
  ['kamisatoayaka', 'c2', 'smaller-frostflake-bloom', null, 'burst', { attack: 'param2' }, .2, {}, [], 1, true],
  ['klee', 'c1', 'chained-reactions', 'chainedSpark', 'burst', { attack: 'param1' }, 1.2, {}, [], 1, true],
  ['lanyan', 'a0', 'absorbed-ring', 'absorbedElement', 'skill', { attack: 'param1' }, .5, { active: 'cryo', inactive: 'none' }],
  ['lyney', 'c6', 'reprised-strike', 'propArrowFired', 'normal', { attack: 'param15' }, .8, {}, [], 4, true],
  ['navia', 'c2', 'supporting-fire', 'barrageReady', 'burst', { attack: 'param2' }, 1],
  // KQM TCL docs/characters/hydro/tartaglia.md C4 gives the damage category of both independent triggers.
  ['tartaglia', 'c4', 'riptide-flash', 'c4RiptideTick', 'normal', { attack: 'param9' }, 1, { 'tartaglia.ragingTideMelee': false }, [], 2, true],
  ['tartaglia', 'c4', 'riptide-slash', 'c4RiptideTick', 'skill', { attack: 'param11' }, 1, { 'tartaglia.ragingTideMelee': true }, [], 4, true],
  ['wriothesley', 'a0', 'rebuke-vaulting-fist', 'graciousRebuke', 'normal', { attack: 'param7' }, 1.5],
  ['wriothesley', 'c6', 'gracious-icicle', 'graciousRebuke', 'normal', { attack: 'param7' }, 3, {}, [], 4],
  ['yelan', 'c6', 'mastermind-barb', 'mastermind', 'normal', { hp: 'param7' }, 1.56],
  ['zibai', 'c4', 'lunar-flourish', 'lunarFlourish', 'skill', { defense: 'param3' }, 2.5, {
    family: 'lunar-crystallize', 'zibai.lunarPhase': true, fullMoonsign: true,
  }, [], 4],
  ...Array.from({ length: 5 }, (_, i) => [
    'yoimiya', 'c6', 'kindling-arrow-' + (i + 1), 'extraKindlingArrow', 'normal',
    { attack: 'param' + (i + 1) }, .6, { 'yoimiya.niwabi': true },
  ]),
  ...Array.from({ length: 4 }, (_, i) => [
    'wanderer', 'c6', 'kuugo-param' + (i + 1), 'extraKuugo', 'normal',
    { attack: 'param' + (i + 1) }, .4, { 'wanderer.windfavored': true },
  ]),
];
const familyConstant = { 'lunar-charged': 3, 'lunar-crystallize': 1.6, 'stellar-conduct': 1.45, 'stellar-swirl': 1 };
const fieldOn = id => ({ [id]: { onField: boolean(true) } });
const actorFact = (id, key, value) => ({ [id]: { [key]: value } });
const plungeAssistance = (recipient, active) => ({
  peers: ['kaeya'], recipient, category: 'plunge', actors: fieldOn(recipient),
  query: { 'xianyun.adeptalAssistanceTarget': boolean(active) },
  input: ['whiteAttack', 'attack', 5000],
});
const cast = (entity, skill, actor = 'actor') => ({
  id: 'trigger', kind: 'action', actorId: actor, timeMs: 0, order: 0, skillId: entity + '.' + skill,
  targetIds: [], sourceEventIds: [], facts: {},
});
const stateChange = (key, actor) => ({
  id: 'trigger', kind: 'state-change', actorId: actor, timeMs: 0, order: 0,
  targetIds: [], sourceEventIds: [], facts: { [key]: boolean(true) },
});
const enemyHit = (hitId, targetId = 'enemy') => ({
  id: 'trigger', kind: 'hit', actorId: 'actor', timeMs: 0, order: 0, skillId: hitId.split('.').slice(0, 2).join('.'),
  hitId, category: hitId.split('.')[1], targetIds: [targetId], sourceEventIds: [], facts: {},
});

// Every row explicitly names the grant and the observed state, event or party identity that controls it.
const attributeCases = [
  ['aino', 'c1', 'field-mastery', 'elementalMastery', 80, {
    peers: ['kaeya'], event: cast('aino', 'skill'), actors: fieldOn('peer0'), recipient: 'peer0', expiry: 15000,
  }, false],
  ['aino', 'c1', 'field-mastery', 'elementalMastery', 80, { event: cast('aino', 'burst'), expiry: 15000 }, false],
  ['aino', 'c1', 'field-mastery', 'elementalMastery', 0, { peers: ['kaeya'], event: cast('aino', 'skill'), recipient: 'peer0', actors: {
    peer0: { onField: boolean(false) },
  } }, true],
  ['albedo', 'c4', 'isotoma-plunge', 'damageBonus', .3, {
    peers: ['kaeya'], recipient: 'peer0', category: 'plunge', actors: { peer0: { onField: boolean(true), 'albedo.isotomaArea': boolean(true) } },
  }, true],
  ['albedo', 'c4', 'isotoma-plunge', 'damageBonus', 0, {
    peers: ['kaeya'], recipient: 'peer0', category: 'skill', actors: { peer0: { onField: boolean(true), 'albedo.isotomaArea': boolean(true) } },
  }],
  ['alhaitham', 'a1', 'mysteries-laid-bare', 'damageBonus', .001, {
    hit: 'alhaitham.skill.param4', input: ['elementalMastery', 'elementalMastery', 500], expected: .5,
  }, true],
  ['alhaitham', 'a1', 'mysteries-laid-bare', 'damageBonus', 0, {
    hit: 'alhaitham.skill.param1', input: ['elementalMastery', 'elementalMastery', 500],
  }],
  ['alhaitham', 'c6', 'excess-mirror', 'critRate', .1, { actors: actorFact('actor', 'alhaitham.excessMirrorWindow', boolean(true)) }, false],
  ['alhaitham', 'c6', 'excess-mirror', 'critDamage', .7, { actors: actorFact('actor', 'alhaitham.excessMirrorWindow', boolean(true)) }, true],
  ['alhaitham', 'c6', 'excess-mirror', 'critDamage', 0, { actors: actorFact('actor', 'alhaitham.excessMirrorWindow', boolean(false)) }],
  ['aratakiitto', 'c6', 'charged-crit', 'critDamage', .7, { category: 'charged' }],
  ['aratakiitto', 'c6', 'charged-crit', 'critDamage', 0, { category: 'normal' }],
  ['baizhu', 'a0', 'five-fortunes', 'healingBonus', .2, { actors: actorFact('actor', 'hpRatio', quantity('scalar', .49)) }, true],
  ['baizhu', 'a0', 'five-fortunes', 'healingBonus', 0, { actors: actorFact('actor', 'hpRatio', quantity('scalar', .5)) }],
  ['baizhu', 'a0', 'five-fortunes', 'dendroBonus', .25, { actors: actorFact('actor', 'hpRatio', quantity('scalar', .5)) }],
  ['barbara', 'c2', 'melody-loop-hydro', 'hydroBonus', .15, {
    peers: ['kaeya'], recipient: 'peer0', actors: { actor: { 'barbara.melodyLoop': boolean(true) }, ...fieldOn('peer0') },
  }],
  ['barbara', 'c2', 'melody-loop-hydro', 'hydroBonus', 0, {
    peers: ['kaeya'], recipient: 'peer0', actors: { actor: { 'barbara.melodyLoop': boolean(false) }, ...fieldOn('peer0') },
  }],
  ...['kaeya', 'amber'].map(peer => ['bennett', 'c6', 'inspiration-pyro', 'pyroBonus', .15, {
    event: cast('bennett', 'burst'), expiry: 12000, peers: [peer], recipient: 'peer0',
    actors: { peer0: { onField: boolean(true), 'bennett.inField': boolean(true) } },
  }]),
  ...['diluc', 'lisa', 'kaeya'].map((peer, index) => ['chevreuse', 'a1', 'overcharged-armament', 'attackPercent', index === 2 ? 0 : .4, {
    peers: [peer], recipient: 'peer0', actors: actorFact('actor', 'chevreuse.overchargedBallFired', boolean(true)),
    input: ['whiteHp', 'hp', 45000],
  }, true]),
  ['citlali', 'c2', 'mastery', 'elementalMastery', 125, {}],
  ['citlali', 'c2', 'shield-mastery', 'elementalMastery', 250, {
    peers: ['kaeya'], recipient: 'peer0', actors: actorFact('peer0', 'citlali.whiteShieldOrItzpapa', boolean(true)),
  }],
  ['diona', 'c6', 'signature-mix', 'incomingHealingBonus', .3, {
    peers: ['kaeya'], recipient: 'peer0', actors: { peer0: { 'diona.signatureMixArea': boolean(true), hpRatio: quantity('scalar', .5) } },
  }, true],
  ['diona', 'c6', 'signature-mix', 'elementalMastery', 200, {
    peers: ['kaeya'], recipient: 'peer0', actors: { peer0: { 'diona.signatureMixArea': boolean(true), hpRatio: quantity('scalar', .51) } },
  }],
  ['durin', 'c4', 'dragon-burst', 'damageBonus', .4, { category: 'burst' }, true],
  ['durin', 'c4', 'dragon-burst', 'damageBonus', 0, { category: 'skill' }],
  ['durin', 'c6', 'black-dragon-defense-ignore', 'defenseIgnore', .4, { hit: 'durin.burst.param8' }],
  ['durin', 'c6', 'black-dragon-defense-ignore', 'defenseIgnore', 0, { hit: 'durin.burst.param7' }],
  ['emilie', 'c2', 'perfume-shred', 'target.resistance.dendro', -.3, {
    event: enemyHit('emilie.skill.param2'), expiry: 10000,
  }, true],
  ['fischl', 'c2', 'nightrider-summon', 'baseDamageBonus', 2 * 1000 * 1.24, {
    hit: 'fischl.skill.param2', input: ['whiteAttack', 'attack', 1000],
  }, true],
  ['fischl', 'c2', 'nightrider-summon', 'baseDamageBonus', 0, {
    hit: 'fischl.skill.param1', input: ['whiteAttack', 'attack', 1000],
  }],
  ['gaming', 'c6', 'charmed-cloudstrider-crit', 'critRate', .2, { hit: 'gaming.skill.param1' }],
  ['gaming', 'c6', 'charmed-cloudstrider-crit', 'critDamage', .4, { hit: 'gaming.skill.param1' }, true],
  ['gaming', 'c6', 'charmed-cloudstrider-crit', 'critDamage', 0, { hit: 'gaming.normal.param10' }],
  ['ifa', 'a1', 'nightsoul-burst-mastery', 'elementalMastery', 80, {
    peers: ['kaeya'], event: stateChange('nightsoulBurst', 'peer0'), expiry: 10000,
  }],
  ['kinich', 'c4', 'dragon-damage', 'damageBonus', .7, { hit: 'kinich.burst.param2' }],
  ['kinich', 'c2', 'first-cannon', 'damageBonus', 1, { hit: 'kinich.skill.param2', query: { 'kinich.firstCannon': boolean(true) } }],
  ['kinich', 'c2', 'first-cannon', 'damageBonus', 0, { hit: 'kinich.skill.param2', query: { 'kinich.firstCannon': boolean(false) } }],
  ['klee', 'c2', 'mine-defence', 'target.defenseReduction', .23, { event: enemyHit('klee.skill.param4'), expiry: 10000 }, true],
  ['klee', 'c2', 'mine-defence', 'target.defenseReduction', 0, { event: enemyHit('klee.skill.param1') }],
  ['layla', 'c6', 'stellar-stars', 'damageBonus', .4, { hit: 'layla.skill.param2' }],
  ['layla', 'c6', 'stellar-stars', 'damageBonus', .4, { hit: 'layla.burst.param1' }],
  ['layla', 'c6', 'stellar-stars', 'damageBonus', 0, { hit: 'layla.skill.param1' }],
  ['lisa', 'a1', 'lightning-rose-defence', 'target.defenseReduction', .15, { event: enemyHit('lisa.burst.param1'), expiry: 10000 }, true],
  ...[[], ['kaeya'], ['kaeya', 'kamisatoayaka'], ['kaeya', 'amber', 'noelle']].map((peers, i) =>
    ['lynette', 'a0', 'sophisticated-synergy', 'attackPercent', [.08, .12, .12, .20][i], {
      peers, event: cast('lynette', 'burst'), expiry: 10000,
    }, true]),
  ['navia', 'a1', 'mutual-assistance', 'attackPercent', .4, { peers: ['kaeya', 'lisa', 'amber'] }, true],
  ['navia', 'a1', 'mutual-assistance', 'attackPercent', 0, { peers: ['noelle', 'lynette'] }],
  ['noelle', 'c2', 'combat-maid', 'damageBonus', .15, { category: 'charged' }],
  ['razor', 'c2', 'suppression', 'critRate', .1, { target: { targetHpRatio: quantity('scalar', .29) } }, true],
  ['razor', 'c2', 'suppression', 'critRate', 0, { target: { targetHpRatio: quantity('scalar', .3) } }],
  ['rosaria', 'a1', 'shadow-samaritan', 'critRate', .12, {
    peers: ['kaeya'], recipient: 'peer0', event: cast('rosaria', 'burst'), expiry: 10000,
    actors: actorFact('actor', 'rosaria.critAtBurst', quantity('scalar', .8)),
  }, true],
  ['rosaria', 'a1', 'shadow-samaritan', 'critRate', 0, {
    peers: ['kaeya'], event: cast('rosaria', 'burst'),
    actors: actorFact('actor', 'rosaria.critAtBurst', quantity('scalar', .8)),
  }],
  ['shikanoinheizou', 'a1', 'penetrative-reasoning', 'elementalMastery', 80, {
    peers: ['kaeya'], recipient: 'peer0', event: enemyHit('shikanoinheizou.skill.param1'), expiry: 10000,
  }, true],
  ['shikanoinheizou', 'a1', 'penetrative-reasoning', 'elementalMastery', 0, { event: enemyHit('shikanoinheizou.skill.param1') }],
  ['tartaglia', 'c1', 'raging-tide-cooldown', 'elementalSkillCooldownReduction', .2, {}, true],
  ['thoma', 'c6', 'burning-heart', 'damageBonus', .15, {
    peers: ['kaeya'], recipient: 'peer0', category: 'charged', actors: actorFact('actor', 'thoma.blazingBarrierRefresh', boolean(true)),
  }, true],
  ['thoma', 'c6', 'burning-heart', 'damageBonus', 0, {
    peers: ['kaeya'], recipient: 'peer0', category: 'burst', actors: actorFact('actor', 'thoma.blazingBarrierRefresh', boolean(true)),
  }],
  ['venti', 'c4', 'hurricane-freedom', 'anemoBonus', .25, { actors: actorFact('actor', 'venti.particlePickupWindow', boolean(true)) }, true],
  ['xianyun', 'a1', 'adeptal-assistance', 'baseDamageBonus', 9000, plungeAssistance('peer0', true), true],
  ['xianyun', 'a1', 'adeptal-assistance', 'baseDamageBonus', 0, plungeAssistance('peer0', false)],
  ['xianyun', 'c2', 'adeptal-assistance', 'baseDamageBonus', 18000, plungeAssistance('actor', true)],
  ['xianyun', 'c2', 'adeptal-assistance', 'baseDamageBonus', 0, {
    ...plungeAssistance('peer0', true), actors: { peer0: { onField: boolean(false) } },
  }],
  ['xiangling', 'c1', 'guoba-shred', 'target.resistance.pyro', -.15, { event: enemyHit('xiangling.skill.param1'), expiry: 6000 }, true],
  ['xingqiu', 'c4', 'evilsoother', 'baseMultiplier', .5, { hit: 'xingqiu.skill.param1', actors: actorFact('actor', 'xingqiu.raincutterActive', boolean(true)) }, true],
  ['xinyan', 'c4', 'sweeping-fervor-shred', 'target.resistance.physical', -.15, { event: enemyHit('xinyan.skill.param1'), expiry: 12000 }, true],
  ['yaemiko', 'c4', 'sakura-electro', 'electroBonus', .2, {
    peers: ['kaeya'], recipient: 'peer0', event: enemyHit('yaemiko.skill.param1'), expiry: 5000,
  }, true],
  ['yelan', 'a0', 'turn-control', 'hpPercent', .18, { peers: ['kaeya', 'kamisatoayaka', 'amber'] }, true],
  ['yelan', 'a0', 'turn-control', 'hpPercent', .30, { peers: ['kaeya', 'noelle', 'amber'] }, true],
  ['yoimiya', 'c2', 'procession-pyro', 'pyroBonus', .25, { actors: actorFact('actor', 'yoimiya.pyroCritWindow', boolean(true)) }, true],
  ...['aether', 'lumine'].map(who => [who + '-geo', 'c1', 'invincible-stonewall', 'critRate', .1, {
    peers: ['kaeya'], recipient: 'peer0', actors: actorFact('peer0', who + '-geo.stonewallEnclosed', boolean(true)),
  }]),
];

const auditCharacterIds = new Set([
  ...constantHits.map(row => row[0]), ...curveHits.map(row => row[0]), ...attributeCases.map(row => row[0]),
  'kaeya', 'amber', 'diluc', 'kamisatoayaka', 'lisa', 'lynette', 'noelle',
]);
export const characterClauseAuditIds = [...auditCharacterIds];

export function auditCharacterClauseGrants(entities, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const rows = [], complete = new Set(), teams = new Map();

  function prepare(entity, slot, unlocked, peers) {
    const key = JSON.stringify([entity, slot, unlocked, peers]);
    if (!teams.has(key)) {
      const buildFor = id => {
        const character = characters.get(id);
        return { ...auditBuild(character, weapons.get(noviceWeapons[character.identity.weaponType])), level: 80, ascension: 6 };
      };
      const build = buildFor(entity);
      const index = Number(slot.slice(1));
      if (slot[0] === 'c') build.constellation = index - Number(!unlocked);
      else build.ascension = Math.max(0, (build.character.passives[index].unlockAscension ?? 0) - Number(!unlocked));
      if (slot[0] === 'a') build.level = build.character.progression.promotion[build.ascension].maxLevel;
      const result = engine.prepareStructuredBuilds([{ id: 'actor', build }, ...peers.map((id, i) => ({ id: 'peer' + i, build: buildFor(id) }))]);
      if (!result.ok) throw new Error(entity + ' ' + JSON.stringify(result.diagnostics));
      teams.set(key, { build, team: result.team });
    }
    return teams.get(key);
  }

  function readAttribute(team, context, frame, key) {
    const target = key.startsWith('target.');
    const binding = target ? { kind: 'enemy', key: attributeRef(key), at: { kind: 'current', phase: 'same' } } : {
      kind: 'attribute', key: attributeRef('attribute.' + key), actor: { role: 'owner' }, at: { kind: 'current', phase: 'same' },
    };
    const value = engine.evaluateCombatBindings(team.program, context, { value: binding }, frame).outputs.value;
    return value?.state === 'known' ? value.value.value : null;
  }

  function settings(build, team, hitId, options = {}) {
    const character = build.character;
    const talent = hitId ? character.talents.find(t => t.hits.some(h => h.id === hitId)) : character.talents[0];
    const hit = hitId ? talent?.hits.find(h => h.id === hitId) : talent?.hits[0];
    if (!hit) throw new Error(character.id + ' missing hit ' + hitId);
    const { setup, request } = auditHit(character, talent, hit, build.level);
    const recipient = options.recipient ?? 'actor';
    const event = setup.events.find(event => event.id === 'hit');
    event.timeMs = options.time ?? 1;
    if (options.event) setup.events.unshift(options.event);
    Object.assign(setup.targets[0].facts, options.target);
    Object.assign(request.frame.facts, options.query);
    for (const [id, facts] of Object.entries(options.actors ?? {})) {
      const existing = request.frame.factOverrides.find(row => row.subject.kind === 'actor' && row.subject.id === id);
      if (existing) Object.assign(existing.facts, facts);
      else request.frame.factOverrides.push({ subject: { kind: 'actor', id }, facts });
    }
    for (const [key, value] of Object.entries(options.teamFacts ?? {})) setup.team.facts[key] = value;
    const context = engine.createStructuredCombatContext(team, setup);
    for (const actor of context.actors) {
      actor.effects = actor.id === 'actor' ? actor.effects.filter(options.effect ?? (() => false)) : [];
      if (actor.id === 'actor' && options.input) {
        const [key, unit, value] = options.input;
        actor.inputs[key] = quantity(unit, value);
      }
    }
    const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
      hit: { skillId: talent.id, hitId: hit.id, category: options.category ?? hit.category, element: options.element ?? hit.element,
        origin: hit.origin, family: options.family ?? 'ordinary', reactionId: null } };
    return { setup, request, context, frame };
  }

  function record(entity, field, settings, value, expected) {
    const ok = expected === null ? value === null
      : Number.isFinite(value) && Math.abs(value - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
    rows.push({ entity, field, settings, value, expected, ...(ok ? {} : { issue: '命中或条款授予与独立数值核对不符' }) });
  }

  function checkHit(spec) {
    const { entity, slot, key, readiness, terms, extra, full, skill, factor, peers, rankLevel } = spec;
    const hitId = entity + '.' + slot + '.' + key;
    const field = clauseField(slot);
    if (full) complete.add(entity + field);
    const readyKey = readiness === 'absorbedElement' ? readiness : entity + '.' + readiness;
    const family = extra.family ?? 'ordinary';
    for (const [unlocked, active] of readiness ? [[true, true], [true, false], [false, true]] : [[true, true], [false, true]]) {
      const { build, team } = prepare(entity, slot, unlocked, peers);
      const query = {}, actors = {}, teamFacts = {};
      const inputs = { ...extra };
      delete inputs.family;
      delete inputs.active;
      delete inputs.inactive;
      if (readiness) inputs[readyKey] = active ? extra.active ?? true : extra.inactive ?? false;
      if (family === 'stellar-conduct') query.stellarAttachments = quantity('count', 1);
      for (const [key, value] of Object.entries(inputs)) {
        const input = typeof value === 'boolean' ? boolean(value) : enumeration(value);
        const scope = build.character.metadata.facts?.[key]?.scope;
        if (key === 'fullMoonsign') teamFacts[key] = input;
        else if (scope === 'owner' || key === 'radiance') (actors.actor ??= {})[key] = input;
        else query[key] = input;
      }
      const effects = ref => ref.id === hitId + '-factor'
        || entity === 'yoimiya' && ref.id === 'yoimiya.niwabi-multiplier'
        || entity === 'wanderer' && ref.id === 'wanderer.stance-normal'
        || entity === 'wriothesley' && ['wriothesley.a0.gracious-rebuke','wriothesley.c6.gracious-icicle-enhanced'].includes(ref.id);
      const { setup, request, context, frame } = settings(build, team, hitId, { actors, query, teamFacts, effect: effects, family });
      const element = query.absorbedElement?.value?.value ?? frame.hit.element;
      const parameter = name => build.character.talents.find(t => t.id === entity + '.' + skill)
        .parameters.find(p => p.id === name).values[rankLevel - 1];
      let base = 0;
      for (const [stat, multiplier] of Object.entries(terms)) {
        const basis = readAttribute(team, context, frame, stat);
        base += basis * (typeof multiplier === 'number' ? multiplier : parameter(multiplier));
      }
      let correction = factor;
      if (entity === 'yoimiya') correction *= build.character.talents[1].parameters.find(p => p.id === 'param4').values[3];
      if (entity === 'wanderer' && slot === 'c6') correction *= build.character.talents[1].parameters.find(p => p.id === 'param2').values[3];
      const mastery = family === 'ordinary' ? 0 : readAttribute(team, context, frame, 'elementalMastery');
      const damage = family === 'ordinary' ? base * correction * .5 * .9 * (1 + readAttribute(team, context, frame, element + 'Bonus'))
        : base * correction * familyConstant[family] * .9 * (1 + 6 * mastery / (2000 + mastery));
      const result = engine.evaluateStructuredHit(team, setup, request, { context });
      record(entity, field, { hit: hitId, unlocked, active, family }, total(result), unlocked && active ? damage : 0);
      if (unlocked && active && Object.keys(request.frame.captures).length) {
        request.frame.captures = {};
        const missingCapture = engine.evaluateStructuredHit(team, setup, request, { context });
        record(entity, field, { hit: hitId, family, capture: '未填写' }, total(missingCapture), null);
      }
      if (unlocked && active && entity === 'tartaglia') {
        const changed = settings(build, team, hitId, { actors: actorFact('actor', 'tartaglia.ragingTideMelee', boolean(!extra['tartaglia.ragingTideMelee'])), query });
        record(entity, field, { hit: hitId, family, stance: '另一姿态' },
          total(engine.evaluateStructuredHit(team, changed.setup, changed.request, { context: changed.context })), 0);
      }
    }
  }

  for (const [entity, slot, key, readiness, terms, extra = {}, full] of constantHits) {
    checkHit({ entity, slot, key, readiness, terms, extra, full, factor: 1, peers: [] });
  }
  for (const [entity, slot, key, readiness, skill, terms, factor, extra = {}, peers = [], rankLevel = 1, full] of curveHits) {
    checkHit({ entity, slot, key, readiness, skill, terms, factor, extra, peers, rankLevel, full });
  }
  for (const [entity, slot, key, attribute, expected, options, full] of attributeCases) {
    const field = clauseField(slot), id = entity + '.' + slot + '.' + key;
    if (full) complete.add(entity + field);
    const peers = options.peers ?? [];
    for (const [unlocked, time] of [[true, 1], [false, 1], ...(options.expiry ? [[true, options.expiry - 1], [true, options.expiry]] : [])]) {
      const { build, team } = prepare(entity, slot, unlocked, peers);
      const read = effect => {
        const { context, frame } = settings(build, team, options.hit, { ...options, effect, time });
        return readAttribute(team, context, frame, attribute);
      };
      const on = read(ref => ref.id === id || ref.id.startsWith(id + '.'));
      const off = read();
      record(entity, field, { attribute, rule: id, hit: options.hit, unlocked, time, recipient: options.recipient ?? 'actor' },
        on === null || off === null ? null : on - off, unlocked && time !== options.expiry ? options.expected ?? expected : 0);
    }
  }
  const failed = new Set(rows.filter(row => row.issue).map(row => row.entity + row.field));
  const verified = [...complete].filter(field => !failed.has(field));
  return { rows, verified, summary: {
    characterClauseGrantCases: rows.length,
    characterClauseGrantFailures: rows.filter(row => row.issue).length,
    characterClauseGrantsVerified: verified.length,
  } };
}
