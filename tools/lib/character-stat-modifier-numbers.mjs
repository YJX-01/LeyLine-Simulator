import { combatFactDeclaration } from '../../src/schema/src/calculation/buffs.mjs';
import { resolveHitElement } from '../../src/schema/src/calculation/hit-bindings.mjs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

const snapshot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const capture = snapshot + 'ChineseSimplified/';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const ascensionRank = { a: 'passives', c: 'constellations', t: 'talents' };
const peerElements = { anemo: 'sucrose', cryo: 'kaeya', dendro: 'collei', electro: 'lisa', geo: 'noelle', hydro: 'barbara', pyro: 'amber' };
const attribute = key => 'attribute.' + key;
const close = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-9);
const sample = (expected, settings = {}) => ({ expected, settings });
const excludes = settings => sample(0, settings);
const cast = skill => ({ kind: 'action', skill });
const strike = hit => ({ kind: 'hit', hit });
const reaction = (reactionId, reactionElement) => ({ kind: 'reaction', reactionId, reactionElement });
const observed = (key, value) => ({ kind: 'state-change', facts: { [key]: value } });
const peer = (recipient = 'kaeya', ...others) => ({ recipient, party: [recipient, ...others] });
const values = (settings, update) => ({ ...settings, values: { ...settings.values, ...update } });
const gated = (amount, key, settings = {}) => [
  sample(amount, values(settings, { [key]: true })), excludes(values(settings, { [key]: false })),
];

function timed(amount, trigger, seconds, settings = {}, wrongTrigger) {
  const active = { ...settings, triggers: [trigger] };
  return [
    sample(amount, { ...active, timeMs: 1 }),
    sample(amount, { ...active, timeMs: 1000 * seconds - 1 }),
    excludes({ ...active, timeMs: 1000 * seconds }),
    excludes(settings),
    ...(wrongTrigger ? [excludes({ ...settings, triggers: [wrongTrigger] })] : []),
  ];
}

function hitFor(character, suffix) {
  const id = character.id + '.' + suffix;
  const talent = suffix ? character.talents.find(entry => entry.hits.some(hit => hit.id === id)) : character.talents[0];
  return [talent, suffix ? talent?.hits.find(hit => hit.id === id) : talent?.hits[0]];
}

function original(entity, clause) {
  const sourceEntity = entity.replace(/^(aether|lumine)-/, 'traveler');
  const group = ascensionRank[clause[0]];
  const index = Number(clause.slice(1));
  const key = group === 'constellations' ? clause : (group === 'passives' ? 'passive' : 'combat') + (index + 1);
  const path = capture + (group === 'constellations' ? group : 'talents') + '/' + sourceEntity + '.json';
  return { text: read(path)[key].description.replaceAll('**', ''), ref: path + '#/' + key + '/description' };
}

function traceContribution(reading, identity, supplier, recipient) {
  const output = reading.outputs.value;
  if (output?.state !== 'known' || output.value.kind !== 'quantity') return NaN;
  const reachable = new Set([output.traceId]);
  let actual = 0;
  for (const trace of reading.trace.toReversed()) {
    if (!reachable.has(trace.id)) continue;
    for (const dependency of trace.dependencies) reachable.add(dependency);
    if (trace.kind !== 'effect' || trace.definition.id !== identity.id || trace.definition.revision !== identity.revision
      || trace.definition.namespace !== identity.namespace || trace.context?.actorId !== supplier || trace.context.recipientId !== recipient) continue;
    if (trace.state !== 'known' || trace.value?.kind !== 'quantity') return NaN;
    actual += trace.value.value;
  }
  return actual;
}

/** Compare current character modifiers to independently sourced numbers and scenario exclusions. */
export function characterStatModifierNumbers(entities, results, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const occupied = new Set((results.registeredModifierEvidence ?? []).map(row => row.key));
  const choices = new Map(), prepared = new Map(), output = [];
  for (const row of results.calculator.buffs) {
    const key = row.entity + row.field;
    choices.set(key, choices.has(key) ? null : row);
  }

  function teamFor(entity, settings) {
    const { ascension, constellation, party = [], weapon, weaponLevel = 1, weaponAscension = 0 } = settings;
    const key = JSON.stringify([entity, ascension, constellation, party, weapon, weaponLevel, weaponAscension]);
    if (prepared.has(key)) return prepared.get(key);
    const actors = [entity, ...party].map((id, index) => {
      const character = characters.get(id);
      const equipment = character && weapons.get((index === 0 && weapon) || novice[character.identity.weaponType]);
      if (!equipment) return;
      const build = auditBuild(character, equipment);
      if (index === 0) {
        build.ascension = ascension;
        build.level = ascension ? character.progression.promotion[ascension].maxLevel : 1;
        build.constellation = constellation;
        build.weaponLevel = weaponLevel;
        build.weaponAscension = weaponAscension;
      }
      return { id, build };
    });
    const result = actors.every(Boolean) && engine.prepareStructuredBuilds(actors);
    const team = result?.ok ? result.team : null;
    prepared.set(key, team);
    return team;
  }

  function measure(supplier, definition, windowFact, settings) {
    const built = teamFor(supplier, settings);
    const { recipient, hit: suffix, values: observedValues = {}, recipientValues = {}, triggers = [], timeMs = 1,
      onField = true, reaction: queryReaction, family, reactionElement } = settings;
    const dealer = characters.get(recipient), owner = characters.get(supplier);
    if (!built || !dealer || ![supplier, ...(settings.party ?? [])].includes(recipient)) return;
    const [talent, hit] = hitFor(dealer, suffix);
    if (!hit) return;
    const { setup, request } = auditHit(dealer, talent, hit);
    const { frame } = request;
    const initial = frame.factOverrides[0];
    if (recipient !== supplier) {
      initial.subject = { kind: 'actor', id: recipient };
      frame.factOverrides.unshift({ subject: { kind: 'actor', id: 'actor' }, facts: {} });
    }
    setAuditDefaults(owner, frame);
    const ownerRow = frame.factOverrides[0];
    ownerRow.subject = { kind: 'actor', id: supplier };
    ownerRow.facts.onField = bool(recipient === supplier && onField);
    initial.facts.onField = bool(onField);
    for (const [key, field] of Object.entries(owner.metadata.facts ?? {})) {
      if (field.scope === 'recipient' && field.type.kind === 'boolean' && !Object.hasOwn(initial.facts, key)) initial.facts[key] = bool(false);
    }
    if (windowFact) for (const row of frame.factOverrides) delete row.facts[windowFact];
    for (const [key, value] of Object.entries({ ...observedValues, ...recipientValues })) {
      const field = combatFactDeclaration(owner.metadata.facts, key);
      if (!field) throw new Error(supplier + ': 缺少对照事实 ' + key);
      const input = typeof value === 'boolean' ? bool(value) : typeof value === 'number' ? number(field.type.unit, value) : fact({ kind: 'enum', value });
      if (field.scope === 'query') {
        frame.facts[key] = input;
        continue;
      }
      const kind = field.scope === 'team' ? 'team' : field.scope === 'target' ? 'target' : 'actor';
      const id = kind === 'team' ? undefined : kind === 'target' ? 'enemy'
        : field.scope === 'recipient' || Object.hasOwn(recipientValues, key) ? recipient : supplier;
      let row = frame.factOverrides.find(row => row.subject.kind === kind && row.subject.id === id);
      if (!row) frame.factOverrides.push(row = { subject: { kind, ...(id ? { id } : {}) }, facts: {} });
      row.facts[key] = input;
    }
    for (const event of setup.events) {
      event.actorId = recipient;
      for (const observation of event.subjectFacts ?? []) if (observation.subject.kind === 'actor') observation.subject.id = recipient;
    }
    Object.assign(setup.events.find(event => event.id === 'hit'), { timeMs, order: triggers.length + 1 });
    for (const [index, trigger] of triggers.entries()) {
      const { actor = supplier, time = 0, skill, hit: triggerHit, ...fields } = trigger;
      const event = { id: 'trigger-' + index, actorId: actor, timeMs: time, order: index, sourceEventIds: [],
        targetIds: fields.kind === 'action' ? [] : ['enemy'], facts: {}, ...fields };
      if (triggerHit) {
        const [source, damage] = hitFor(characters.get(actor), triggerHit);
        if (!damage) return;
        Object.assign(event, { skillId: source.id, hitId: damage.id, category: damage.category });
      }
      if (skill) Object.assign(event, { skillId: actor + '.' + skill, category: skill });
      setup.events.unshift(event);
    }
    const families = Object.keys(hit.damage ?? {});
    const { element, missing } = resolveHitElement(hit, frame.facts[hit.elementBy]?.value, [supplier, ...(settings.party ?? [])].map(actor => characters.get(actor).identity.element));
    if (!queryReaction && missing) return;
    const hitFrame = queryReaction ? { skillId: null, hitId: null, category: null, element: reactionElement, origin: 'reaction',
      family, reactionId: queryReaction } : { skillId: talent.id, hitId: hit.id, category: hit.category, element, origin: hit.origin,
      family: families.length === 1 ? families[0] : 'ordinary', reactionId: null };
    Object.assign(frame, { ownerId: recipient, recipientId: recipient, contributorId: null, hit: hitFrame });
    const context = engine.createStructuredCombatContext(built, setup);
    const reading = engine.evaluateCombatBindings(built.program, context, { value: {
      kind: 'attribute', key: definition.target.attribute, actor: { role: 'recipient' }, at: { kind: 'current', phase: 'same' },
    } }, frame);
    return { actual: traceContribution(reading, definition.identity, supplier, recipient), hit: hitFrame.hitId,
      category: hitFrame.category, element: hitFrame.element, family: hitFrame.family };
  }

  function byText(entity, slot, grant, index, stat, role, phrase, probes, options = {}) {
    const character = characters.get(entity);
    if (!character) return;
    const group = ascensionRank[slot[0]];
    const position = Number(slot.slice(1)) - Number(group === 'constellations');
    const piece = character.metadata[group][position];
    const id = entity + '.' + grant;
    const buff = piece?.buffs?.find(row => row.id === id);
    const target = attribute(stat), modifier = buff?.modifiers[index];
    if (modifier?.target !== target || (modifier.recipient ?? buff.recipient ?? 'owner') !== role) return;
    const field = '/' + group + '/' + position + '/buffs/' + piece.buffs.indexOf(buff) + '/modifiers/' + index;
    const key = entity + field, choice = choices.get(key);
    if (!choice?.listed || choice.issue || choice.id !== id || choice.target !== target || choice.role !== role || occupied.has(key)) return;
    const proofSource = original(entity, options.source ?? slot);
    const sourceMatch = phrase.exec(proofSource.text);
    const matches = sourceMatch?.slice(1).map(value => value === '三' ? 3 : Number(value));
    if (!matches?.length || !matches.every(Number.isFinite)) return;
    const definition = character.calculation.bundle.effects.find(effect => effect.identity.id === (index ? id + '.' + index : id)
      && (effect.buff ?? effect.identity).id === id && effect.target.kind === 'attribute' && effect.target.attribute.id === target
      && effect.recipient.role === role);
    if (!definition) return;
    const defaults = { supplier: entity, recipient: entity, ascension: piece.unlockAscension ?? 0,
      constellation: group === 'constellations' ? position + 1 : 0, ...options.build };
    const scenarios = probes(matches);
    const active = scenarios.find(row => row.expected !== 0);
    if (!active || !Number.isFinite(active.expected)) return;
    if (group === 'constellations') scenarios.push(excludes({ ...active.settings, constellation: position }));
    if (defaults.ascension) scenarios.push(excludes({ ...active.settings, ascension: defaults.ascension - 1 }));
    if (role === 'owner' || excludedSuppliers.has(id)) {
      const settings = active.settings;
      const other = entity === 'kaeya' ? 'amber' : 'kaeya';
      const party = settings.party?.includes(other) ? settings.party : [other, ...(settings.party ?? [])].slice(0, 3);
      scenarios.push(excludes(role === 'owner' ? { ...settings, party, recipient: other, hit: undefined }
        : { ...settings, recipient: entity, hit: undefined }));
    }
    if (!scenarios.some(row => row.expected === 0)) return;
    const cases = [];
    for (const { expected, settings: input } of scenarios) {
      const settings = { ...defaults, ...input };
      const reading = measure(entity, definition, buff.windowFact, settings);
      if (!reading || !close(reading.actual, expected)) return;
      const { actual, ...context } = reading;
      cases.push({ actual, expected, settings: { ...settings, ...context } });
    }
    const primary = cases.find(row => row.expected !== 0);
    output.push({ key, entity, field, id, modifier: index, target, audit: 'characterStatModifierNumbers',
      expected: primary.expected, actual: primary.actual, refs: [proofSource.ref, ...(options.refs ?? [])],
      ...(!options.source || options.source === slot ? { sourceExcerpt: sourceMatch[0] } : {}),
      scope: '从属性输出的依赖追踪读取指定授予的实际贡献，对照原文数值和排除情形。', cases });
  }

  const owner = 'owner', team = 'team';
  const excludedSuppliers = new Set([
    'hutao.a0.butterfly-retirement', 'hutao.c4.blood-blossom-defeat', 'iansan.c2.standard-movement-team',
    'illuga.lamp-oath', 'illuga.lamp-oath-full-moon', 'illuga.lamp-oath-c6', 'ineffa.a1.parameter-reconstruction',
    'kaedeharakazuha.c2.autumn-em', 'lohen.a1.cryo-reaction-teammate', 'lohen.c2.baneblade-mastery',
    'raidenshogun.c4.musou-retirement', 'sucrose.a0.catalyst-conversion-pyro', 'sucrose.a0.catalyst-conversion-hydro',
    'sucrose.a0.catalyst-conversion-cryo', 'sucrose.a0.catalyst-conversion-electro', 'sucrose.a1.mollis-favonius', 'yoimiya.a1.summer-dawn',
  ]);
  const simple = [
    ['gaming', 'c2', 'c2.healing-overflow', 'attackPercent', owner, /攻击力将提升(\d+)%/, 'gaming.healingOverflowWindow'],
    ['hutao', 'a0', 'a0.butterfly-retirement', 'critRate', team, /暴击率提高(\d+)%/, 'hutao.butterflyRetirement'],
    ['hutao', 'c4', 'c4.blood-blossom-defeat', 'critRate', team, /暴击率提高(\d+)%/, 'hutao.markedEnemyDefeated'],
    ['hutao', 'c6', 'c6.butterfly-embrace', 'critRate', owner, /暴击率提高(\d+)%/, 'hutao.butterflyEmbraceWindow'],
    ['iansan', 'a0', 'a0.standard-movement', 'attackPercent', owner, /伊安珊的攻击力提升(\d+)%/, 'iansan.standardMovement'],
    ['iansan', 'c2', 'c2.standard-movement-team', 'attackPercent', team, /当前场上角色的攻击力提升(\d+)%/, 'iansan.standardMovement', { ascension: 1, onField: true }],
    ['jahoda', 'a1', 'a1.coordinator-mastery', 'elementalMastery', team, /元素精通提升(\d+)点/, 'jahoda.coordinatorHighHpHeal'],
    ['kujousara', 'c6', 'c6.tengu-electro-crit', 'critDamage', team, /雷元素伤害的暴击伤害提高(\d+)%/, 'kujousara.tenguJuuraiRecipient', { ...peer('lisa'), hit: 'normal.param1' }],
    ['kukishinobu', 'c6', 'c6-resolve', 'elementalMastery', owner, /提升自身(\d+)点精通/, 'kukishinobu.c6Resolve'],
    ['lisa', 'c2', 'c2.violet-arc-defence', 'defensePercent', owner, /防御力提升(\d+)%/, 'lisa.holdingVioletArc'],
    ['lohen', 'a1', 'a1.cryo-reaction-owner', 'attackPercent', owner, /洛恩的攻击力提升(\d+)%/, 'lohen.cryoReactionAttackWindow'],
    ['lohen', 'a1', 'a1.cryo-reaction-teammate', 'attackPercent', team, /该角色的攻击力提升(\d+)%/, 'lohen.cryoReactionTriggerer'],
    ['lohen', 'c2', 'c2.baneblade-mastery', 'elementalMastery', team, /元素精通提升(\d+)点/, 'lohen.banebladeAttackWindow'],
    ['mitya', 'c1', 'c1.core-crit', 'critDamage', team, /暴击伤害提升(\d+)%/, 'mitya.detectionCorePresent', { onField: true }],
    ['mitya', 'c2', 'c2.steady-extra-em', 'elementalMastery', team, /稳态：[^；]*精通提升(\d+)点/, 'mitya.stable'],
    ['mitya', 'c2', 'c2.overload-extra-em', 'elementalMastery', team, /过载：[^。]*精通提升(\d+)点/, 'mitya.overload', { onField: true }],
    ['raidenshogun', 'c4', 'c4.musou-retirement', 'attackPercent', team, /攻击力提升(\d+)%/, 'raidenshogun.musouEnded'],
    ['rosaria', 'a0', 'a0.behind-confession', 'critRate', owner, /暴击率提升(\d+)%/, 'rosaria.stabFromBehindWindow'],
    ['rosaria', 'c1', 'c1.critical-normal', 'normalAttackSpeed', owner, /攻击速度提升(\d+)%/, 'rosaria.criticalWindow', { hit: 'normal.param1' }, 1],
    ['sethos', 'c4', 'c4-piercing-em', 'elementalMastery', team, /元素精通提升(\d+)点/, 'sethos.c4PiercedEnemies'],
    ['tighnari', 'a0', 'a0.keen-sight', 'elementalMastery', owner, /元素精通提升(\d+)点/, 'tighnari.wreathArrowFired'],
    ['xiangling', 'a1', 'a1.chili-attack', 'attackPercent', team, /提高(\d+)%攻击力/, 'xiangling.chiliPicked'],
    ['xianyun', 'c2', 'c2.skyladder-attack', 'attackPercent', owner, /闲云的攻击力提升(\d+)%/, 'xianyun.skyladderAttackWindow'],
    ['yoimiya', 'c1', 'c1.agate-ryuukin', 'attackPercent', owner, /宵宫的攻击力提高(\d+)%/, 'yoimiya.markedEnemyDefeated'],
    ['aether-geo', 'c1', 'c1.invincible-stonewall', 'critRate', team, /暴击率提升(\d+)%/, 'aether-geo.stonewallEnclosed'],
    ['lumine-geo', 'c1', 'c1.invincible-stonewall', 'critRate', team, /暴击率提升(\d+)%/, 'lumine-geo.stonewallEnclosed'],
  ];
  for (const [entity, slot, grant, stat, role, phrase, key, options = {}, index = 0] of simple) {
    byText(entity, slot, grant, index, stat, role, phrase, ([amount]) => {
      const settings = { ...(role === team ? peer() : {}), ...options };
      const result = gated(amount / (stat === 'elementalMastery' ? 1 : 100), key, settings);
      if (options.onField) result.push(excludes({ ...result[0].settings, onField: false }));
      if (entity === 'kujousara') result.push(excludes(values({ ...peer('kaeya'), hit: 'skill.param1' }, { [key]: true })));
      return result;
    });
  }

  for (const [index, stat] of ['critRate', 'critDamage'].entries()) {
    byText('arlecchino', 'c6', 'c6.burst-crit', index, stat, owner,
      /施放万相化灰后的(\d+)秒内[^。]*暴击率提升(\d+)%、暴击伤害提升(\d+)%[^。]*。该效果每(\d+)秒至多触发一次/,
      ([seconds, rate, damage, cooldown]) => {
        const amount = [rate, damage][index] / 100;
        const trigger = cast('burst'), duration = 1000 * seconds, interval = 1000 * cooldown;
        return [
          ...timed(amount, trigger, seconds, { hit: 'normal.param1' }, cast('skill')),
          sample(amount, { hit: 'burst.param1', triggers: [trigger] }),
          excludes({ hit: 'skill.param1', triggers: [trigger] }),
          excludes({ triggers: [trigger, { ...trigger, time: interval - 1 }], timeMs: duration }),
          sample(amount, { triggers: [trigger, { ...trigger, time: interval }], timeMs: duration }),
        ];
      });
    byText('clorinde', 'c6', 'c6.night-vigil-crit', index, stat, owner,
      /施放狩夜之巡后的(\d+)秒内[^。]*暴击率提升(\d+)%[^。]*暴击伤害提升(\d+)%/,
      ([seconds, rate, damage]) => timed([rate, damage][index] / 100, cast('skill'), seconds, {}, cast('burst')));
  }

  byText('candace', 'c2', 'heron-c2-health', 0, 'hpPercent', owner,
    /苍鹭庇卫命中敌人时[^。]*生命值上限提升(\d+)%，持续(\d+)秒/,
    ([amount, seconds]) => timed(amount / 100, strike('skill.param3'), seconds, {}, strike('normal.param1')));
  byText('chasca', 'c6', 'c6.fatal-round-crit', 0, 'critDamage', owner,
    /追影弹和焕光追影弹的暴击伤害提升(\d+)%/,
    ([amount]) => [
      ...gated(amount / 100, 'chasca.fatalRounds', { ascension: 1, hit: 'skill.param3' }),
      excludes(values({ ascension: 0, hit: 'skill.param3' }, { 'chasca.fatalRounds': true })),
      excludes(values({ ascension: 1, hit: 'skill.param1' }, { 'chasca.fatalRounds': true })),
    ], { refs: [capture + 'talents/chasca.json#/passive1'] });
  byText('dehya', 'c6', 'c6.lioness-crit', 0, 'critRate', owner, /炎啸狮子咬的暴击率提升(\d+)%/,
    ([amount]) => [sample(amount / 100, { hit: 'burst.param1' }), excludes({ hit: 'skill.param1' })]);
  byText('ganyu', 'a0', 'a0.frostflake-crit', 0, 'critRate', owner, /霜华绽发的暴击率提高(\d+)%/,
    ([amount]) => {
      const key = 'ganyu.undividedHeartWindow';
      return [...gated(amount / 100, key, { hit: 'normal.param9' }), sample(amount / 100, values({ hit: 'normal.param10' }, { [key]: true })),
        excludes(values({ hit: 'normal.param1' }, { [key]: true }))];
    });
  byText('diluc', 'c6', 'c6.searing-onslaught-normal', 1, 'normalAttackSpeed', owner,
    /普通攻击速度提升(\d+)%/, ([amount]) => {
      const cases = gated(amount / 100, 'diluc.searingNormalRemaining', { hit: 'normal.param1' });
      return [...cases, excludes(values({ hit: 'skill.param1' }, { 'diluc.searingNormalRemaining': true }))];
    });
  byText('dori', 'c4', 'c4.jinni-link', 1, 'energyRecharge', team,
    /元素能量低于(\d+)%时，提升(\d+)%元素充能效率/, ([threshold, amount]) => {
      const active = values(peer(), { 'dori.jinniLinked': true, 'dori.recipientEnergyBelowHalf': true });
      const withEnergy = (settings, energyPercent) => ({ ...settings, energyPercent });
      return [sample(amount / 100, withEnergy(active, threshold - 1)),
        excludes(withEnergy(values(active, { 'dori.recipientEnergyBelowHalf': false }), threshold)),
        excludes(values(active, { 'dori.jinniLinked': false })), excludes({ ...active, onField: false })];
    });
  byText('escoffier', 'c1', 'c1.pairing-crit', 0, 'critDamage', team,
    /花刀技法后的(\d+)秒内[^。]*造成冰元素伤害时的暴击伤害提升(\d+)%/,
    ([seconds, amount]) => {
      const settings = { ...peer('kaeya', 'barbara', 'mona'), hit: 'skill.param1' };
      return [
        ...timed(amount / 100, cast('skill'), seconds, settings, cast('normal')),
        sample(amount / 100, { ...settings, triggers: [cast('burst')] }),
        excludes({ ...settings, party: ['kaeya', 'barbara', 'amber'], triggers: [cast('skill')] }),
        excludes({ ...settings, hit: 'normal.param1', triggers: [cast('skill')] }),
      ];
    }, { build: { ascension: 4 }, refs: [capture + 'talents/escoffier.json#/passive2'] });
  byText('faruzan', 'c6', 'c6-wind-crit', 0, 'critDamage', team, /风元素伤害时的暴击伤害提升(\d+)%/,
    ([amount]) => {
      const labels = read(capture + 'talents/faruzan.json').combat3.attributes.labels;
      const parameter = labels.find(label => label.startsWith('祈风之赐持续时间|'))?.match(/\{(param\d+):/)?.[1];
      const seconds = read(snapshot + 'stats/talents.json').faruzan.combat3[parameter]?.[0];
      const settings = { ...peer('sucrose', 'kaeya'), hit: 'skill.param1' };
      return [...timed(amount / 100, cast('burst'), seconds, settings, cast('skill')),
        ...gated(amount / 100, 'faruzan.prayer', settings),
        excludes(values({ ...settings, recipient: 'kaeya' }, { 'faruzan.prayer': true }))];
    }, { refs: [capture + 'talents/faruzan.json#/combat3/attributes/labels', snapshot + 'stats/talents.json#/faruzan/combat3'] });

  for (const [index, stat] of ['attackPercent', 'normalAttackSpeed'].entries()) {
    byText('diluc', 'c2', 'c2.damage-taken-buildup', index, stat, owner,
      /攻击力提高(\d+)%，攻击速度提高(\d+)%，持续(\d+)秒。\s*该效果至多叠加(\d+)次，每([\d.]+)秒/,
      ([attack, speed, seconds, cap, cooldown]) => {
        const amount = [attack, speed][index] / 100;
        const damaged = observed('damageTaken', number('hp', 10));
        const wrong = observed('healingDone', number('hp', 10));
        const interval = 1000 * cooldown;
        const events = Array.from({ length: cap + 1 }, (_, index) => ({ ...damaged, time: index * interval }));
        return [...timed(amount, damaged, seconds, {}, wrong),
          sample(amount, { triggers: [damaged, { ...damaged, time: interval - 1 }], timeMs: interval }),
          sample(2 * amount, { triggers: events.slice(0, 2), timeMs: interval + 1 }),
          sample(cap * amount, { triggers: events, timeMs: cap * interval + 1 })];
      });
  }

  for (const [entity, slot, grant, stat, phrase] of [
    ['mavuika', 'a0', 'nightsoul-burst', 'attackPercent', /攻击力提升(\d+)%，持续(\d+)秒/],
    ['varesa', 'a1', 'a1.nightsoul-burst-atk', 'attackPercent', /攻击力提升(\d+)%，持续(\d+)秒/],
    ['xilonen', 'a1', 'a1.nightsoul-burst-defense', 'defensePercent', /防御力提升(\d+)%，持续(\d+)秒/],
  ]) {
    byText(entity, slot, grant, 0, stat, owner, phrase, ([amount, seconds]) => {
      const active = { ...observed('nightsoulBurst', bool(true)), actor: 'mualani' };
      const wrong = { ...observed('nightsoulBurst', bool(false)), actor: 'mualani' };
      const options = { party: entity === 'varesa' ? ['mualani', 'kachina'] : ['mualani'] };
      const cases = timed(amount / 100, active, seconds, options, wrong);
      if (entity === 'varesa') {
        const second = { ...active, actor: 'kachina', time: 9000 };
        const together = { ...options, triggers: [active, second] };
        const firstEnd = seconds * 1000;
        const secondEnd = second.time + firstEnd;
        cases.push(
          sample(amount / 100, { ...options, triggers: [active], timeMs: second.time }),
          sample(amount / 50, { ...together, timeMs: second.time + 1 }),
          sample(amount / 50, { ...together, timeMs: firstEnd - 1 }),
          sample(amount / 100, { ...together, timeMs: firstEnd }),
          sample(amount / 100, { ...together, timeMs: secondEnd - 1 }),
          excludes({ ...together, timeMs: secondEnd }),
        );
      }
      return cases;
    });
  }

  byText('yunjin', 'c4', 'c4.flower-and-fighter', 0, 'defensePercent', owner, /防御力提升(\d+)%，持续(\d+)秒/,
    ([amount, seconds]) => [
      ...timed(amount / 100, reaction('crystallize', 'pyro'), seconds, {}, reaction('melt', 'pyro')),
      sample(amount / 100, { triggers: [reaction('lunar-crystallize', 'geo')] }),
    ]);
  byText('valeriy', 'c2', 'c2-bastion-em', 0, 'elementalMastery', team,
    /攻势防御·堡垒骤进后的(\d+)秒内[^。]*元素精通提升(\d+)点/,
    ([seconds, amount]) => timed(amount, cast('skill'), seconds, peer(), cast('burst')));
  byText('tighnari', 'c4', 'c4.fashioners-form-mastery', 0, 'elementalMastery', team,
    /施放造生缠藤箭时[^。]*元素精通提升(\d+)点，持续(\d+)秒/,
    ([amount, seconds]) => timed(amount, cast('burst'), seconds, peer(), cast('skill')));
  byText('tighnari', 'c4', 'c4.fashioners-reaction-mastery', 0, 'elementalMastery', team,
    /元素精通提升(\d+)点[^。]*。若造生缠藤箭[^，]*，元素精通将进一步提升(\d+)点/,
    ([base, extra]) => gated(base + extra, 'tighnari.fashionerTriggeredReaction', peer()));

  for (const [index, stat] of ['critRate', 'critDamage', 'critRate', 'critDamage'].entries()) {
    const hit = index < 2 ? 'normal.param6' : 'burst.param1';
    const wrong = index < 2 ? 'burst.param1' : 'normal.param6';
    byText('varesa', 'c6', 'c6.fiery-crit', index, stat, owner, /暴击率提升(\d+)%，暴击伤害提升(\d+)%/,
      amounts => [sample(amounts[index % 2] / 100, { hit }), excludes({ hit: wrong })]);
  }
  for (const [index, stat] of ['critRate', 'critDamage'].entries()) {
    byText('wriothesley', 'c6', 'c6.gracious-rebuke-crit', index, stat, owner, /惩戒·凌跃拳的暴击率提升(\d+)%，暴击伤害提升(\d+)%/,
      amounts => [
        sample(amounts[index] / 100, { hit: 'a0.rebuke-vaulting-fist', ascension: 1 }),
        sample(amounts[index] / 100, { hit: 'c6.gracious-icicle', ascension: 1 }),
        excludes({ hit: 'normal.param7', ascension: 1 }),
        excludes({ hit: 'a0.rebuke-vaulting-fist', ascension: 0 }),
      ], { refs: [capture + 'talents/wriothesley.json#/passive1'] });
  }
  byText('xinyan', 'c2', 'c2.riff-physical-crit', 0, 'critRate', owner,
    /叛逆刮弦造成的物理伤害暴击率提升(\d+)%/, ([amount]) =>
      [sample(amount / 100, { hit: 'burst.param1' }), excludes({ hit: 'burst.param2' })]);
  byText('mika', 'c6', 'c6.soulwind-physical-crit', 0, 'critDamage', team,
    /当前场上角色，其物理伤害的暴击伤害提高(\d+)%/, ([amount]) =>
      [...gated(amount / 100, 'mika.soulwindActive', peer()),
        excludes(values({ ...peer(), onField: false }, { 'mika.soulwindActive': true })),
        excludes(values({ ...peer(), hit: 'skill.param1' }, { 'mika.soulwindActive': true }))]);
  byText('lohen', 'c6', 'c6.special-crit', 0, 'critDamage', owner, /暴击伤害都将提升(\d+)%/,
    ([amount]) => [sample(amount / 100, { hit: 'skill.param17' }), excludes({ hit: 'skill.param1' })]);
  byText('lohen', 'c6', 'c6.special-crit', 1, 'critDamage', owner, /暴击伤害都将提升(\d+)%/,
    ([amount]) => gated(amount / 100, 'lohen.masterstroke', { hit: 'burst.param1' }));

  const stacks = (amounts, key, settings = {}, first = 0) => amounts.map((amount, index) =>
    sample(amount, values(settings, { [key]: first + index })));
  const scaled = (step, cap, unit = 100) => Array.from({ length: cap + 1 }, (_, i) => Math.min(i, cap) * step / unit);
  for (const [entity, slot, grant, index, stat, role, phrase, key, settings, readings] of [
    ['charlotte', 'c2', 'c2-camera-attack', 0, 'attackPercent', owner, /攻击力提升(\d+)%\/(\d+)%\/(\d+)%/,
      'charlotte.cameraTargets', {}, amounts => [0, ...amounts.map(amount => amount / 100)]],
    ['clorinde', 'a1', 'a1.pact-crit', 0, 'critRate', owner, /暴击率提升(\d+)%[^。]*至多叠加(\d+)层/,
      'clorinde.pactCritStacks', {}, ([amount, cap]) => scaled(amount, cap)],
    ['columbina', 'a0', 'moon-temptation', 0, 'critRate', owner, /暴击率提升(\d+)%[^。]*。该效果至多叠加(\d+)层/,
      'columbina.moonTemptation', {}, ([amount, cap]) => scaled(amount, cap)],
    ['dehya', 'c6', 'c6.lioness-crit', 1, 'critDamage', owner, /暴击伤害提升(\d+)%[^。]*。[^。]*暴击伤害提升(\d+)%/,
      'dehya.lionessCriticalFists', { hit: 'burst.param1' }, ([step, max]) => scaled(step, Math.round(max / step))],
    ['kaveh', 'a1', 'a1.dream-mastery', 0, 'elementalMastery', owner, /元素精通将提升(\d+)点[^。]*。[^。]*至多叠加(\d+)层/,
      'kaveh.dreamHitStacks', values({}, { 'kaveh.paintedDome': true }), ([step, cap]) => scaled(step, cap, 1)],
    ['lyney', 'c2', 'c2.locquacious-leverage', 0, 'critDamage', owner, /暴击伤害提升(\d+)%[^。]*。此效果至多叠加(\d+)层/,
      'lyney.crispFocusStacks', {}, ([step, cap]) => scaled(step, cap)],
    ['mitya', 'a0', 'a0.steady-mastery', 0, 'elementalMastery', team, /每携带一枚递变信标[^；]*元素精通提升(\d+)点/,
      'mitya.heldBeacons', values(peer(), { 'mitya.stable': true }), ([step]) => [0, step, 2 * step, 3 * step]],
    ['mitya', 'a1', 'a1.beacon-crit', 0, 'critRate', owner, /暴击率提升(\d+)%[^。]*至多叠加(\d+)层/,
      'mitya.createdBeaconStacks', {}, ([step, cap]) => scaled(step, cap)],
    ['navia', 'c2', 'c2.shrapnel-crit', 0, 'critRate', owner, /暴击率提升(\d+)%[^。]*暴击率提高(\d+)%/,
      'navia.crystalShrapnelSpent', { hit: 'skill.param1' }, ([step, cap]) => scaled(step, Math.round(cap / step))],
    ['navia', 'c6', 'c6.shrapnel-crit-damage', 0, 'critDamage', owner, /超过(\d+)枚[^。]*暴击伤害提升(\d+)%/,
      'navia.crystalShrapnelSpent', { hit: 'skill.param1' }, ([threshold, step]) => Array.from({ length: 6 }, (_, n) => Math.max(n + 1 - threshold, 0) * step / 100)],
    ['neuvillette', 'c2', 'c2.dragon-glory-crit', 0, 'critDamage', owner, /暴击伤害提升(\d+)%[^。]*提升(\d+)%/,
      'neuvillette.dragonGloryStacks', { hit: 'normal.param5', ascension: 1 }, ([step, cap]) => scaled(step, Math.round(cap / step))],
    ['odette', 'c2', 'c2.splendor-attack', 0, 'attackPercent', owner, /每层华彩还会使角色的攻击力提升(\d+)%/,
      'odette.splendorStacks', { ascension: 1 }, ([step]) => [0, step / 100, 2 * step / 100]],
    ['ororon', 'c6', 'c6.supersense-attack', 0, 'attackPercent', team, /攻击力提升(\d+)%[^。]*。该效果至多叠加(\d+)层/,
      'ororon.supersenseAttackStacks', { ...peer(), ascension: 1 }, ([step, cap]) => scaled(step, cap)],
    ['prune', 'c2', 'c2.hunter-attack', 0, 'attackPercent', owner, /攻击力提升(\d+)%[^。]*攻击力提升(\d+)%[^。]*。[^。]*攻击力提升至(\d+)%/,
      'prune.hunterHitStacks', values({}, { 'prune.hunterMode': true }), ([base, step, cap]) =>
        Array.from({ length: Math.round((cap - base) / step) + 1 }, (_, n) => Math.min(base + n * step, cap) / 100)],
    ['sandrone', 'c2', 'c2.laser-crit', 0, 'critDamage', owner, /冷凝射线的暴击伤害提升(\d+)%[^。]*提升(\d+)%[^。]*至多叠加(\d+)层/,
      'sandrone.laserCritStacks', values({ hit: 'normal.param4', party: ['kaeya', 'lisa'] }, { radiance: 'stellar-conduct' }),
      ([base, step, cap]) => scaled(step, cap).map(amount => amount + base / 100)],
    ['shikanoinheizou', 'c6', 'c6.declension-crit', 0, 'critRate', owner, /每层「变格」[^。]*提升(\d+)%暴击率/,
      'shikanoinheizou.declensionStacks', { hit: 'skill.param1' }, ([amount]) => [0, amount / 100, 2 * amount / 100, 3 * amount / 100, 4 * amount / 100]],
    ['varka', 'c6', 'c6-azure-oath', 0, 'critDamage', owner, /每层「苍牙之誓」[^。]*暴击伤害提升(\d+)%/,
      'varka.azureOath', { ascension: 4 }, ([amount]) => [0, amount / 100, 2 * amount / 100, 3 * amount / 100]],
    ['vodyanitsa', 'c4', 'c4-health-stacks', 0, 'hpPercent', owner, /生命值上限提升(\d+)%[^。]*至多叠加(\d+)层/,
      'vodyanitsa.c4HealthStacks', {}, ([step, cap]) => scaled(step, cap)],
    ['wriothesley', 'a1', 'a1.prosecution-edict', 0, 'attackPercent', owner, /至多叠加至(\d+)层，每层使莱欧斯利的攻击力提升(\d+)%/,
      'wriothesley.prosecutionEdictStacks', values({}, { 'wriothesley.chillingPenalty': true }), ([cap, step]) => scaled(step, cap)],
    ['yelan', 'c4', 'c4.bait-and-switch', 0, 'hpPercent', team, /生命值上限提升(\d+)%[^。]*。[^。]*至多获得(\d+)%提升/,
      'yelan.lifelineMarks', values(peer(), { 'yelan.lifelineMarksWindow': true }), ([step, cap]) => scaled(step, Math.round(cap / step))],
  ]) {
    byText(entity, slot, grant, index, stat, role, phrase, sourceValues => {
      const cases = stacks(readings(sourceValues), key, settings, grant === 'c6.shrapnel-crit-damage' ? 1 : 0);
      const highest = cases.at(-1).settings;
      if (['dehya', 'navia', 'neuvillette', 'sandrone', 'shikanoinheizou'].includes(entity)) cases.push(excludes({ ...highest, hit: 'normal.param1' }));
      if (entity === 'lyney' || entity === 'ororon') cases.push(excludes({ ...highest, onField: false }));
      if (entity === 'neuvillette' || entity === 'odette' || entity === 'ororon' || entity === 'varka') cases.push(excludes({ ...highest, ascension: 0 }));
      if (entity === 'kaveh') cases.push(excludes(values(highest, { 'kaveh.paintedDome': false })));
      if (entity === 'mitya' && slot === 'a0') cases.push(excludes(values(highest, { 'mitya.stable': false })));
      if (entity === 'prune') cases.push(excludes(values(highest, { 'prune.hunterMode': false })));
      if (entity === 'sandrone') cases.push(excludes(values(highest, { radiance: 'none' })));
      if (entity === 'wriothesley') cases.push(excludes(values(highest, { 'wriothesley.chillingPenalty': false })));
      if (entity === 'yelan') cases.push(excludes(values(highest, { 'yelan.lifelineMarksWindow': false })));
      return cases;
    });
  }

  for (const [entity, slot, grant, index, stat, role, phrase, key, settings, count] of [
    ['nahida', 'c4', 'c4-marked-em-1', 0, 'elementalMastery', owner, /元素精通提升(\d+)\/(\d+)\/(\d+)\/(\d+)点/, 'nahida.markedTargets', {}, 1],
    ['nahida', 'c4', 'c4-marked-em-2', 0, 'elementalMastery', owner, /元素精通提升(\d+)\/(\d+)\/(\d+)\/(\d+)点/, 'nahida.markedTargets', {}, 2],
    ['nahida', 'c4', 'c4-marked-em-3', 0, 'elementalMastery', owner, /元素精通提升(\d+)\/(\d+)\/(\d+)\/(\d+)点/, 'nahida.markedTargets', {}, 3],
    ['nahida', 'c4', 'c4-marked-em-4', 0, 'elementalMastery', owner, /元素精通提升(\d+)\/(\d+)\/(\d+)\/(\d+)点/, 'nahida.markedTargets', {}, 4],
    ['skirk', 'c4', 'c4-crossing-attack-1', 0, 'attackPercent', owner, /攻击力提升(\d+)%\/(\d+)%\/(\d+)%/, 'skirk.deathCrossingStacks', { ascension: 4 }, 1],
    ['skirk', 'c4', 'c4-crossing-attack-2', 0, 'attackPercent', owner, /攻击力提升(\d+)%\/(\d+)%\/(\d+)%/, 'skirk.deathCrossingStacks', { ascension: 4 }, 2],
    ['skirk', 'c4', 'c4-crossing-attack-3', 0, 'attackPercent', owner, /攻击力提升(\d+)%\/(\d+)%\/(\d+)%/, 'skirk.deathCrossingStacks', { ascension: 4 }, 3],
    ...[1, 2, 3, 4].map(count => ['xianyun', 'a0', 'a0.storm-pinion-crit', count - 1, 'critRate', team,
      /下落攻击的暴击率提升(\d+)%\/(\d+)%\/(\d+)%\/(\d+)%/, 'xianyun.stormPinionStacks', { ...peer(), hit: 'normal.param9' }, count]),
    ...[1, 2, 3].map(count => ['xianyun', 'c6', 'c6.cloudwave-crit', count - 1, 'critDamage', owner,
      /闲云冲击波的暴击伤害提升(\d+)%\/(\d+)%\/(\d+)%/, 'xianyun.skyladderUses', { hit: 'skill.param' + (count + 1) }, count]),
  ]) {
    const divisor = stat === 'elementalMastery' ? 1 : 100;
    byText(entity, slot, grant, index, stat, role, phrase, ladder => {
      const cases = stacks([0, ...ladder.map((amount, i) => i + 1 === count ? amount / divisor : 0)], key, settings);
      const active = cases[count].settings;
      if (entity === 'xianyun') cases.push(excludes({ ...active, hit: 'normal.param1' }));
      if (entity === 'skirk') cases.push(excludes({ ...active, ascension: 3 }));
      return cases;
    });
  }

  byText('shikanoinheizou', 'c6', 'c6.declension-crit', 1, 'critDamage', owner,
    /拥有「正论」时[^。]*暴击伤害将提升(\d+)%/, ([amount]) => [
      ...stacks([0, amount / 100], 'shikanoinheizou.declensionStacks', { hit: 'skill.param1' }, 3),
      excludes(values({}, { 'shikanoinheizou.declensionStacks': 4 })),
    ], { refs: [capture + 'talents/shikanoinheizou.json#/combat2'] });
  byText('alyosha', 'c6', 'c6.hunter-precision-mastery', 0, 'elementalMastery', team,
    /叠加至(\d+)层时[^。]*元素精通提升(\d+)点/, ([count, amount]) => {
      const active = values(peer(), { 'alyosha.hunterPrecision': true, 'alyosha.hunterPrecisionStacks': count });
      return [sample(amount, active), excludes(values(active, { 'alyosha.hunterPrecisionStacks': count - 1 })),
        excludes(values(active, { 'alyosha.hunterPrecision': false })), excludes({ ...active, onField: false })];
    });
  byText('kachina', 'c4', 'c4.drill-field-defence', 0, 'defensePercent', team,
    /防御力提升(\d+)%\/(\d+)%\/(\d+)%\/(\d+)%/, ladder => {
      const settings = values(peer(), { 'kachina.turboTwirlyField': true });
      const result = stacks([0, ...ladder.map(value => value / 100)], 'kachina.drillEnemies', settings);
      return [...result, excludes({ ...result[1].settings, onField: false }),
        excludes(values(result[1].settings, { 'kachina.turboTwirlyField': false }))];
    });

  for (const [slot, grant] of [['a0', 'veil-mastery'], ['c2', 'c2-veil-mastery']]) {
    byText('nefer', slot, grant, 0, 'elementalMastery', owner, /元素精通(?:改为)?提升(\d+)点/, ([amount]) => {
      const settings = values({ party: ['columbina'] }, { 'nefer.veilMastery': true, fullMoonsign: true });
      const otherSource = slot === 'c2' ? original('nefer', 'a0') : null;
      const base = otherSource ? Number(/元素精通提升(\d+)点/.exec(otherSource.text)?.[1]) : 0;
      const cases = [sample(amount - base, settings),
        excludes(values(settings, { 'nefer.veilMastery': false })), excludes(values(settings, { fullMoonsign: false }))];
      return cases;
    }, slot === 'c2' ? { build: { ascension: 1 }, refs: [capture + 'talents/nefer.json#/passive1/description'] } : {});
  }

  for (const [index, stat, recipient, phrase] of [
    [0, 'attackPercent', 'amber', /火元素：攻击力提升(\d+)%/],
    [0, 'hpPercent', 'barbara', /水元素：生命值上限提升(\d+)%/],
    [0, 'critDamage', 'kaeya', /冰元素：暴击伤害提升(\d+)%/],
  ]) {
    const element = { amber: 'pyro', barbara: 'hydro', kaeya: 'cryo' }[recipient];
    byText('xilonen', 'c2', 'c2.chiucue-' + element, index, stat, team, phrase,
      ([amount]) => [...gated(amount / 100, 'xilonen.sourceSamplesActive', peer(recipient, 'collei')),
        excludes(values({ ...peer(recipient, 'collei'), recipient: 'collei' }, { 'xilonen.sourceSamplesActive': true }))]);
  }

  for (const [index, role] of [owner, team].entries()) {
    byText('kaedeharakazuha', 'c2', 'c2.autumn-em', index, 'elementalMastery', role,
      index ? /场上角色的元素精通提升(\d+)点/ : /枫原万叶自己的元素精通提升(\d+)点/,
      ([amount]) => {
        const settings = values(role === team ? peer() : {}, { 'kaedeharakazuha.autumnWhirlwind': true, 'kaedeharakazuha.autumnWhirlwindArea': role === team });
        return [sample(amount, settings), excludes(values(settings, { 'kaedeharakazuha.autumnWhirlwind': false })),
          ...(role === team ? [excludes({ ...settings, onField: false }), excludes(values(settings, { 'kaedeharakazuha.autumnWhirlwindArea': false }))] : [])];
      });
  }

  byText('nilou', 'a0', 'a0.golden-chalice-mastery', 0, 'elementalMastery', team, /所有角色元素精通提升(\d+)点/,
    ([amount]) => {
      const settings = values(peer('collei', 'barbara'), { 'nilou.goldenChaliceDendroHit': true });
      return [sample(amount, settings), excludes(values(settings, { 'nilou.goldenChaliceDendroHit': false })),
        excludes({ ...settings, party: ['collei', 'amber'] }),
        excludes({ ...settings, party: ['barbara'], recipient: 'barbara' })];
    });
  for (const [element, stat, phrase] of [['geo', 'defensePercent', /兹白的防御力提升(\d+)%/], ['hydro', 'elementalMastery', /兹白的元素精通提升(\d+)点/]]) {
    const parties = element === 'geo' ? [['kaeya'], ['noelle'], ['noelle', 'gorou'], ['noelle', 'gorou', 'yunjin']]
      : [['kaeya'], ['barbara'], ['barbara', 'mona'], ['barbara', 'mona', 'candace']];
    byText('zibai', 'a1', 'a1.' + element + '-companion', 0, stat, owner, phrase,
      ([amount]) => parties.map((party, i) => sample(i * amount / (element === 'geo' ? 100 : 1), { party })));
  }
  for (const [element, stat, phrase] of [['pyro', 'attackPercent', /火元素：攻击力提升(\d+)%/], ['cryo', 'critRate', /冰元素：暴击率提升(\d+)%/]]) {
    byText('wanderer', 'a0', 'a0.jade-claimed-' + element, 0, stat, owner, phrase,
      ([amount]) => {
        const claimed = 'wanderer.jadeClaimed-' + element;
        const active = values({ party: [peerElements[element]] }, { 'wanderer.windfavored': true, [claimed]: true });
        return [sample(amount / 100, active), excludes(values(active, { [claimed]: false })),
          excludes(values(active, { 'wanderer.windfavored': false }))];
      });
  }
  for (const [index, amountFrom] of [0, 1].entries()) {
    for (const entity of ['aether-cryo', 'lumine-cryo']) {
      byText(entity, 'c2', 'c2.ice-mote-mastery', index, 'elementalMastery', team, /元素精通提升(\d+)点[^。]*。[^。]*提升(\d+)点/,
        ([base, enhanced]) => {
          const key = entity + '.frostMotesBuff', stellar = entity + '.frostMotesStellar';
          const active = values(peer(), { [key]: true, [stellar]: Boolean(amountFrom) });
          return [sample(amountFrom ? enhanced - base : base, active), excludes(values(active, { [key]: false })),
            excludes({ ...active, onField: false }),
            ...(amountFrom ? [excludes(values(active, { [stellar]: false }))] : [sample(base, values(active, { [stellar]: true }))])];
        });
    }
  }
  const geoHit = { hit: 'burst.param1' };
  for (const [count, fragment] of [[1, '坚牢'], [2, '难破'], [3, '摧碎']]) {
    byText('gorou', 'c6', 'banner-c6-' + count, 0, 'critDamage', team,
      new RegExp('后的(\\d+)秒内[^。]*' + fragment + '」：提高(\\d+)%'),
      ([seconds, amount]) => {
        const parties = [[], ['noelle'], ['noelle', 'albedo']];
        const options = { ...geoHit, ...(count === 1 ? {} : peer(...parties[count - 1])) };
        const alternative = count === 1 ? { ...peer('noelle'), ...geoHit } : count === 2 ? geoHit : { ...peer('noelle'), ...geoHit };
        return [...timed(amount / 100, cast('skill'), seconds, options, cast('normal')),
          sample(amount / 100, { ...options, triggers: [cast('burst')] }),
          excludes({ ...options, hit: 'normal.param1', triggers: [cast('skill')] }),
          excludes({ ...alternative, triggers: [cast('skill')] })];
      });
  }

  for (const [index, stat, phraseA, phraseC] of [
    [0, 'critRate', /岩元素伤害，暴击率提升(\d+)%/, /岩元素伤害，暴击率提升(\d+)%/],
    [1, 'critDamage', /岩元素伤害，暴击率提升\d+%，暴击伤害提升(\d+)%/, /岩元素伤害，暴击率提升\d+%，暴击伤害提升(\d+)%/],
  ]) {
    for (const [slot, grant, phrase] of [['a0', 'lamp-oath', phraseA], ['c6', 'lamp-oath-c6', phraseC]]) {
      const baseSource = original('illuga', 'a0');
      byText('illuga', slot, grant, index, stat, team, phrase, ([amount]) => {
        const base = Number(phraseA.exec(baseSource.text)?.[1]);
        const seconds = Number(/持续(\d+)秒的「执灯之誓」/.exec(baseSource.text)?.[1]);
        const expected = (amount - (slot === 'c6' ? base : 0)) / 100;
        const settings = { ...peer('noelle'), ...geoHit };
        return [...timed(expected, cast('skill'), seconds, settings, cast('normal')),
          sample(expected, { ...settings, triggers: [cast('burst')] }),
          excludes({ ...settings, hit: 'normal.param1', triggers: [cast('skill')] })];
      }, slot === 'c6' ? { build: { ascension: 1 }, refs: [baseSource.ref] } : {});
    }
  }
  byText('illuga', 'a0', 'lamp-oath-full-moon', 0, 'elementalMastery', team, /持续(\d+)秒的「执灯之誓」[^。]*。[^。]*元素精通提升(\d+)点/,
    ([seconds, amount]) => {
      const settings = values(peer('noelle', 'columbina'), { fullMoonsign: true });
      return [...timed(amount, cast('skill'), seconds, settings, cast('normal')),
        excludes({ ...values(settings, { fullMoonsign: false }), triggers: [cast('skill')] })];
    });

  const lunar = { reaction: 'lunar-bloom', reactionElement: 'dendro', family: 'lunar-bloom' };
  for (const [index, stat] of ['critRate', 'critDamage'].entries()) {
    byText('lauma', 'a0', 'skill-full-moon', index, stat, team,
      /后的(\d+)秒内[^。]*。[\s\S]*?月绽放反应伤害，暴击率提升(\d+)%，暴击伤害提升(\d+)%/,
      ([seconds, rate, damage]) => {
        const input = values({ ...peer('collei', 'columbina'), ...lunar }, { fullMoonsign: true });
        return [...timed([rate, damage][index] / 100, cast('skill'), seconds, input, cast('burst')),
          excludes({ ...values(input, { fullMoonsign: false }), triggers: [cast('skill')] }),
          excludes({ ...input, reaction: undefined, triggers: [cast('skill')] })];
      });
    byText('nahida', 'c2', 'c2-marked-lunar', index, stat, team,
      /月绽放反应伤害的暴击率提升(\d+)%，暴击伤害提升(\d+)%/,
      amounts => {
        const setting = { ...peer('collei'), ...lunar };
        return [...gated(amounts[index] / 100, 'nahida.seedMark', setting),
          excludes(values({ ...setting, reaction: undefined }, { 'nahida.seedMark': true }))];
      });
  }

  for (const [stat, slot, grant, role, phrase, settings] of [
    ['critDamage', 'c2', 'c2.moondrift-team-crit', team, /触发月笼谐奏后的(\d+)秒内[^。]*暴击伤害提升(\d+)%/, peer('barbara', 'kaeya')],
    ['critDamage', 'c2', 'c2.megaton-crit', owner, /触发月笼谐奏后的(\d+)秒内[^。]*百万吨重锤的暴击伤害额外提升(\d+)%/, { hit: 'skill.param3', party: ['barbara'] }],
    ['defensePercent', 'c4', 'c4.moondrift-self-defence', owner, /触发月笼谐奏后的(\d+)秒内[^。]*防御力分别提升(\d+)%/, { party: ['barbara'] }],
    ['defensePercent', 'c4', 'c4.moondrift-active-defence', team, /触发月笼谐奏后的(\d+)秒内[^。]*防御力分别提升(\d+)%/, peer('barbara')],
  ]) {
    byText('linnea', slot, grant, 0, stat, role, phrase, ([seconds, amount]) => {
      const trigger = { ...reaction('lunar-crystallize', 'geo'), actor: 'barbara' };
      const wrong = { ...reaction('crystallize', 'geo'), actor: 'barbara' };
      const result = timed(amount / 100, trigger, seconds, settings, wrong);
      if (grant === 'c2.moondrift-team-crit') result.push(excludes({ ...settings, recipient: 'kaeya', triggers: [trigger] }));
      if (grant === 'c2.megaton-crit') result.push(excludes({ ...settings, hit: 'skill.param1', triggers: [trigger] }));
      if (grant === 'c4.moondrift-active-defence') result.push(excludes({ ...settings, onField: false, triggers: [trigger] }),
        sample(amount / 100, { ...settings, recipient: 'linnea', triggers: [trigger] }));
      return result;
    });
  }

  for (const [element, recipient] of Object.entries(peerElements).filter(([element]) => ['pyro', 'hydro', 'cryo', 'electro'].includes(element))) {
    byText('sucrose', 'a0', 'a0.catalyst-conversion-' + element, 0, 'elementalMastery', team,
      /元素精通提升(\d+)，持续(\d+)秒/,
      ([amount, seconds]) => {
        const wrong = element === 'pyro' ? 'hydro' : 'pyro';
        const active = reaction('swirl', element);
        const input = peer(recipient, peerElements[wrong]);
        return [...timed(amount, active, seconds, input, reaction('swirl', wrong)),
          sample(amount, { ...input, triggers: [reaction('stellar-swirl', element)] }),
          excludes({ ...input, recipient: peerElements[wrong], triggers: [active] })];
      });
  }

  for (const [recipient, stat, phrase, grant, scenario] of [
    ['barbara', 'critDamage', /水元素伤害与冰元素伤害的暴击伤害提升(\d+)%，持续(\d+)秒/, 'c2-duet-hydro-cryo', { hit: 'normal.param1' }],
    ['sucrose', 'critDamage', /星扩散反应伤害的暴击伤害提升(\d+)%，持续(\d+)秒/, 'c2-duet-vortex',
      { reaction: 'stellar-swirl', reactionElement: 'anemo', family: 'stellar-swirl' }],
  ]) {
    byText('vodyanitsa', 'c2', grant, 0, stat, team, phrase, ([amount, seconds]) => {
      const vortex = grant === 'c2-duet-vortex';
      const trigger = strike('skill.param4');
      const settings = values({ ...peer(recipient), ...scenario }, { 'vodyanitsa.c2VortexDuet': vortex });
      return [...timed(amount / 100, trigger, seconds, settings, strike('skill.param1')),
        excludes({ ...settings, onField: false, triggers: [trigger] }),
        excludes({ ...values(settings, { 'vodyanitsa.c2VortexDuet': !vortex }), triggers: [trigger] })];
    });
  }
  for (const [i, grant, recipient, phrase] of [
    [0, 'c4.overheal-on-field', 'wriothesley', /处于当前场上时[^；]*攻击速度提升(\d+)%，持续(\d+)秒/],
    [1, 'c4.overheal-off-field', 'kaeya', /处于队伍后台时[^。]*攻击速度提升(\d+)%，持续(\d+)秒/],
  ]) {
    byText('wriothesley', 'c4', grant, 0, 'normalAttackSpeed', i ? team : owner, phrase, ([amount, seconds]) => {
      const mode = 'wriothesley.overhealAttackSpeedMode';
      const settings = i ? peer(recipient) : {};
      return [sample(amount / 100, values({ ...settings, timeMs: seconds * 1000 - 1 }, { [mode]: i ? 'off-field' : 'on-field' })),
        excludes(values({ ...settings, timeMs: seconds * 1000 }, { [mode]: 'none' })),
        excludes(values(settings, { [mode]: i ? 'on-field' : 'off-field' }))];
    });
  }

  byText('yumemizukimizuki', 'a1', 'dream-element-hit', 0, 'elementalMastery', owner, /元素精通提升(\d+)点/,
    ([amount]) => {
      const active = values({ party: ['kaeya'] }, { 'yumemizukimizuki.dreamdrifter': true, 'yumemizukimizuki.a4Mastery': true });
      return [sample(amount, active), excludes(values(active, { 'yumemizukimizuki.dreamdrifter': false })),
        excludes(values(active, { 'yumemizukimizuki.a4Mastery': false }))];
    });

  byText('yoimiya', 'a1', 'a1.summer-dawn', 0, 'attackPercent', team,
    /后的(\d+)秒内[^。]*攻击力提高(\d+)%[^。]*。[^。]*每层提升(\d+)%攻击力/, ([seconds, base, step]) => {
      const settings = values(peer(), { 'yoimiya.tricksAtBurst': 0 });
      return [...timed(base / 100, cast('burst'), seconds, settings, cast('skill')),
        ...[1, 5, 10].map(count => sample((base + step * count) / 100,
          { ...values(settings, { 'yoimiya.tricksAtBurst': count }), triggers: [cast('burst')] }))];
    });

  const growthRef = (entity, weapon) => [catalog + 'characters.json#/' + entity.replace(/-(anemo|geo|electro|dendro|hydro|pyro|cryo)$/, '') + '/stats',
    catalog + 'character-curves.json', ...(weapon ? [catalog + 'weapons.json#/' + weapon + '/stats', catalog + 'weapon-curves.json'] : [])];
  const publishedCharacters = read(catalog + 'characters.json');
  const characterCurves = read(catalog + 'character-curves.json');
  const publishedWeapons = read(catalog + 'weapons.json');
  const weaponCurves = read(catalog + 'weapon-curves.json');
  function sourceStat(entity, ascension, stat, weaponId, weaponLevel = 1, weaponAscension = 0, extraPercent = 0) {
    const character = publishedCharacters[entity.replace(/-(anemo|geo|electro|dendro|hydro|pyro|cryo)$/, '')]?.stats;
    const weapon = publishedWeapons[weaponId]?.stats;
    const promotion = character?.promotion[ascension];
    const characterLevel = ascension ? promotion.maxlevel : 1;
    if (stat === 'elementalMastery') {
      return (character.specialized === 'FIGHT_PROP_ELEMENT_MASTERY' ? promotion.specialized ?? 0 : 0)
        + (weapon?.specialized === 'FIGHT_PROP_ELEMENT_MASTERY' ? weapon.base.specialized * weaponCurves[weaponLevel][weapon.curve.specialized] : 0);
    }
    const promoted = character.base[stat] * characterCurves[characterLevel][character.curve[stat]] + promotion[stat];
    const base = promoted + (stat === 'attack' && weapon ? weapon.base.attack * weaponCurves[weaponLevel][weapon.curve.attack]
      + weapon.promotion[weaponAscension].attack : 0);
    const property = 'FIGHT_PROP_' + ({ hp: 'HP', defense: 'DEFENSE', attack: 'ATTACK' }[stat]) + '_PERCENT';
    const bonus = (character.specialized === property ? promotion.specialized ?? 0 : 0) +
      (weapon?.specialized === property ? weapon.base.specialized * weaponCurves[weaponLevel][weapon.curve.specialized] : 0) + extraPercent;
    return base * (1 + bonus);
  }

  for (const [entity, weapon, slot, grant, pattern] of [
    ['flins', 'beginnersprotector', 'a1', 'a1.attack-mastery', /攻击力的(\d+)%[^。]*。[^。]*元素精通提升(\d+)点/],
    ['flins', 'beginnersprotector', 'c4', 'c4.attack-mastery-enhanced', /攻击力提升(\d+)%[^。]*。[\s\S]*?攻击力的(\d+)%[^。]*。[^。]*元素精通提升(\d+)点/],
    ['sandrone', 'wastergreatsword', 'a1', 'a1.attack-mastery', /每(\d+)点攻击力[^。]*元素精通提升(\d+)点[^。]*至多[^。]*提升(\d+)点元素精通/],
    ['aether-cryo', 'dullblade', 'a1', 'a1.froststar-mastery', /攻击力的(\d+)%[^。]*。[^。]*元素精通提升(\d+)点/],
    ['lumine-cryo', 'dullblade', 'a1', 'a1.froststar-mastery', /攻击力的(\d+)%[^。]*。[^。]*元素精通提升(\d+)点/],
  ]) {
    const enhanced = slot === 'c4';
    const unit = entity === 'sandrone' ? 'points' : 'percent';
    byText(entity, slot, grant, Number(enhanced), 'elementalMastery', owner, pattern, amounts => {
      const [extra, step, cap] = enhanced || unit === 'points' ? amounts : [0, ...amounts];
      const basis = unit === 'points' ? extra : 100;
      const percent = enhanced ? extra / 100 : 0;
      return [
        ...[4, 6].map(ascension => sample(Math.min(sourceStat(entity, ascension, 'attack', weapon, 1, 0, percent) * step / basis, cap),
          { ascension, weapon })),
        excludes(enhanced ? { ascension: 3, weapon } : { ascension: 4, weapon, constellation: 4 }),
      ].slice(0, entity === 'flins' ? 3 : 2);
    }, { refs: growthRef(entity, weapon) });
  }
  byText('flins', 'c4', 'c4.attack-mastery-enhanced', 0, 'attackPercent', owner, /攻击力提升(\d+)%/, ([amount]) => [sample(amount / 100)]);

  byText('dahlia', 'a1', 'a1.favonian-favor-speed', 0, 'normalAttackSpeed', team,
    /每(\d+)点生命值上限都将提升([\d.]+)%攻击速度[^。]*至(\d+)%攻击速度/, ([step, amount, cap]) => [
      ...[4, 6].flatMap(ascension =>
        gated(Math.min(sourceStat('dahlia', ascension, 'hp') / step * amount, cap) / 100, 'dahlia.favonianFavor', { ...peer(), ascension })),
      excludes(values({ ...peer(), onField: false }, { 'dahlia.favonianFavor': true })),
    ], { refs: growthRef('dahlia') });
  byText('dahlia', 'c6', 'c6.favonian-favor-speed', 0, 'normalAttackSpeed', team, /攻击速度提升(\d+)%/,
    ([amount]) => {
      const active = { ...peer(), recipientValues: { 'dahlia.favonianFavor': true } };
      return [sample(amount / 100, active), excludes({ ...active, recipientValues: { 'dahlia.favonianFavor': false } }),
        excludes({ ...active, onField: false })];
    });

  byText('columbina', 'c2', 'c2-radiance-lunar-bloom', 0, 'elementalMastery', team,
    /生命值上限提升(\d+)%[^。]*。[\s\S]*?月绽放反应[^；]*元素精通提升[^；]*生命值上限的([\d.]+)%/, ([hp, amount]) => {
      const state = { 'columbina.light': true, fullMoonsign: true, 'columbina.c2Light.lunar-bloom': true };
      const active = values(peer('collei', 'lauma'), state);
      return [sample(sourceStat('columbina', 0, 'hp', undefined, 1, 0, hp / 100) * amount / 100, active),
        excludes(values(active, { 'columbina.light': false })),
        excludes(values(active, { 'columbina.c2Light.lunar-bloom': false })),
        excludes(values(active, { fullMoonsign: false })),
        excludes({ ...active, onField: false })];
    }, { refs: growthRef('columbina') });
  for (const [index, stat] of ['critRate', 'critDamage'].entries()) {
    byText('nilou', 'c6', 'c6.frostbreak', index, stat, owner,
      /每(\d+)点生命值上限[^。]*暴击率提升([\d.]+)%[^。]*暴击伤害提升([\d.]+)%[^。]*。[^。]*暴击率至多提升(\d+)%[^。]*暴击伤害至多提升(\d+)%/,
      ([hp, rate, damage, rateCap, damageCap]) => [0, 4, 6].map(ascension =>
        sample(Math.min(sourceStat('nilou', ascension, 'hp') / hp * [rate, damage][index], [rateCap, damageCap][index]) / 100, { ascension })),
      { refs: growthRef('nilou') });
    byText('sigewinne', 'c6', 'c6.super-saturated-crit', index, stat, owner,
      /每(\d+)点生命值上限[^。]*提升([\d.]+)%暴击率与([\d.]+)%暴击伤害，持续(\d+)秒[^。]*。[^。]*提升(\d+)%暴击率与(\d+)%暴击伤害/,
      ([hp, rate, damage, seconds, rateCap, damageCap]) => {
        const heal = observed('healingDone', number('hp', 10));
        return [0, 4].flatMap(ascension => [
          ...timed(Math.min(sourceStat('sigewinne', ascension, 'hp') / hp * [rate, damage][index], [rateCap, damageCap][index]) / 100,
            heal, seconds, { ascension, hit: 'burst.param1' }, cast('skill')),
          excludes({ ascension, hit: 'skill.param1', triggers: [heal] }),
        ]);
      }, { refs: growthRef('sigewinne') });
  }
  byText('yaoyao', 'c4', 'c4.experiential-mastery', 0, 'elementalMastery', owner,
    /生命值上限的([\d.]+)%[^。]*元素精通，持续(\d+)秒[^。]*。[^。]*提升(\d+)点元素精通/, ([amount, seconds, cap]) =>
      [0, 4].flatMap(ascension => {
        const expected = Math.min(sourceStat('yaoyao', ascension, 'hp') * amount / 100, cap);
        return [...timed(expected, cast('skill'), seconds, { ascension }, cast('normal')),
          sample(expected, { ascension, triggers: [cast('burst')] })];
      }), { refs: growthRef('yaoyao') });
  for (const [index, role] of [owner, team].entries()) {
    byText('ineffa', 'a1', 'a1.parameter-reconstruction', index, 'elementalMastery', role,
      /攻击力的(\d+)%[^。]*元素精通，持续(\d+)秒/, ([amount, seconds]) => {
        const weapon = 'beginnersprotector';
        const expected = sourceStat('ineffa', 4, 'attack', weapon) * amount / 100;
        const settings = { ...(role === team ? peer() : {}), weapon };
        return [...timed(expected, cast('burst'), seconds, settings, cast('skill')),
          ...(role === team ? [excludes({ ...settings, onField: false, triggers: [cast('burst')] })] : [])];
      }, { refs: growthRef('ineffa', 'beginnersprotector') });
  }
  for (const [grant, role] of [['a1.other-moonsign', team], ['a1.no-moonsign', owner]]) {
    byText('linnea', 'a1', grant, 0, 'elementalMastery', role, /防御力的(\d+)%/,
      ([amount]) => [4, 6].flatMap(ascension => {
        const expected = sourceStat('linnea', ascension, 'defense') * amount / 100;
        const settings = { ...peer('columbina'), ascension, recipient: role === team ? 'columbina' : 'linnea' };
        if (role === team) return [...gated(expected, 'linnea.recipientMoonsign', settings),
          excludes(values({ ...settings, onField: false }, { 'linnea.recipientMoonsign': true }))];
        return [sample(expected, values(settings, { 'linnea.moonsignOnField': false })),
          excludes(values({ ...settings, recipient: 'linnea', onField: false }, { 'linnea.moonsignOnField': true }))];
      }), { refs: growthRef('linnea') });
  }
  byText('sucrose', 'a1', 'a1.mollis-favonius', 0, 'elementalMastery', team,
    /砂糖元素精通的(\d+)%[^。]*持续(\d+)秒/, ([amount, seconds]) => {
      const weapon = 'sacrificialfragments';
      const expected = sourceStat('sucrose', 4, 'elementalMastery', weapon) * amount / 100;
      const settings = { ...peer(), weapon };
      return [...timed(expected, strike('skill.param1'), seconds, settings, strike('normal.param1')),
        sample(expected, { ...settings, triggers: [strike('burst.param1')] })];
    }, { refs: growthRef('sucrose', 'sacrificialfragments') });


  const masteryWeapon = 'sacrificialfragments';
  byText('nahida', 'a0', 'compassion', 0, 'elementalMastery', team,
    /元素精通数值的(\d+)%[^。]*。[\s\S]*?至多提升(\d+)点元素精通/, ([amount, cap]) =>
      [1, 4].flatMap(ascension => {
        const expected = Math.min(sourceStat('nahida', ascension, 'elementalMastery', masteryWeapon) * amount / 100, cap);
        const settings = { ...peer(), ascension, weapon: masteryWeapon };
        return [...gated(expected, 'nahida.inShrine', settings),
          excludes(values({ ...settings, onField: false }, { 'nahida.inShrine': true })),
          sample(expected, values({ ...settings, recipient: 'nahida' }, { 'nahida.inShrine': true }))];
      }), { refs: growthRef('nahida', masteryWeapon) });
  byText('nahida', 'a1', 'ascension-four.tri-karma-crit', 0, 'critRate', owner,
    /元素精通超过(\d+)点[^。]*暴击率提升([\d.]+)%[^。]*。[^。]*暴击率提升(\d+)%/, ([threshold, rate, cap]) => {
      const weapon = masteryWeapon;
      const hits = { hit: 'skill.param3', weapon };
      return [
        ...[
          { ...hits, ascension: 4 },
          { ...hits, ascension: 6, weaponLevel: 90, weaponAscension: 6 },
        ].map(settings => sample(Math.min(Math.max(
          sourceStat('nahida', settings.ascension, 'elementalMastery', weapon, settings.weaponLevel, settings.weaponAscension) - threshold,
          0) * rate, cap) / 100, settings)),
        excludes({ ...hits, hit: 'skill.param1', ascension: 6, weaponLevel: 90, weaponAscension: 6 }),
      ];
    }, { refs: growthRef('nahida', masteryWeapon) });

  if (!characters.has('vesna')) return output;
  const vesnaPassive = original('vesna', 'a1');
  for (const [stat, suffix, phrase, first, second] of [
    ['attackPercent', 'cryo-anemo-attack', /攻击力提升(\d+)%/, ['kaeya'], ['kaeya', 'sucrose']],
    ['elementalMastery', 'other-element-mastery', /元素精通提升(\d+)点/, ['lisa'], ['lisa', 'amber']],
  ]) {
    const initialParty = stat === 'attackPercent' ? [] : ['kaeya'];
    const divisor = stat === 'attackPercent' ? 100 : 1;
    const includesSelf = Number(stat === 'attackPercent');
    for (const [slot, tail] of [['a1', ''], ['c4', '-c4']]) {
      const improved = slot === 'c4';
      byText('vesna', slot, suffix + tail + '.effect', 0, stat, owner, improved ? /原本的(三)倍/ : phrase,
        ([rate]) => {
          const step = improved ? Number(phrase.exec(vesnaPassive.text)?.[1]) * rate : rate;
          const observed = { radiance: 'stellar-swirl' };
          const cases = [initialParty, first, second].map((party, count) =>
            sample((includesSelf + count) * step / divisor, values({ party }, observed)));
          cases.push(excludes(values({ party: second }, { radiance: 'none' })),
            excludes(values({ party: second }, { radiance: 'stellar-conduct' })));
          if (!improved) cases.push(excludes(values({ party: second, constellation: 4 }, observed)));
          return cases;
        }, improved ? { build: { ascension: 4 }, refs: [vesnaPassive.ref] } : {});
    }
  }
  byText('vesna', 'c2', 'c2-attack.effect', 0, 'attackPercent', owner, /攻击力提升(\d+)%/,
    ([amount]) => {
      const max = Number(/至多叠加(\d+)层/.exec(original('vesna', 'a0').text)?.[1]);
      return stacks([0, amount / 100], 'vesna.disciplineStacks', {}, max - 1);
    }, { build: { ascension: 1 }, refs: [capture + 'talents/vesna.json#/passive1/description'] });

  return output;
}
