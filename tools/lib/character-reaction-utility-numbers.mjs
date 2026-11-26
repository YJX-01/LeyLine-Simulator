import { combatFactDeclaration } from '../../src/schema/src/calculation/buffs.mjs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const ratesPath = capture + 'stats/talents.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const rates = read(ratesPath);
const growth = read(catalog + 'characters.json');
const curves = read(catalog + 'character-curves.json');
const weaponsSource = read(catalog + 'weapons.json');
const weaponCurves = read(catalog + 'weapon-curves.json');
const originalFiles = new Map();
const close = (actual, expected) => Number.isFinite(actual) && Number.isFinite(expected)
  && Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
const quantity = node => node?.state === 'known' && node.value?.kind === 'quantity' ? node.value.value : NaN;
const amount = (text, pattern, group = 1) => Number(text?.match(pattern)?.[group]);
const pct = (text, pattern, group = 1) => amount(text, pattern, group) / 100;
const attribute = key => key.startsWith('target.') ? key : 'attribute.' + key;
const minimumLevel = [1, 20, 40, 50, 60, 70, 80];
const elements = ['anemo', 'cryo', 'dendro', 'electro', 'geo', 'hydro', 'pyro'];
const lunar = ['lunar-charged', 'lunar-bloom', 'lunar-crystallize'];
const stars = ['stellar-conduct', 'stellar-swirl'];
const blooms = ['bloom', 'hyperbloom', 'burgeon'];
const fields = { a: 'passives', c: 'constellations', t: 'talents' };
const caseOf = (expected, settings = {}) => ({ expected, ...settings });
const event = (kind, options = {}) => ({ kind, ...options });
const cast = skill => event('action', { skill, category: skill });
const reaction = (id, family = id, element) => ({ hit: { family, reactionId: id, element, origin: 'reaction' } });
const elementalReaction = (id, element) => reaction(id, 'transformative', element);
const talentHit = (suffix, family) => ({ hit: { suffix, family } });
const peer = (member = 'kaeya') => ({ party: [member], recipient: member });

function source(entity, slot) {
  const group = fields[slot[0]];
  const index = Number(slot.slice(1)) - Number(group === 'constellations');
  const key = group === 'constellations' ? slot : (group === 'passives' ? 'passive' : 'combat') + (index + 1);
  const origin = entity.replace(/^(?:aether|lumine)-/, 'traveler');
  const path = capture + 'ChineseSimplified/' + (group === 'constellations' ? 'constellations' : 'talents') + '/' + origin + '.json';
  if (!originalFiles.has(path)) originalFiles.set(path, read(path));
  return { group, index, key, text: originalFiles.get(path)[key]?.description.replaceAll('**', ''), ref: path + '#' + key };
}

function factRecord(frame, kind, id) {
  let row = frame.factOverrides.find(entry => entry.subject.kind === kind && entry.subject.id === id);
  if (!row) frame.factOverrides.push(row = { subject: { kind, ...(id ? { id } : {}) }, facts: {} });
  return row.facts;
}

function setFacts(owner, frame, values, recipient, defaultActor = 'actor') {
  for (const [key, value] of Object.entries(values)) {
    const field = combatFactDeclaration(owner.metadata.facts, key);
    if (!field) throw new Error(owner.id + ' 缺少门槛事实声明 ' + key);
    const input = typeof value === 'number' ? number(field.type.unit, value) : typeof value === 'boolean' ? bool(value)
      : fact({ kind: 'enum', value });
    if (field.scope === 'query') { frame.facts[key] = input; continue; }
    const kind = field.scope === 'team' ? 'team' : field.scope === 'target' ? 'target' : 'actor';
    const id = kind === 'team' ? undefined : kind === 'target' ? 'enemy' : field.scope === 'recipient' ? recipient : defaultActor;
    if (value === undefined) delete factRecord(frame, kind, id)[key];
    else factRecord(frame, kind, id)[key] = input;
  }
}

function scaleSource(id, stat, { ascension = 0, level = minimumLevel[ascension],
  weapon, weaponLevel = 1, weaponAscension = 0 } = {}) {
  const sourceId = growth[id] ? id : id.split('-')[0];
  const data = growth[sourceId].stats, gear = weaponsSource[weapon].stats;
  const statSource = [catalog + 'characters.json#' + sourceId + '/stats', catalog + 'character-curves.json'];
  if (stat === 'attack') statSource.push(catalog + 'weapons.json#' + weapon + '/stats', catalog + 'weapon-curves.json');
  const property = { hp: 'FIGHT_PROP_HP_PERCENT', attack: 'FIGHT_PROP_ATTACK_PERCENT', defense: 'FIGHT_PROP_DEFENSE_PERCENT',
    elementalMastery: 'FIGHT_PROP_ELEMENT_MASTERY', energyRecharge: 'FIGHT_PROP_CHARGE_EFFICIENCY', hydroBonus: 'FIGHT_PROP_HYDRO_ADD_HURT' }[stat];
  const promotion = data.promotion[ascension], weaponPromotion = gear.promotion[weaponAscension];
  const white = (data.base[stat] === undefined ? (stat === 'energyRecharge' ? 1 : 0)
    : data.base[stat] * curves[level][data.curve[stat]] + promotion[stat]) + (stat === 'attack'
    ? gear.base.attack * weaponCurves[weaponLevel][gear.curve.attack] + weaponPromotion.attack : 0);
  const gearBonus = gear.specialized === property ? gear.base.specialized * weaponCurves[weaponLevel][gear.curve.specialized] + (weaponPromotion.specialized ?? 0) : 0;
  const rate = (data.specialized === property ? promotion.specialized : 0) + gearBonus;
  if (gearBonus && stat !== 'attack') statSource.push(catalog + 'weapons.json#' + weapon + '/stats', catalog + 'weapon-curves.json');
  return { value: ['hp', 'attack', 'defense'].includes(stat) ? white * (1 + rate) : white + rate, white, refs: statSource };
}

function matchingTrace(reading, definition, recipient) {
  const value = reading.outputs.value;
  if (!Number.isFinite(quantity(value))) return NaN;
  const needed = new Set([value.traceId]);
  let contribution = 0;
  for (const node of reading.trace.toReversed()) {
    if (!needed.has(node.id)) continue;
    for (const dependency of node.dependencies) needed.add(dependency);
    if (node.kind !== 'effect' || node.definition.id !== definition.identity.id || node.definition.namespace !== definition.identity.namespace
      || node.definition.revision !== definition.identity.revision || node.context?.actorId !== 'actor'
      || node.context.recipientId !== recipient) continue;
    const actual = quantity(node);
    if (!Number.isFinite(actual)) return NaN;
    contribution += actual;
  }
  return contribution;
}

/** Compare the exact calculator grant with independent text, talent tables and explicit conditions. */
export function characterReactionUtilityNumbers(entities, results, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const choices = new Map(), teams = new Map(), output = [];
  const occupied = new Set((results.registeredModifierEvidence ?? []).map(row => row.key));
  for (const row of results.calculator?.buffs ?? []) {
    const key = row.entity + row.field;
    if (row.listed && !row.issue && !occupied.has(key)) choices.set(key, choices.has(key) ? null : row);
  }

  function teamFor(entity, { ascension = 0, constellation = 0, level = minimumLevel[ascension],
    party = [], ranks = {}, weapon, weaponLevel = 1, weaponAscension = 0 }) {
    const key = JSON.stringify([entity, party, ascension, constellation, level, ranks, weapon, weaponLevel, weaponAscension]);
    if (!teams.has(key)) {
      const actors = [entity, ...party].map((id, index) => {
        const character = characters.get(id);
        const gear = character && weapons.get((index === 0 && weapon) || novice[character.identity.weaponType]);
        if (!gear) return;
        const build = auditBuild(character, gear);
        if (index === 0) Object.assign(build, { ascension, constellation, level, weaponLevel, weaponAscension, talents: { ...build.talents, ...ranks } });
        return { id: index === 0 ? 'actor' : id, build };
      });
      const prepared = actors.every(Boolean) && engine.prepareStructuredBuilds(actors);
      teams.set(key, prepared?.ok ? prepared.team : null);
    }
    return teams.get(key);
  }

  function replay(entity, definition, target, settings) {
    const { party = [], recipient: receiver = entity, hit: pick = {}, values = {}, recipientValues = {}, inputs = {}, events = [],
      timeMs = 1, onField = receiver, targetId = 'enemy', direct, keep = [] } = settings;
    const team = teamFor(entity, settings);
    const owner = characters.get(entity), dealer = characters.get(receiver);
    const recipient = receiver === entity ? 'actor' : receiver;
    if (!team || !dealer || ![entity, ...party].includes(receiver)) return NaN;
    const hitId = pick.suffix && receiver + '.' + pick.suffix;
    const talent = hitId ? dealer.talents.find(row => row.hits.some(hit => hit.id === hitId)) : dealer.talents.find(row => row.hits.some(hit => !pick.category || hit.category === pick.category));
    const hit = hitId ? talent?.hits.find(candidate => candidate.id === hitId) : talent?.hits.find(hit => !pick.category || hit.category === pick.category);
    if (!hit) return NaN;
    const { setup, request } = auditHit(dealer, talent, hit);
    const { frame } = request;
    setAuditDefaults(owner, frame);
    setFacts(owner, frame, values, recipient);
    for (const id of [entity, ...party]) {
      const actor = id === entity ? 'actor' : id;
      factRecord(frame, 'actor', actor).onField = bool(id === onField);
    }
    setFacts(owner, frame, recipientValues, recipient, recipient);
    const query = setup.events.find(row => row.id === frame.eventId);
    Object.assign(query, { actorId: recipient, timeMs, order: events.length + 1, targetIds: [targetId] });
    frame.targetId = targetId;
    if (targetId !== 'enemy') {
      setup.targets.push({ ...structuredClone(setup.targets[0]), id: targetId });
      for (const row of frame.factOverrides) if (row.subject.kind === 'target') row.subject.id = targetId;
    }
    for (const [order, { actor = entity, skill, suffix, ...fields }] of events.entries()) {
      const actorId = actor === entity ? 'actor' : actor;
      const trigger = suffix && characters.get(actor)?.talents.flatMap(row => row.hits).find(candidate => candidate.id === actor + '.' + suffix);
      if (suffix && !trigger) return NaN;
      const skillId = trigger ? characters.get(actor).talents.find(row => row.hits.includes(trigger)).id : skill && actor + '.' + skill;
      setup.events.unshift({ id: 'trigger-' + order, actorId, timeMs: 0, order, sourceEventIds: [],
        targetIds: fields.kind === 'action' ? [] : ['enemy'], facts: {},
        ...(skillId ? { skillId } : {}), ...(trigger ? { hitId: trigger.id, category: trigger.category } : {}), ...fields });
    }
    frame.ownerId = recipient;
    frame.recipientId = recipient;
    frame.contributorId = null;
    const family = pick.family ?? 'ordinary';
    frame.hit = pick.origin === 'reaction' ? { skillId: null, hitId: null, category: null, family, origin: 'reaction',
      element: pick.element ?? dealer.identity.element, reactionId: pick.reactionId }
      : { skillId: talent.id, hitId: hit.id, category: hit.category, origin: hit.origin, element: pick.element ?? hit.element,
        family, reactionId: pick.reactionId ?? null };
    if (direct && (definition.recipient.role !== 'owner' || recipient === 'actor')) frame.applications = [{ instanceId: engine.calculationEffectInstanceId('actor', definition.buff ?? definition.identity, null), active: true }];
    const context = engine.createStructuredCombatContext(team, setup);
    for (const actor of context.actors) actor.effects = actor.id === 'actor'
      ? actor.effects.filter(effect => effect.id === definition.identity.id || keep.includes(effect.id)) : [];
    const supplier = context.actors.find(actor => actor.id === 'actor');
    for (const [id, [unit, value]] of Object.entries(inputs)) supplier.inputs[id] = number(unit, value);
    const binding = target.startsWith('target.') ? { kind: 'enemy' } : { kind: 'attribute', actor: { role: 'recipient' } };
    const reading = engine.evaluateCombatBindings(team.program, context, { value: {
      ...binding, key: { namespace: 'builtin', id: target, revision: '1' }, at: { kind: 'current', phase: 'same' },
    } }, frame);
    return matchingTrace(reading, definition, recipient);
  }

  function check(entity, slot, suffix, index, stat, role, scenarios) {
    const owner = characters.get(entity);
    if (!owner) return;
    const sourceData = source(entity, slot);
    const clause = owner.metadata[sourceData.group][sourceData.index];
    const id = entity + '.' + suffix, target = attribute(stat);
    const buff = clause?.buffs?.find(row => row.id === id);
    const modifier = buff?.modifiers[index];
    if (modifier?.target !== target || (modifier.recipient ?? buff.recipient ?? 'owner') !== role) return;
    const field = '/' + sourceData.group + '/' + sourceData.index + '/buffs/' + clause.buffs.indexOf(buff) + '/modifiers/' + index;
    const key = entity + field, choice = choices.get(key);
    if (choice?.id !== id || choice.target !== target || choice.role !== role || occupied.has(key)) return;
    const definitions = owner.calculation.bundle.effects.filter(effect => effect.identity.id === (index ? id + '.' + index : id)
      && (effect.buff ?? effect.identity).id === id && (effect.target.attribute ?? effect.target.attributeRef)?.id === target
      && effect.recipient.role === role);
    if (definitions.length !== 1) return;
    const [definition] = definitions;
    const unlock = { ascension: sourceData.group === 'passives' ? clause.unlockAscension ?? 0 : 0,
      constellation: sourceData.group === 'constellations' ? sourceData.index + 1 : 0 };
    const refs = new Set([sourceData.ref]);
    const reference = {
      text: sourceData.text,
      parameter(parameter, rank = 1, talent = slot) {
        const { key, ref } = source(entity, talent);
        refs.add(ref);
        const sourceId = entity.replace(/^(?:aether|lumine)-/, 'traveler');
        refs.add(ratesPath + '#' + sourceId + '/' + key + '/' + parameter);
        return rates[sourceId]?.[key]?.[parameter]?.[rank - 1];
      },
      original(other) {
        const reference = source(entity, other);
        refs.add(reference.ref);
        return reference.text;
      },
      stat(stat, settings) {
        const basis = scaleSource(entity, stat, { ...unlock, weapon: novice[owner.identity.weaponType], ...settings });
        for (const reference of basis.refs) refs.add(reference);
        return basis;
      },
    };
    const probes = scenarios(reference);
    if (!probes.some(row => row.expected !== 0 && Number.isFinite(row.expected)) || !probes.some(row => row.expected === 0)) return;
    const cases = probes.map(({ expected, ...probe }) => {
      const settings = { ...unlock, supplier: entity, recipient: entity, ...probe };
      return { actual: replay(entity, definition, target, settings), expected, settings };
    });
    if (!cases.every(row => close(row.actual, row.expected))) return;
    const active = cases.find(row => row.expected !== 0);
    output.push({ key, entity, field, id, modifier: index, target, audit: 'characterReactionUtilityNumbers',
      actual: active.actual, expected: active.expected, refs: [...refs],
      scope: '以明确条件对照实际施加者、受益对象、反应或命中范围，且单独核对该授予的数值。', cases });
    occupied.add(key);
  }
  const trans = id => elementalReaction(id, /bloom|burning|burgeon/.test(id) ? 'dendro' : 'electro');
  const lunarHit = id => reaction(id, id, { 'lunar-charged': 'electro', 'lunar-bloom': 'dendro', 'lunar-crystallize': 'geo' }[id]);
  const starHit = id => reaction(id, id, 'cryo');
  const toggled = (settings, values, missingKey, expected) => [
    caseOf(expected, { ...settings, values }),
    caseOf(0, { ...settings, values: { ...values, [missingKey]: false } }),
  ];

  for (const [index, ids] of [[0, ['electro-charged', 'bloom']], [1, lunar], [2, ['electro-charged', 'bloom']], [3, lunar]]) {
    check('aino', 'c6', 'c6.field-reactions', index, 'reaction.' + (index % 2 ? 'lunar' : 'transformative') + '.damageBonus', 'team', ({ text }) => {
      const roar = index >= 2;
      const value = roar ? pct(text, /伤害额外提升(\d+)%/) : pct(text, /造成的伤害提升(\d+)%/);
      const end = amount(text, /后的(\d+)秒内/) * 1000;
      const settings = { ...peer(), events: [cast('burst')], values: { fullMoonsign: roar } };
      const pick = id => index % 2 ? lunarHit(id) : trans(id);
      return [...ids.flatMap(id => [caseOf(value, { ...settings, ...pick(id) }), caseOf(value, { ...settings, ...pick(id), timeMs: end - 1 })]),
        caseOf(0, { ...settings, ...pick(ids[0]), timeMs: end }), caseOf(0, { ...settings, ...pick(ids[0]), onField: 'aino' }),
        caseOf(0, { ...settings, ...pick(ids[0]), events: [] }), caseOf(0, { ...settings, ...trans('hyperbloom') }),
        ...(roar ? [caseOf(0, { ...settings, ...pick(ids[0]), values: { fullMoonsign: false } })] : [])];
    });
  }

  for (const [entity, slot, parameter, condition] of [
    ['amber', 't1', 'param1', 'baronBunnyCreated'],
    ['aratakiitto', 't1', 'param2', 'ushiCreated'],
    ['ganyu', 't1', 'param1', 'iceLotusCreated'],
    ['lyney', 't0', 'param13', 'grinMalkinHatCreated'],
    ['ningguang', 't1', 'param3', 'jadeScreenCreated'],
  ]) check(entity, slot, 'summon-initial-hp', 0, 'summonInitialHp', 'owner', reference => {
    if (!reference.text?.includes('耐久度按比例继承')) return [];
    const key = entity + '.' + condition;
    return [
      ...[0, 1750].flatMap(hp => toggled({ inputs: { flatHp: ['hp', hp] } }, { [key]: true }, key,
        (reference.stat('hp').value + hp) * reference.parameter(parameter))),
      caseOf(0, { ...peer(), values: { [key]: true } }),
    ];
  });

  for (const [entity, slot, suffix, start, affectedElements, role, readValue, gate] of [
    ['arlecchino', 'a1', 'a1.excess-attack-resistance', 0, [...elements.slice(0, -1), 'physical', 'pyro'], 'owner',
      (text, attack) => Math.min(pct(text, /至多提升(\d+)%/), Math.max(0, attack - amount(text, /超过(\d+)的部分/))
        / amount(text, /每(\d+)点攻击力/) * pct(text, /获得(\d+)%/))],
    ['arlecchino', 'c2', 'c2.bloodfire-resistance', 0, [...elements.slice(0, -1), 'physical', 'pyro'], 'owner',
      text => pct(text, /物理抗性提升(\d+)%/), 'arlecchino.bloodfireResistanceWindow'],
    ['hutao', 'c6', 'c6.butterfly-embrace', 1, [...elements.slice(0, -1), 'physical', 'pyro'], 'owner',
      text => pct(text, /物理抗性提高(\d+)%/), 'hutao.butterflyEmbraceWindow'],
    ['ningguang', 'c4', 'c4.jade-screen-resistance', 0, elements, 'team',
      text => pct(text, /所有元素抗性提升(\d+)%/), 'ningguang.jadeScreenNearby'],
  ]) for (const [index, element] of affectedElements.entries()) {
    check(entity, slot, suffix, start + index, 'resistance.' + element, role, reference => {
      if (gate) return [...toggled(entity === 'arlecchino' ? { ascension: 1 } : {}, { [gate]: true }, gate, readValue(reference.text)),
        ...(role === 'team' ? toggled(peer(), { [gate]: true }, gate, readValue(reference.text))
          : [caseOf(0, { ...peer(), ascension: entity === 'arlecchino' ? 1 : undefined, values: { [gate]: true } })])];
      const basis = reference.stat('attack').value;
      const attacks = [900, 1000, 1360, 3240];
      return [...attacks.map(attack => caseOf(readValue(reference.text, attack), { inputs: { flatAttack: ['attack', attack - basis] } })),
        caseOf(0, { ...peer(), inputs: { flatAttack: ['attack', 1360 - basis] } })];
    });
  }

  check('yaoyao', 't2', 'burst.adeptal-legacy-dendro-resistance', 0, 'resistance.dendro', 'owner', reference => {
    const key = 'yaoyao.adeptalLegacy';
    return [...toggled({}, { [key]: true }, key, reference.parameter('param5')),
      caseOf(0, { ...peer(), onField: 'kaeya', values: { [key]: true } })];
  });

  check('aloy', 't1', 'frozen-wilds-attack-reduction', 0, 'target.attackReduction', 'target', reference => {
    const key = 'aloy.frozenWildsAttackReduction';
    return toggled({}, { [key]: true }, key, reference.parameter('param3'));
  });
  check('ganyu', 'c4', 'c4.celestial-shower-vulnerability', 0, 'target.ordinaryDamageReduction', 'target', ({ text }) => {
    const initial = pct(text, /初始为(\d+)%/), step = pct(text, /每\d+秒提升(\d+)%/), cap = pct(text, /至多提升至(\d+)%/);
    const key = 'ganyu.celestialShowerVulnerable';
    const settings = { ...peer(), values: { [key]: true } };
    return [...[1, 2, 3, 4, 5].map(count => caseOf(-Math.min(initial + step * (count - 1), cap),
      { ...settings, values: { ...settings.values, 'ganyu.vulnerabilitySteps': count } })),
    caseOf(0, { ...settings, values: { [key]: false, 'ganyu.vulnerabilitySteps': 2 } })];
  });
  check('durin', 'c6', 'c6.white-dragon-defence', 0, 'target.defenseReduction', 'target', ({ text }) => {
    const first = event('hit', { suffix: 'burst.param7' }), wrong = event('hit', { suffix: 'burst.param8' });
    const value = pct(text, /防御力降低(\d+)%/), end = amount(text, /防御力降低\d+%，持续(\d+)秒/) * 1000;
    const settings = { ...peer(), events: [first] };
    return [caseOf(value, settings), caseOf(value, { ...settings, timeMs: end - 1 }), caseOf(0, { ...settings, timeMs: end }),
      caseOf(0, { ...settings, targetId: 'other' }), caseOf(0, { ...settings, events: [wrong] }),
      caseOf(0, { ...settings, constellation: 5 })];
  });

  check('charlotte', 'a1', 'fontaine-healing', 0, 'healingBonus', 'owner', ({ text }) => {
    const pattern = /自己获得(\d+)%\/(\d+)%\/(\d+)%治疗加成/;
    const fontaine = ['lyney', 'furina', 'neuvillette'];
    return [caseOf(0), ...fontaine.map((_, i) => caseOf(pct(text, pattern, i + 1), { party: fontaine.slice(0, i + 1) })),
      caseOf(0, { party: ['kaeya', 'furina'], recipient: 'furina' })];
  });

  check('beidou', 't2', 'stormbreaker-reduction', 0, 'incomingDamageReduction', 'team', reference => {
    const active = { ...peer(), events: [cast('burst')], values: { 'beidou.stormbreaker': undefined } }, value = reference.parameter('param3');
    const duration = reference.parameter('param4') * 1000;
    return [caseOf(value, active), caseOf(value, { ...active, timeMs: duration - 1 }), caseOf(0, { ...active, timeMs: duration }),
      caseOf(0, { ...active, onField: 'beidou' }), caseOf(0, { ...active, events: [] })];
  });
  for (const [slot, suffix, eventSkill, duration] of [['t1', 'banner-domain', 'skill', 10000], ['t2', 'burst-domain', 'burst', 9000]]) {
    check('gorou', slot, suffix, 0, 'flatDefense', 'team', reference => {
      const active = { ...peer(), events: [cast(eventSkill)], values: { ['gorou.' + suffix.replace(/-domain/, 'Domain')]: undefined } }, value = reference.parameter('param2', 1, 't1');
      return [caseOf(value, active), caseOf(value, { ...active, timeMs: duration - 1 }), caseOf(0, { ...active, timeMs: duration }),
        caseOf(0, { ...active, onField: 'gorou' }), caseOf(0, { ...active, events: [] }),
        ...(eventSkill === 'skill' ? [caseOf(0, { ...active, values: { 'gorou.burstDomain': true } })] : [])];
    });
  }

  check('dori', 'c4', 'c4.jinni-link', 0, 'incomingHealingBonus', 'team', ({ text }) => {
    const [limit, gain] = [pct(text, /生命值低于(\d+)%/), pct(text, /提升(\d+)%受治疗加成/)];
    const key = 'dori.jinniLinked', settings = { ...peer(), recipientValues: { [key]: true, hpRatio: limit - .01 } };
    return [caseOf(gain, settings), caseOf(0, { ...settings, onField: 'dori' }),
      caseOf(0, { ...settings, recipientValues: { [key]: true, hpRatio: limit } }),
      caseOf(0, { ...settings, recipientValues: { [key]: false, hpRatio: limit - .01 } })];
  });
  check('qiqi', 'a0', 'a0.herald-healing', 0, 'incomingHealingBonus', 'team', ({ text }) => {
    const key = 'qiqi.heraldReactionHealing', value = pct(text, /受治疗加成提升(\d+)%/);
    return [caseOf(value, { ...peer(), recipientValues: { [key]: true } }), caseOf(0, { ...peer(), recipientValues: { [key]: false } })];
  });
  check('mavuika', 'c2', 'c2-base-attack', 0, 'whiteAttack', 'owner', ({ text }) => {
    const value = amount(text, /基础攻击力提升(\d+)点/);
    return [caseOf(value, { values: { 'mavuika.nightsoulActive': true } }),
      caseOf(value, { values: { 'mavuika.ringActive': true } }), caseOf(value, { values: { 'mavuika.flamestrider': true } }),
      caseOf(0), caseOf(0, { ...peer(), values: { 'mavuika.nightsoulActive': true } })];
  });
  check('raidenshogun', 'c2', 'c2.musou-defense-ignore', 0, 'defenseIgnore', 'owner', ({ text }) => {
    const value = pct(text, /无视敌人(\d+)%/), initial = talentHit('burst.param1'), following = talentHit('burst.param5');
    return [caseOf(value, initial), caseOf(value, following), caseOf(0), caseOf(0, { ...initial, constellation: 1 }),
      caseOf(0, { ...peer(), ...talentHit('burst.param1') })];
  });
  check('nicole', 'c6', 'c6.guidance-defense-ignore', 0, 'defenseIgnore', 'team', ({ text }) => {
    const value = pct(text, /无视敌人(\d+)%/), gate = 'nicole.guidanceOfTheosis';
    return [caseOf(value, { ...peer(), recipientValues: { [gate]: true } }), caseOf(value, { recipientValues: { [gate]: true } }),
      caseOf(0, { ...peer(), recipientValues: { [gate]: false } })];
  });
  check('nicole', 'a0', 'a0.blessed-direction', 0, 'attack', 'team', ({ text }) => {
    const value = amount(text, /额外提升(\d+)点攻击力/), gate = 'nicole.blessedDirection';
    return [caseOf(value, { ...peer(), recipientValues: { [gate]: true } }),
      caseOf(0, { ...peer(), recipientValues: { [gate]: true }, onField: 'nicole' }),
      caseOf(0, { ...peer(), recipientValues: { [gate]: false } })];
  });
  check('nicole', 'c2', 'kenosis-c2', 0, 'attack', 'team', reference => {
    const value = amount(reference.text, /额外提升(\d+)点攻击力/), end = reference.parameter('param7', 1, 't1') * 1000;
    const settings = { ...peer(), events: [cast('skill')] };
    return [caseOf(value, settings), caseOf(value, { events: [cast('skill')] }), caseOf(value, { ...settings, timeMs: end - 1 }),
      caseOf(0, { ...settings, timeMs: end }), caseOf(0, { ...settings, constellation: 1 }), caseOf(0, { ...settings, events: [] })];
  });

  for (const [entity, slot, suffix, target, role, regex, active, inactive] of [
    ['alyosha', 'a2', 'a2.stellar-conduct', 'reaction.stellar-conduct.damageBonus', 'team', /星超导反应伤害提升(\d+)%/,
      { ...peer(), ...starHit('stellar-conduct'), recipientValues: { 'alyosha.hunterPrecision': true }, values: { radiance: 'stellar-conduct' } },
      { onField: 'alyosha' }],
    ['durin', 'a0', 'a0.black-dragon-amplifying', 'amplifyingReactionBonus', 'owner', /蒸发反应造成的伤害提升(\d+)%/,
      { ...reaction('vaporize', 'amplifying', 'pyro'), values: { 'durin.blackDragonActive': true } }, trans('burning')],
    ['flins', 'a0', 'a0.full-moonsign-thunder', 'reaction.lunar.damageBonus', 'owner', /月感电反应造成的伤害提升(\d+)%/,
      { ...lunarHit('lunar-charged'), values: { fullMoonsign: true } }, lunarHit('lunar-bloom')],
    ['ineffa', 'c1', 'c1.carrier-composite', 'reaction.lunar.damageBonus', 'team', /提升([\d.]+)%伤害/,
      { ...peer(), ...lunarHit('lunar-charged'), values: { 'ineffa.carrierCompositeWindow': true } }, lunarHit('lunar-bloom')],
    ['kaveh', 'c4', 'c4.bloom-bonuses', 'reaction.transformative.damageBonus', 'owner', /伤害提升(\d+)%/, trans('bloom'), trans('burgeon')],
    ['kaveh', 'c4', 'c4.bloom-bonuses', 'reaction.lunar.damageBonus', 'owner', /伤害提升(\d+)%/, lunarHit('lunar-bloom'), lunarHit('lunar-charged')],
    ['zibai', 'c1', 'c1.first-spiritsteed', 'reaction.lunar.damageBonus', 'owner', /伤害提升(\d+)%/,
      { ...talentHit('skill.param2', 'lunar-crystallize'), values: { 'zibai.firstSpiritsteed': true } }, talentHit('skill.param1')],
    ['zibai', 'c2', 'c2.lunar-phase', 'reaction.lunar.damageBonus', 'team', /伤害提升(\d+)%/,
      { ...peer(), ...lunarHit('lunar-crystallize'), values: { 'zibai.lunarPhase': true } }, lunarHit('lunar-bloom')],
  ]) {
    const index = entity === 'kaveh' && target === 'reaction.lunar.damageBonus' ? 1 : 0;
    check(entity, slot, suffix, index, target, role, reference => {
      if (entity === 'ineffa') {
        const threshold = amount(reference.text, /每(\d+)点攻击力/), rate = pct(reference.text, regex), cap = pct(reference.text, /至多通过这种方式提升(\d+)%/);
        const basis = reference.stat('attack').value;
        return [...[450, 1425, 2500].map(attack => caseOf(Math.min(attack / threshold * rate, cap),
          { ...active, inputs: { flatAttack: ['attack', attack - basis] } })),
        caseOf(0, { ...active, ...inactive }), caseOf(0, { ...active, values: { 'ineffa.carrierCompositeWindow': false } })];
      }
      const value = pct(reference.text, regex);
      return [caseOf(value, active), caseOf(0, { ...active, ...inactive }),
        ...(role === 'owner' ? [caseOf(0, { ...active, ...peer(), ...(entity === 'zibai' ? lunarHit('lunar-crystallize') : {}) })] : []),
        ...(active.values ? [caseOf(0, { ...active, values: entity === 'alyosha' ? { radiance: 'none' } : {} })] : [])];
    });
  }

  for (const [index, recipient, full, role] of [[0, 'flins', false, 'owner'], [1, 'flins', true, 'owner'], [2, 'kaeya', true, 'team']]) {
    const suffix = ['c6-personal-elevation', 'c6-personal-gleam-elevation', 'c6-team-gleam-elevation'][index];
    check('flins', 'c6', suffix, 0, 'reaction.lunar.elevationFactor', role, ({ text }) => {
      const personal = pct(text, /反应伤害擢升(\d+)%/), shared = pct(text, /所有角色造成的月感电反应伤害擢升(\d+)%/);
      const party = { party: ['kaeya'], recipient }, settings = { ...party, ...lunarHit('lunar-charged'), values: { fullMoonsign: full } };
      return [caseOf(1 + (role === 'owner' ? personal : 0) + (full ? shared : 0), settings),
        caseOf(0, { ...settings, values: { fullMoonsign: !full } }), caseOf(0, { ...settings, ...lunarHit('lunar-bloom') }),
        caseOf(0, { ...settings, recipient: recipient === 'flins' ? 'kaeya' : 'flins' })];
    });
  }

  for (const [index, target, ids, regex] of [
    [0, 'reaction.transformative.damageBonus', ['burning', ...blooms], /造成的伤害提升(\d+)%/],
    [1, 'additiveReactionBonus', ['aggravate', 'spread'], /伤害提升提高([\d.]+)%/],
    [2, 'reaction.lunar.damageBonus', ['lunar-bloom'], /月绽放反应伤害提升([\d.]+)%/],
  ]) check('baizhu', 'a1', 'a1.wood-favor', index, target, 'team', reference => {
    const max = amount(reference.text, /不超过(\d+)点/), step = amount(reference.text, /每(\d+)点/);
    const rate = pct(reference.text, regex), key = 'baizhu.gossamerShieldTreated', basis = reference.stat('hp').value;
    const pick = id => index === 0 ? trans(id) : index === 1 ? reaction(id, 'additive', 'dendro') : lunarHit(id);
    const settings = { ...peer(), recipientValues: { [key]: true } };
    return [
      ...[basis, 32750, 56400].flatMap(hp => ids.map(id => caseOf(Math.min(hp, max) / step * rate,
        { ...settings, ...pick(id), inputs: { flatHp: ['hp', hp - basis] } }))),
      caseOf(0, { ...settings, ...pick(ids[0]), recipientValues: { [key]: false } }),
      caseOf(0, { ...settings, ...trans('electro-charged') }),
    ];
  });

  check('columbina', 't2', 'lunar-domain', 0, 'reaction.lunar.damageBonus', 'team', reference => {
    const key = 'columbina.moonDomain';
    const value = reference.parameter('param2');
    return [...lunar.flatMap(id => toggled({ ...peer(), ...lunarHit(id) }, { [key]: true }, key, value)),
      caseOf(0, { ...peer(), ...trans('bloom'), values: { [key]: true } })];
  });

  for (const [id, target, pattern] of [
    ['lunar-charged', 'flatAttack', /角色攻击力提升，提升值相当于哥伦比娅生命值上限的(\d+)%/],
    ['lunar-crystallize', 'flatDefense', /角色防御力提升，提升值相当于哥伦比娅生命值上限的(\d+)%/],
  ]) check('columbina', 'c2', 'c2-radiance-' + id, 0, target, 'team', reference => {
    const rate = pct(reference.text, pattern), hpRate = pct(reference.text, /生命值上限提升(\d+)%/);
    const key = 'columbina.c2Light.' + id, light = 'columbina.light';
    const values = { [light]: true, fullMoonsign: true, [key]: true };
    const settings = { ...peer(), keep: ['columbina.c2-radiance'], values };
    return [...[0, 12000].map(hp => caseOf((reference.stat('hp').value * (1 + hpRate) + hp) * rate,
      { ...settings, inputs: { flatHp: ['hp', hp] } })),
      ...[light, 'fullMoonsign', key].map(gate => caseOf(0, { ...settings, values: { ...values, [gate]: false } })),
      caseOf(0, { ...settings, onField: 'columbina' })];
  });

  check('kaveh', 't2', 'painting-bonus', 0, 'reaction.transformative.damageBonus', 'team', reference => {
    const key = 'kaveh.painting', settings = { ...peer(), ...trans('bloom'), values: { [key]: true }, onField: 'kaveh' };
    return [caseOf(reference.parameter('param3'), settings), caseOf(0, { ...settings, ...trans('burgeon') }),
      caseOf(0, { ...settings, values: { [key]: false } })];
  });
  for (const [index, target, ids] of [
    [0, 'amplifyingReactionBonus', [reaction('vaporize', 'amplifying', 'pyro')]],
    [1, 'reaction.lunar.damageBonus', [lunarHit('lunar-charged'), lunarHit('lunar-crystallize')]],
    [2, 'reaction.transformative.damageBonus', [trans('electro-charged')]],
    [3, 'reaction.transformative.damageBonus', [elementalReaction('swirl', 'hydro')]],
  ]) check('mona', 'c1', 'c1-reactions', index, target, 'team', ({ text }) => {
    const patterns = [/蒸发反应造成的伤害提升(\d+)%/, /月感电反应造成的伤害提升(\d+)%/,
      /感电反应造成的伤害提升(\d+)%/, /水元素扩散反应造成的伤害提升(\d+)%/];
    const value = pct(text, patterns[index]), key = 'mona.c1Prophecy';
    const settings = { ...peer(), values: { [key]: true } };
    return [...ids.flatMap(hit => toggled({ ...settings, ...hit }, settings.values, key, value)),
      caseOf(0, { ...settings, ...(index === 3 ? elementalReaction('swirl', 'cryo') : trans('burgeon')) })];
  });

  for (const [entity, slot, suffix, amountPattern, targets] of [
    ['lauma', 'a0', 'skill-first-moon', [/暴击率固定为(\d+)%/, /暴击伤害固定为(\d+)%/], blooms],
    ['nahida', 'c2', 'c2-marked-transformative', [/暴击率固定为(\d+)%/, /暴击伤害固定为(\d+)%/], ['burning', ...blooms]],
  ]) for (const [index, target] of ['critRate', 'critDamage'].entries()) {
    check(entity, slot, suffix, index, 'reaction.transformative.' + target, 'team', ({ text }) => {
      const value = pct(text, amountPattern[index]);
      const lauma = entity === 'lauma', key = lauma ? 'firstMoonsign' : 'nahida.seedMark';
      const settings = { ...peer(), values: { [key]: true, ...(lauma ? { 'lauma.skillMoonWindow': undefined, fullMoonsign: false } : {}) },
        ...(lauma ? { events: [cast('skill')] } : {}) };
      return [...targets.map(id => caseOf(value, { ...settings, ...trans(id) })),
        caseOf(0, { ...settings, ...trans('bloom'), values: { ...settings.values, [key]: false } }),
        caseOf(0, { ...settings, ...trans('electro-charged') }),
        ...(lauma ? [caseOf(value, { ...settings, ...trans('bloom'), timeMs: 19999 }),
          caseOf(0, { ...settings, ...trans('bloom'), timeMs: 20000 }),
          caseOf(0, { ...settings, ...trans('bloom'), values: { ...settings.values, fullMoonsign: true } })] : [])];
    });
  }

  for (const slot of ['t2', 'c2']) for (const [index, family] of ['transformative', 'lunar'].entries()) {
    check('lauma', slot, slot === 't2' ? 'pale-hymn' : 'c2-pale-hymn', index, 'reaction.' + family + '.flatBaseBonus', 'team', reference => {
      const ratio = slot === 't2' ? reference.parameter(index ? 'param4' : 'param3')
        : pct(reference.text, index ? /月绽放反应伤害额外提升，提升值相当于菈乌玛元素精通的(\d+)%/ : /相当于菈乌玛元素精通的(\d+)%/);
      const ids = index ? [lunarHit('lunar-bloom')] : blooms.map(trans), key = 'lauma.paleHymn';
      const basis = reference.stat('elementalMastery').value;
      return [...[120, 337].flatMap(master => ids.flatMap(hit => toggled({ ...peer(), ...hit, inputs: { elementalMastery: ['elementalMastery', master] } },
        { [key]: true }, key, (basis + master) * ratio))),
      caseOf(0, { ...peer(), ...trans('burning'), values: { [key]: true }, inputs: { elementalMastery: ['elementalMastery', 120] } })];
    });
  }

  check('lauma', 'c6', 'c6-skill-full-moon', 0, 'reaction.lunar.elevationFactor', 'team', ({ text }) => {
    const value = 1 + pct(text, /月绽放反应伤害擢升(\d+)%/);
    return [...toggled({ ...peer(), ...lunarHit('lunar-bloom') }, { fullMoonsign: true }, 'fullMoonsign', value),
      caseOf(0, { ...peer(), ...lunarHit('lunar-charged'), values: { fullMoonsign: true } })];
  });

  for (const [entity, slot, suffix, index, pattern, mode, other] of [
    ['freminet', 'c2', 'directEnergy.c2', 1, /转为恢复(\d+)点/, '四阶', '零至三阶'],
    ['kaedeharakazuha', 'c4', 'directEnergy.c4', 1, /分别为枫原万叶恢复3、(\d+)点/, '长按千早振', '点按千早振'],
    ['kaedeharakazuha', 'c4', 'directEnergy.c4', 2, /每秒为枫原万叶恢复(\d+)点/, '滑翔满一秒', '长按千早振'],
    ['shikanoinheizou', 'c4', 'directEnergy.c4', 1, /额外恢复([\d.]+)点/, '同一聚风蹴内随后爆发', '首次爆发'],
  ]) check(entity, slot, suffix, index, 'directEnergyRestored', 'owner', ({ text }) => {
    const key = entity + '.' + suffix, modeKey = key + '.mode', value = amount(text, pattern);
    const limit = entity === 'kaedeharakazuha' ? amount(text, /元素能量低于(\d+)点/) : null;
    const settings = { direct: true, values: { [key]: true, [modeKey]: mode, ...(limit ? { currentEnergy: limit - 1 } : {}) } };
    return [caseOf(value, settings), caseOf(0, { ...settings, ...peer() }),
      ...[other, 'none'].map(mode => caseOf(0, { ...settings, values: { ...settings.values, [modeKey]: mode } })),
      caseOf(0, { ...settings, values: { ...settings.values, [key]: false } }),
      ...(limit ? [caseOf(0, { ...settings, values: { ...settings.values, currentEnergy: limit } })] : [])];
  });
  check('ororon', 'a1', 'directEnergy.p1', 1, 'directEnergyRestored', 'owner', ({ text }) => {
    const key = 'ororon.directEnergy.p1', value = amount(text, /还会为欧洛伦恢复(\d+)点/);
    const settings = { party: ['kaeya'], onField: 'kaeya', values: { [key]: true }, direct: true };
    return [caseOf(value, settings), caseOf(0, { ...settings, recipient: 'kaeya' }),
      caseOf(0, { ...settings, onField: 'ororon' }), caseOf(0, { ...settings, values: { [key]: false } })];
  });

  for (const [slot, suffix, rank, upgrade] of [['t1', 'bond-of-life-from-healing', 3, false], ['a1', 'bond-of-life-from-healing-a4', 4, true]]) {
    check('clorinde', slot, suffix, 0, 'bondOfLifeFromHealing', 'owner', reference => {
      const ratio = upgrade ? pct(reference.text, /比例提升至(\d+)%/) : reference.parameter('param9');
      const night = 'clorinde.nightVigil', eligible = 'clorinde.nonImpaleHealingConfirmed', healing = 'clorinde.convertibleHealingHp';
      const settings = { values: { [night]: true, [eligible]: true, [healing]: 250.5 }, ascension: rank };
      return [...[0, 250.5, 1000].map(value => caseOf(value * ratio, { ...settings, values: { ...settings.values, [healing]: value } })),
        ...[night, eligible].map(key => caseOf(0, { ...settings, values: { ...settings.values, [key]: false } })),
        caseOf(0, { ...settings, ...peer() }), ...(upgrade ? [caseOf(0, { ...settings, ascension: 3 })] : [])];
    });
  }
  check('lauma', 't2', 'pale-hymn-from-moonsong', 0, 'paleHymnFromMoonsong', 'owner', reference => {
    const rate = amount(reference.text, /每层使菈乌玛获得(\d+)层/);
    if (rate !== reference.parameter('param2')) return [];
    const gate = 'lauma.moonsongConverted';
    return [...[0, 1, 3].flatMap(count => toggled({}, { [gate]: true, 'lauma.moonsongConsumed': count }, gate, count * rate)),
      caseOf(0, { ...peer(), values: { [gate]: true, 'lauma.moonsongConsumed': 3 } })];
  });
  for (const index of [0, 1]) check('noelle', 't1', 'breastplate-healing-chance', index, 'talentHealingChance', 'owner', reference => {
    const c1 = pct(reference.original('c1'), /触发几率提升至(\d+)%/);
    const value = index ? c1 : reference.parameter('param3'), shield = 'noelle.breastplateShieldActive', hit = 'noelle.breastplateAttackLanded';
    const sweeping = 'noelle.sweepingTime', values = { [shield]: true, [hit]: true, [sweeping]: Boolean(index) };
    const settings = { values, constellation: 1 };
    return [caseOf(value, settings), ...[shield, hit].map(key => caseOf(0, { ...settings, values: { ...values, [key]: false } })),
      ...(index ? [caseOf(0, { ...settings, values: { ...values, [sweeping]: false } }), caseOf(0, { ...settings, constellation: 0 })] : []),
      caseOf(0, { ...settings, hit: { category: 'plunge' } }),
      caseOf(0, { ...settings, ...peer() })];
  });

  for (const [slot, suffix] of [['t2', 't2.sweeping-time-attack'], ['c6', 'c6.sweeping-time-extra-attack']]) {
    check('noelle', slot, suffix, 0, 'attack', 'owner', reference => {
      const burst = slot === 't2', ratio = burst ? reference.parameter('param3') : pct(reference.text, /防御力(\d+)%/);
      const key = 'noelle.sweepingTime', snap = 'noelle.defenseAtSweeping';
      return [500, 1230].flatMap(defense => [...toggled({}, { [key]: true, [snap]: defense }, key, defense * ratio),
        caseOf(0, { ...peer(), values: { [key]: true, [snap]: defense } })]);
    });
  }
  check('xinyan', 'c6', 'c6.charged-defence', 0, 'attack', 'owner', reference => {
    const charged = talentHit('normal.param5'), ratio = pct(reference.text, /防御力的(\d+)%/);
    return [...[0, 550].map(added => caseOf((reference.stat('defense').value + added) * ratio,
      { ...charged, inputs: { flatDefense: ['defense', added] } })), caseOf(0), caseOf(0, { ...charged, constellation: 5 })];
  });
  check('kujousara', 't1', 't1.tengu-attack', 0, 'attack', 'team', reference => {
    const value = reference.stat('attack').white * reference.parameter('param2'), gate = 'kujousara.tenguJuuraiRecipient';
    return [caseOf(value, { ...peer(), recipientValues: { [gate]: true } }), caseOf(value, { recipientValues: { [gate]: true } }),
      caseOf(value, { ...peer(), recipientValues: { [gate]: true }, inputs: { flatAttack: ['attack', 2000] } }),
      caseOf(0, { ...peer(), recipientValues: { [gate]: false } })];
  });
  for (const band of ['low', 'high']) check('iansan', 't2', 't2.kinetic-' + band, 0, 'attack', 'team', reference => {
    const limit = amount(reference.text, /少于(\d+)点/), attack = reference.stat('attack').value;
    const gate = 'iansan.kineticMarkerActive', count = 'iansan.kineticNightsoul';
    const threshold = band === 'high';
    const settings = { ...peer(), values: { [gate]: true } };
    return [...(threshold ? [limit, limit + 5] : [0, 15, limit - 1]).flatMap(points => [attack, 5000].map(basis => caseOf(
      Math.min(reference.parameter('param4'), basis * (threshold ? reference.parameter('param2') : points * reference.parameter('param3'))),
      { ...settings, values: { ...settings.values, [count]: points }, inputs: { flatAttack: ['attack', basis - attack] } }))),
      caseOf(0, { ...settings, values: { [gate]: true, [count]: threshold ? limit - 1 : limit } }),
      caseOf(0, { ...settings, values: { [gate]: false, [count]: threshold ? limit : 15 } }),
      caseOf(0, { ...settings, values: { [gate]: true, [count]: threshold ? limit : 15 }, onField: 'iansan' })];
  });
  check('nicole', 't1', 'kenosis', 0, 'attack', 'team', reference => {
    const settings = { ...peer(), events: [cast('skill')] };
    const rate = reference.parameter('param5'), cap = reference.parameter('param6'), end = reference.parameter('param7') * 1000;
    const basis = reference.stat('attack').value;
    const expected = Math.min(basis * rate, cap);
    return [caseOf(expected, settings), caseOf(expected, { ...settings, timeMs: end - 1 }),
      caseOf(0, { ...settings, timeMs: end }), caseOf(0, { ...settings, events: [] })];
  });
  for (const [suffix, role] of [['owner', 'owner'], ['others', 'team']]) {
    check('prune', 'c6', 'c6.reaction-inspiration-' + suffix, 0, 'attack', role, ({ text }) => {
      const gate = 'prune.reactionInspirationWindow', inspire = 'prune.inspirationWindow', value = amount(text, /攻击力提升(\d+)点/);
      const settings = { ...peer(), recipient: role === 'owner' ? 'prune' : 'kaeya', values: { [gate]: true }, recipientValues: { [inspire]: true } };
      return [caseOf(value, settings), caseOf(0, { ...settings, values: { [gate]: false } }),
        caseOf(0, { ...settings, recipient: role === 'owner' ? 'kaeya' : 'prune' }),
        ...(role === 'team' ? [caseOf(0, { ...settings, onField: 'prune' }), caseOf(0, { ...settings, recipientValues: { [inspire]: false } })] : [])];
    });
  }
  check('vodyanitsa', 'c1', 'c1-song-attack', 0, 'flatAttack', 'team', reference => {
    const key = 'vodyanitsa.c1Healed', ratio = pct(reference.text, /生命值上限的([\d.]+)%/);
    return [0, 11000].flatMap(added => [{}, peer()].flatMap(recipient => toggled({ ...recipient, inputs: { flatHp: ['hp', added] } },
      { [key]: true }, key, (reference.stat('hp').value + added) * ratio)));
  });

  for (const index of [0, 1]) check('xingqiu', 't1', 'rain-sword-reduction', index, 'incomingDamageReduction', 'team', reference => {
    const ratio = pct(reference.text, /水元素伤害加成的(\d+)%/), cap = pct(reference.text, /获得(\d+)%额外伤害减免/);
    const settings = { ...peer(), values: { 'xingqiu.rainSwordActive': true } };
    return [...[0, .74, 1.4].map(hydro => caseOf(index ? Math.min(hydro * ratio, cap) : reference.parameter('param3'),
      { ...settings, inputs: { hydroBonus: ['scalar', hydro] } })),
      caseOf(0, { ...settings, values: { 'xingqiu.rainSwordActive': false }, inputs: { hydroBonus: ['scalar', .74] } }),
      caseOf(0, { ...settings, onField: 'xingqiu', inputs: { hydroBonus: ['scalar', .74] } })];
  });

  for (const entity of ['aether-electro', 'lumine-electro']) for (const [slot, suffix] of [['t1', 'skill.abundance-amulet'], ['a1', 'a1.resounding-roar']]) {
    check(entity, slot, suffix, 0, 'particleEnergyRecharge', 'team', reference => {
      const gate = entity + '.abundanceAmuletWindow', skill = slot === 't1';
      const rate = skill ? reference.parameter('param4') : pct(reference.text, /元素充能效率的(\d+)%/);
      return [1, 2.1].flatMap(recharge => toggled({ ...peer(), inputs: { energyRecharge: ['scalar', recharge] } },
        { [gate]: true }, gate, skill ? rate : rate * recharge));
    });
  }
  for (const [suffix, slot, index] of [['nightingale-song', 't2', 0], ['hunter-dusk-1', 'a1', 1], ['hunter-dusk-2', 'a1', 2], ['hunter-dusk-3', 'a1', 3]]) {
    check('illuga', slot, suffix, 1, 'reaction.lunar.flatBaseBonus', 'team', reference => {
      const rate = index ? pct(reference.text, /月结晶反应造成的伤害，提升值则相当于叶洛亚元素精通的(\d+)%\/(\d+)%\/(\d+)%/, index) : reference.parameter('param4');
      const count = Math.max(index, 2);
      const includes = index === 1 ? { recipient: 'illuga', party: ['kaeya'], ...talentHit('burst.param1', 'lunar-crystallize') }
        : { recipient: 'zibai', party: ['zibai', ...count === 3 ? ['barbara'] : []], ...talentHit('skill.param2', 'lunar-crystallize') };
      const values = { 'illuga.nightingaleSong': true, 'illuga.nightingaleSpend': true };
      const hit = includes.hit;
      const ordinaryHit = { hit: { ...hit, family: 'ordinary' } };
      const settings = { ...includes, values };
      return [
        ...[150, 340].map(master => caseOf(master * rate, { ...settings, inputs: { elementalMastery: ['elementalMastery', master] } })),
        caseOf(0, { ...settings, ...ordinaryHit }),
        caseOf(0, { ...settings, values: { ...values, 'illuga.nightingaleSpend': false } }),
        caseOf(0, { ...settings, onField: index === 1 ? 'kaeya' : 'illuga' }),
        ...(index > 1 ? [caseOf(0, { ...settings, party: [...includes.party, ...index === 2 ? ['barbara'] : []].slice(0, index === 3 ? 1 : 2) })] : []),
      ];
    });
  }
  check('illuga', 'c4', 'c4-night-defense', 0, 'flatDefense', 'team', ({ text }) => {
    const key = 'illuga.nightingaleSong', value = amount(text, /防御力提升(\d+)点/);
    return [...toggled(peer(), { [key]: true }, key, value),
      caseOf(0, { ...peer(), onField: 'illuga', values: { [key]: true } })];
  });

  for (const [slot, prefix] of [['c1', 'c1'], ['c6', 'c6']]) {
    const c6 = slot === 'c6';
    for (const mode of ['ordinary', 'megaton']) {
      check('linnea', slot, prefix + '.catalogue-' + mode, 0, 'reaction.lunar.flatBaseBonus', mode === 'ordinary' ? 'team' : 'owner', reference => {
        const text = c6 ? reference.original('c1') : reference.text;
        const upgrade = c6 ? pct(reference.text, /伤害提升效果提高至原本的(\d+)%/) : 1;
        const consumption = c6 ? amount(reference.text, /消耗原本(\d+)倍的层数/) : 1;
        const perStack = pct(text, mode === 'ordinary' ? /莉奈娅防御力的(\d+)%/ : /每层都会使造成的伤害提升，提升值相当于莉奈娅防御力的(\d+)%/) * upgrade;
        const ratio = perStack * (mode === 'ordinary' ? consumption : 1);
        const defense = reference.stat('defense').value;
        const rank = c6 ? 5 : 6;
        if (mode === 'ordinary') {
          const key = 'linnea.catalogueConsumeReady', settings = { ...peer('zibai'), ...talentHit('burst.param2', 'lunar-crystallize'), values: { [key]: true } };
          return [...[0, 500].map(added => caseOf((defense + added) * ratio, { ...settings, inputs: { flatDefense: ['defense', added] } })),
            caseOf(0, { ...settings, values: { [key]: false } }), caseOf(0, { ...settings, ...talentHit('burst.param1', 'ordinary') }),
            caseOf(0, { ...settings, constellation: rank })];
        }
        const key = 'linnea.megatonCatalogueSpent', settings = talentHit('skill.param3', 'lunar-crystallize');
        const cap = amount(text, /消耗至多(\d+)层/) * consumption;
        return [...[0, 1, cap].map(count => caseOf(defense * count * ratio, { ...settings, values: { [key]: count } })),
          caseOf(0, { ...settings, constellation: rank, values: { [key]: 1 } }), caseOf(0, { values: { [key]: 1 } })];
      });
    }
  }
  check('linnea', 'c6', 'c6.moonsign-elevation', 0, 'reaction.lunar.elevationFactor', 'team', ({ text }) => {
    const gain = 1 + pct(text, /月结晶反应伤害擢升(\d+)%/);
    return [...toggled({ ...peer('zibai'), ...talentHit('burst.param2', 'lunar-crystallize') }, { fullMoonsign: true }, 'fullMoonsign', gain),
      caseOf(0, { ...peer('zibai'), ...talentHit('burst.param1', 'ordinary'), values: { fullMoonsign: true } })];
  });

  check('nefer', 'c1', 'c1-phantasm-lunar', 0, 'reaction.lunar.flatBaseBonus', 'owner', reference => {
    const ratio = pct(reference.text, /元素精通的(\d+)%/), master = 260;
    const veil = reference.original('t1');
    const readRates = veil.match(/伪秘之帷[^。]*?每层[^。]*?(\d+(?:\.\d+)?)%/)?.[1];
    const hit = talentHit('skill.phantasm-shadow-1', 'lunar-bloom');
    const inputs = { elementalMastery: ['elementalMastery', master] };
    const basis = reference.stat('elementalMastery').value + master;
    const cases = [caseOf(basis * ratio, { ...hit, inputs }), caseOf(0, { ...lunarHit('lunar-bloom'), inputs })];
    if (readRates) cases.push(caseOf(basis * ratio * (1 + Number(readRates) / 100),
      { ...hit, inputs, values: { 'nefer.phantasmVeil': 1 } }));
    return cases;
  });
  check('nefer', 'c6', 'c6-lunar-elevation', 0, 'reaction.lunar.elevationFactor', 'owner', ({ text }) => {
    const rate = 1 + pct(text, /月绽放反应伤害擢升(\d+)%/);
    return [...toggled(lunarHit('lunar-bloom'), { fullMoonsign: true }, 'fullMoonsign', rate),
      caseOf(0, { ...peer(), ...lunarHit('lunar-bloom'), values: { fullMoonsign: true } })];
  });

  check('nilou', 'a1', 'a1.bountiful-core', 0, 'reaction.transformative.damageBonus', 'team', reference => {
    const start = amount(reference.text, /超过(\d+)的部分/), step = amount(reference.text, /每(\d+)点/);
    const rate = pct(reference.text, /造成的伤害提升(\d+)%/), cap = pct(reference.text, /伤害提升(\d+)%[。\s]*$/);
    const key = 'nilou.goldenChalice', basis = reference.stat('hp').value;
    const settings = { party: ['collei', 'barbara'], recipient: 'collei', ...trans('bloom'), recipientValues: { [key]: true } };
    return [...[start - 100, start, 42050, 80000].map(hp => caseOf(Math.min(cap, Math.max(0, hp - start) / step * rate),
      { ...settings, inputs: { flatHp: ['hp', hp - basis] } })),
      ...[trans('hyperbloom'), { recipientValues: { [key]: false } }, { party: ['collei', 'kaeya'] }].map(exclusion =>
        caseOf(0, { ...settings, ...exclusion, inputs: { flatHp: ['hp', 42050 - basis] } }))];
  });

  for (const [index, stat] of ['reaction.transformative.damageBonus', 'reaction.stellar-swirl.damageBonus'].entries()) {
    check('yumemizukimizuki', 't1', 'dreamdrifter-reactions', index, stat, 'team', reference => {
      const rate = reference.parameter(index ? 'param6' : 'param2') / 100, key = 'yumemizukimizuki.dreamdrifter';
      const hit = index ? starHit('stellar-swirl') : elementalReaction('swirl', 'pyro');
      const settings = { ...peer(), ...hit, onField: 'yumemizukimizuki' };
      return [...[150, 400].flatMap(master => toggled({ ...settings, inputs: { elementalMastery: ['elementalMastery', master] } },
        { [key]: true }, key, (reference.stat('elementalMastery').value + master) * rate)),
      caseOf(0, { ...settings, ...trans('electro-charged'), inputs: { elementalMastery: ['elementalMastery', 150] }, values: { [key]: true } })];
    });
  }
  for (const [index, suffix, family] of [[0, 'c1-swirl-night', 'transformative'], [1, 'c1-stellar-night', 'stellar-swirl']]) {
    check('yumemizukimizuki', 'c1', suffix, 0, 'reaction.' + family + '.flatBaseBonus', 'team', reference => {
      const rate = pct(reference.text, /精通的(\d+)%\/(\d+)%/, index + 1);
      const key = 'yumemizukimizuki.c1Night', settings = { ...peer(), ...(index ? starHit(family) : elementalReaction('swirl', 'pyro')),
        onField: 'yumemizukimizuki' };
      return [...[220, 540].flatMap(master => toggled({ ...settings, inputs: { elementalMastery: ['elementalMastery', master] } },
        { [key]: true }, key, (reference.stat('elementalMastery').value + master) * rate)),
      caseOf(0, { ...settings, ...trans('electro-charged'), inputs: { elementalMastery: ['elementalMastery', 220] }, values: { [key]: true } })];
    });
  }

  for (const [slot, suffix, requireFull, pattern] of [
    ['a0', 'a0.taiyin-damage', false, /兹白防御力的(\d+)%/],
    ['c2', 'c2.taiyin-enhanced', true, /兹白防御力的(\d+)%/],
  ]) check('zibai', slot, suffix, 0, 'reaction.lunar.flatBaseBonus', 'owner', reference => {
    const gate = 'zibai.taiyinDescent', ratio = pct(reference.text, pattern), hit = talentHit('skill.param2', 'lunar-crystallize');
    const settings = { ...hit, ascension: 1, values: { [gate]: true, fullMoonsign: true } };
    const defense = reference.stat('defense', { ascension: 1 }).value;
    return [...[0, 250].map(added => caseOf((defense + added) * ratio, { ...settings, inputs: { flatDefense: ['defense', added] } })),
      caseOf(0, { ...settings, values: { [gate]: false, fullMoonsign: true } }), caseOf(0, { ...settings, hit: { category: 'plunge' } }),
      ...(requireFull ? [caseOf(0, { ...settings, values: { [gate]: true, fullMoonsign: false } }), caseOf(0, { ...settings, ascension: 0 })] : [])];
  });

  for (const [suffix, index, target, hit, hasWindow] of [
    ['stride-elevation', 0, 'reaction.lunar.elevationFactor', talentHit('skill.param2', 'lunar-crystallize'), false],
    ['stride-elevation', 1, 'elevationFactor', talentHit('skill.param1', 'ordinary'), false],
    ['following-hit-elevation', 0, 'reaction.lunar.elevationFactor', talentHit('burst.param2', 'lunar-crystallize'), true],
    ['reaction-elevation', 0, 'reaction.lunar.elevationFactor', lunarHit('lunar-crystallize'), true],
  ]) check('zibai', 'c6', 'c6-' + suffix, index, target, 'owner', ({ text }) => {
    const start = amount(text, /超过(\d+)点/), rate = pct(text, /擢升([\d.]+)%/);
    const window = 'zibai.strideElevationWindow', consumed = 'zibai.strideRadianceConsumed';
    return [...[start - 1, start, 90, 100].map(count => caseOf(1 + Math.max(0, count - start) * rate, { ...hit, values: { [window]: true, [consumed]: count } })),
      caseOf(0, { values: { [window]: true, [consumed]: 95 } }),
      ...(hasWindow ? [caseOf(0, { ...hit, values: { [window]: false, [consumed]: 95 } })] : [])];
  });
  for (const [entity, family, suffix, useMastery, pattern, capPattern, step] of [
    ['mitya', 'stellar-conduct', 'stellar-base', true, /每点元素精通都将提升([\d.]+)%/, /至多通过这种方式提升(\d+)%/, 1],
    ['odette', 'stellar-swirl', 'reaction-blessing', false, /每100点攻击力都将提升([\d.]+)%/, /至多通过这种方式提升(\d+)%/, 100],
    ['sandrone', 'stellar-swirl', 'reaction-blessing', false, /每100点攻击力都将提升([\d.]+)%/, /至多通过这种方式提升(\d+)%/, 100],
    ['vesna', 'stellar-swirl', 'linchpin-base.effect', false, /每100点攻击力都将提升([\d.]+)%/, /至多通过这种方式提升(\d+)%/, 100],
    ...['aether-cryo', 'lumine-cryo'].map(entity =>
      [entity, 'stellar-swirl', 'reaction-blessing', false, /每100点攻击力都将提升([\d.]+)%/, /至多通过这种方式提升(\d+)%/, 100]),
  ]) check(entity, 'a2', suffix, suffix === 'reaction-blessing' ? 1 : 0, 'reaction.' + family + '.baseBonus', 'team', reference => {
    const cap = pct(reference.text, capPattern), rate = pct(reference.text, pattern);
    const key = useMastery ? 'elementalMastery' : 'flatAttack', unit = useMastery ? 'elementalMastery' : 'attack';
    const base = reference.stat(unit).value, amounts = useMastery ? [120, 580] : [500, 2600];
    return [...amounts.flatMap(input => [{}, peer()].map(recipient => caseOf(Math.min(cap, (base + input) / step * rate),
      { ...recipient, ...starHit(family), inputs: { [key]: [unit, input] } }))),
      caseOf(0, { ...peer(), inputs: { [key]: [unit, amounts[0]] } })];
  });

  for (const [index, family] of stars.entries()) {
    check('odette', 't2', 'swanDream', index, 'reaction.' + family + '.damageBonus', 'owner', reference => {
      const value = reference.parameter('param3'), end = reference.parameter('param4') * 1000;
      const settings = { ...starHit(family), events: [cast('burst')], values: { 'odette.swanDream': undefined } };
      return [caseOf(value, settings), caseOf(value, { ...settings, timeMs: end - 1 }), caseOf(0, { ...settings, timeMs: end }),
        caseOf(0, { ...settings, events: [] }), caseOf(0, { ...settings, ...peer() })];
    });
    check('odette', 'c4', 'c4.swan-dream-shared', index, 'reaction.' + family + '.damageBonus', 'team', reference => {
      const base = reference.parameter('param3', 1, 't2');
      const value = base * pct(reference.text, /雪鹄之梦效果的(\d+)%/), key = 'odette.swanDream';
      return [...toggled({ ...peer(), ...starHit(family) }, { [key]: true }, key, value),
        caseOf(0, { ...starHit(family), values: { [key]: true } }), caseOf(0, { ...peer(), values: { [key]: true } })];
    });
    check('odette', 'a1', 'a1.overstreamed-attack', index, 'reaction.' + family + '.baseBonus', 'owner', reference => {
      const start = amount(reference.text, /超过(\d+)点/), step = amount(reference.text, /每(\d+)点/);
      const rate = pct(reference.text, /额外造成原本([\d.]+)%/), cap = pct(reference.text, /至多通过这种方式额外造成原本(\d+)%/);
      const base = reference.stat('attack').value;
      return [...[start - 100, start, 1530, 3500].map(attack => caseOf(Math.min(cap, Math.max(0, attack - start) / step * rate),
        { ...starHit(family), inputs: { flatAttack: ['attack', attack - base] } })),
        caseOf(0, { ...peer(), ...starHit(family), inputs: { flatAttack: ['attack', 1530 - base] } })];
    });
    for (const [suffix, role, pattern] of [
      ['c6-personal-elevation', 'owner', /额外擢升(\d+)%/],
      ['c6-splendor-elevation', 'team', /星烁反应伤害擢升(\d+)%/],
    ]) check('odette', 'c6', suffix, index, 'reaction.' + family + '.elevation', role, ({ text }) => {
      const value = pct(text, pattern), gate = 'odette.splendorStacks';
      const settings = { ...starHit(family), ...(role === 'team' ? { ...peer(), ascension: 1, recipientValues: { [gate]: 1 } } : {}) };
      return [caseOf(value, settings), caseOf(0, { ...settings, ...starHit(stars[1 - index]) }),
        ...(role === 'team' ? [caseOf(0, { ...settings, recipientValues: { [gate]: 0 } }), caseOf(0, { ...settings, ascension: 0 })]
          : [caseOf(0, { ...settings, ...peer() }), caseOf(0, { ...settings, constellation: 5 })])];
    });
    for (const [suffix, gate, hit] of [
      ['second-ray', 'sandrone.powerAbove50', 'skill.second'],
      ['beam-tactics', null, 'burst.param2'],
    ]) check('sandrone', 'a0', suffix, index, 'reaction.' + family + '.baseMultiplier', 'owner', ({ text }) => {
      const settings = talentHit(hit, family), excluded = talentHit('skill.param1', family);
      if (gate) return [...toggled(settings, { [gate]: true }, gate, pct(text, /造成原本(\d+)%的伤害/)),
        caseOf(0, { ...excluded, values: { [gate]: true } })];
      const base = pct(text, /造成原本(\d+)%\+清除层数/), rate = pct(text, /清除层数\*(\d+)%/), cap = amount(text, /至多叠加(\d+)层/);
      return [...[0, 4, cap].map(count => caseOf(base + rate * count, { ...settings, values: { 'sandrone.tactics': count } })),
        caseOf(0, { ...excluded, values: { 'sandrone.tactics': 4 } })];
    });
    check('sandrone', 'c1', 'c1.analysis-stellar', index, 'reaction.' + family + '.damageBonus', 'team', ({ text }) => {
      const value = pct(text, /星烁反应伤害提升(\d+)%/), gate = 'sandrone.analysisMode';
      return [...toggled({ ...peer(), ...starHit(family) }, { [gate]: true }, gate, value),
        caseOf(0, { ...peer(), ...starHit(stars[1 - index]), values: { [gate]: true } })];
    });
    check('sandrone', 'c6', 'c6.stellar-elevation', index, 'reaction.' + family + '.elevation', 'owner', ({ text }) => {
      const value = pct(text, /所有星烁反应伤害擢升(\d+)%/);
      return [caseOf(value, starHit(family)), caseOf(0, starHit(stars[1 - index])),
        caseOf(0, { ...peer(), ...starHit(family) }), caseOf(0, { ...starHit(family), constellation: 5 })];
    });
    for (const entity of ['aether-cryo', 'lumine-cryo']) {
      check(entity, 'c6', 'c6.frostglow-shared', index, 'reaction.' + family + '.damageBonus', 'team', ({ text }) => {
        const rate = pct(text, /星烁反应伤害提升(\d+)%/), cap = pct(text, /至多通过这种方式提升(\d+)%/);
        const duration = amount(text, /持续(\d+)秒/) * 1000, key = entity + '.frostglowSpent';
        const settings = { ...peer(), ...starHit(family), events: [cast('burst')], values: { [key]: 4 } };
        return [...[0, 2, cap / rate].map(count => caseOf(Math.min(count * rate, cap), { ...settings, values: { [key]: count } })),
          caseOf(rate * 4, { ...settings, timeMs: duration - 1 }), caseOf(0, { ...settings, timeMs: duration }),
          caseOf(0, { ...settings, events: [] }), caseOf(0, { ...settings, recipient: entity }), caseOf(0, { ...settings, ...starHit(stars[1 - index]) })];
      });
    }
  }
  check('vesna', 'a0', 'discipline.stellar-swirl.effect', 0, 'reaction.stellar-swirl.baseMultiplier', 'owner', ({ text }) => {
    const base = pct(text, /原本(\d+)%\+整肃层数/), rate = pct(text, /整肃层数\*(\d+)%/), cap = amount(text, /至多叠加(\d+)层/);
    const settings = talentHit('skill.param4', 'stellar-swirl'), key = 'vesna.disciplineStacks';
    return [...[0, 2, cap].map(count => caseOf(base + rate * count, { ...settings, values: { [key]: count } })),
      caseOf(0, { ...talentHit('skill.param1', 'stellar-swirl'), values: { [key]: 3 } })];
  });
  for (const [entity, suffix, role, family, pattern] of [
    ['mitya', 'c6-conduct-elevation', 'team', 'stellar-conduct', /星超导反应伤害擢升(\d+)%/],
    ['vesna', 'c6-elevation.effect', 'owner', 'stellar-swirl', /星扩散反应伤害擢升(\d+)%/],
  ]) check(entity, 'c6', suffix, 0, 'reaction.' + family + '.elevation', role, ({ text }) => {
    const value = pct(text, pattern), settings = { ...starHit(family), ...(role === 'team' ? peer() : {}) };
    return [caseOf(value, settings), caseOf(0, { ...settings, constellation: 5 }),
      caseOf(0, { ...settings, ...starHit(stars.find(other => other !== family)) }),
      caseOf(role === 'team' ? value : 0, { ...settings, ...peer(), recipient: role === 'team' ? entity : 'kaeya' })];
  });

  for (const [slot, suffix] of [['t0', 'assault-order'], ['a1', 'cannon-potency-stellar']]) {
    check('valeriy', slot, suffix, slot === 't0' ? 1 : 0, 'reaction.stellar-conduct.flatBaseBonus', 'team', reference => {
      const rate = slot === 't0' ? reference.parameter('param8') : pct(reference.text, /瓦列里攻击力的([\d.]+)%/);
      const window = 'valeriy.assaultOrderWindow', trigger = 'valeriy.assaultOrder', spent = 'valeriy.spentImpactPotential';
      const values = { radiance: 'stellar-conduct', [window]: true, [trigger]: true, [spent]: 40 };
      const settings = { ...peer('sandrone'), ...talentHit('skill.second', 'stellar-conduct'), values };
      const basis = reference.stat('attack').value;
      return [...[40, 80].map(count => caseOf(basis * rate * (slot === 't0' ? 1 : count),
        { ...settings, values: { ...values, [spent]: count } })),
      ...[window, trigger].map(key => caseOf(0, { ...settings, values: { ...values, [key]: false } })),
      caseOf(0, { ...settings, onField: 'valeriy' }), caseOf(0, { ...settings, values: { ...values, radiance: 'none' } })];
    });
  }
  return output;
}
