import { combatFactDeclaration } from '../../src/schema/src/calculation/buffs.mjs';
import { resolveHitElement } from '../../src/schema/src/calculation/hit-bindings.mjs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const statsPath = capture + 'stats/talents.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const rates = read(statsPath);
const weaponStats = read(catalog + 'weapons.json');
const weaponCurves = read(catalog + 'weapon-curves.json');
const characterStats = read(catalog + 'characters.json');
const characterCurves = read(catalog + 'character-curves.json');
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-9);
const resistance = element => 'target.resistance.' + element;
const bonus = element => 'attribute.' + element + 'Bonus';
const absorbed = ['pyro', 'hydro', 'cryo', 'electro'];
const elemental = ['anemo', 'cryo', 'dendro', 'electro', 'geo', 'hydro', 'pyro'];
const peers = { anemo: 'sucrose', cryo: 'kaeya', dendro: 'collei', electro: 'lisa', geo: 'noelle', hydro: 'barbara', pyro: 'amber' };
const cast = skill => ({ kind: 'action', skill });
const strike = (hit, target = 'enemy') => ({ kind: 'hit', hit, target });
const reaction = (reactionId, props = {}) => ({ kind: 'reaction', reactionId, ...props });
const test = (expected, settings = {}) => ({ expected, settings });
const exclude = settings => test(0, settings);
const flags = values => ({ values });
const toggle = (key, expected, settings = {}) => [
  test(expected, { ...settings, values: { ...settings.values, [key]: true } }),
  exclude({ ...settings, values: { ...settings.values, [key]: false } }),
];
const team = (...party) => ({ party, recipient: party[0] });
const event = (expected, trigger, duration, excluded, settings = {}) => [
  test(expected, { ...settings, triggers: [trigger] }),
  test(expected, { ...settings, triggers: [trigger], timeMs: duration - 1 }),
  exclude({ ...settings, triggers: [trigger], timeMs: duration }),
  exclude({ ...settings, triggers: [excluded] }),
  exclude(settings),
];

function slotFor(slot) {
  const group = { a: 'passives', c: 'constellations', t: 'talents' }[slot[0]];
  const index = Number(slot.slice(1)) - Number(group === 'constellations');
  const key = group === 'constellations' ? slot : (group === 'passives' ? 'passive' : 'combat') + (index + 1);
  return { group, index, key };
}

function sourceFor(entity, slot) {
  const { group, key } = slotFor(slot);
  const folder = group === 'constellations' ? group : 'talents';
  const id = entity.replace(/^(aether|lumine)-/, 'traveler');
  const path = capture + 'ChineseSimplified/' + folder + '/' + id + '.json';
  const entry = read(path)[key];
  return { entry, text: entry.description.replaceAll('**', ''), ref: path + '#' + key };
}

function parameter(entity, slot, label) {
  const { entry, ref } = sourceFor(entity, slot);
  const { key } = slotFor(slot);
  const param = entry.attributes.labels.find(text => text.startsWith(label + '|'))?.match(/\{(param\d+):/)?.[1];
  return { values: rates[entity]?.[key]?.[param] ?? [], refs: [ref, statsPath + '#' + entity + '/' + key + '/' + param] };
}

function sourceStat(id, weaponId, ascension, level, attribute) {
  const character = characterStats[id].stats;
  const weapon = weaponStats[weaponId].stats;
  if (attribute === 'attack') {
    return character.base.attack * characterCurves[level][character.curve.attack] + character.promotion[ascension].attack
      + weapon.base.attack * weaponCurves[1][weapon.curve.attack] + weapon.promotion[0].attack;
  }
  const bases = attribute === 'elementalMastery' ? 0 : 1;
  const property = attribute === 'elementalMastery' ? 'FIGHT_PROP_ELEMENT_MASTERY' : 'FIGHT_PROP_CHARGE_EFFICIENCY';
  return bases + (character.specialized === property ? character.promotion[ascension].specialized : 0)
    + (weapon.specialized === property ? weapon.base.specialized * weaponCurves[1][weapon.curve.specialized] : 0);
}

function statRefs(entity, weaponId) {
  return [catalog + 'characters.json#' + entity + '/stats', catalog + 'character-curves.json',
    catalog + 'weapons.json#' + weaponId + '/stats', catalog + 'weapon-curves.json'];
}

function hitFor(character, suffix) {
  const id = character.id + '.' + suffix;
  const talent = suffix ? character.talents.find(talent => talent.hits.some(hit => hit.id === id)) : character.talents[0];
  return [talent, suffix ? talent?.hits.find(hit => hit.id === id) : talent?.hits[0]];
}

/** Verify only the listed modifier, with independent source values and active and excluded scenarios. */
export function characterResistanceBonusProofs(entities, results, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const choices = new Map(), prepared = new Map(), output = [];
  const existing = new Set((results.registeredModifierEvidence ?? []).map(row => row.key));
  for (const row of results.calculator.buffs) {
    const key = row.entity + row.field;
    choices.set(key, choices.has(key) ? null : row);
  }

  function teamFor(entity, options) {
    const { ascension, constellation, party = [], weapon, ranks = {} } = options;
    const key = JSON.stringify([entity, ascension, constellation, party, weapon, ranks]);
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
        Object.assign(build.talents, ranks);
      }
      return { id, build };
    });
    const result = actors.every(Boolean) && engine.prepareStructuredBuilds(actors);
    const compiled = result?.ok ? result.team : null;
    prepared.set(key, compiled);
    return compiled;
  }

  function measure(entity, rule, target, windowFact, settings) {
    const built = teamFor(entity, settings);
    const { party = [], recipient = entity, hit: suffix, values = {}, triggers = [], timeMs = 1000, onField = true } = settings;
    if (!built || ![entity, ...party].includes(recipient)) return;
    const supplier = characters.get(entity);
    const [talent, hit] = hitFor(characters.get(recipient), suffix);
    if (!hit) return;
    const { setup, request } = auditHit(characters.get(recipient), talent, hit);
    const { frame } = request;
    if (recipient !== entity) {
      for (const row of frame.factOverrides) if (row.subject.kind === 'actor') row.subject = { kind: 'actor', id: recipient };
      frame.factOverrides.push({ subject: { kind: 'actor', id: 'actor' }, facts: {} });
      // Defaults are applied to the effect supplier. Preserve the actual dealer's hit facts.
      frame.factOverrides.reverse();
    }
    setAuditDefaults(supplier, frame);
    const owner = frame.factOverrides.find(row => row.subject.kind === 'actor' && row.subject.id === 'actor');
    owner.subject = { kind: 'actor', id: entity };
    owner.facts.onField = bool(recipient === entity && onField);
    const receiver = frame.factOverrides.find(row => row.subject.kind === 'actor' && row.subject.id === recipient);
    receiver.facts.onField = bool(onField);
    // Event-derived window facts remain unset unless supplied by an explicit observation.
    if (windowFact) for (const row of frame.factOverrides) delete row.facts[windowFact];
    for (const [key, value] of Object.entries(values)) {
      const field = combatFactDeclaration(supplier.metadata.facts, key);
      if (!field) throw new Error(entity + ': 缺少条件字段 ' + key);
      const input = typeof value === 'boolean' ? bool(value) : typeof value === 'number' ? number(field.type.unit, value) : fact({ kind: 'enum', value });
      if (field.scope === 'query') { frame.facts[key] = input; continue; }
      const kind = field.scope === 'team' ? 'team' : field.scope === 'target' ? 'target' : 'actor';
      const id = kind === 'team' ? undefined : kind === 'target' ? 'enemy' : field.scope === 'recipient' ? recipient : entity;
      let override = frame.factOverrides.find(row => row.subject.kind === kind && row.subject.id === id);
      if (!override) frame.factOverrides.push(override = { subject: { kind, ...(id ? { id } : {}) }, facts: {} });
      override.facts[key] = input;
    }
    for (const row of setup.events) {
      row.actorId = recipient;
      for (const observation of row.subjectFacts ?? []) {
        if (observation.subject.kind === 'actor') observation.subject = { kind: 'actor', id: recipient };
      }
    }
    const query = setup.events.find(row => row.id === 'hit');
    query.timeMs = timeMs;
    query.order = triggers.length + 1;
    setup.targets.push({ ...structuredClone(setup.targets[0]), id: 'other' });
    for (const [index, trigger] of triggers.entries()) {
      const { actor = entity, time = 0, target = 'enemy', skill, hit: triggerHit, ...fields } = trigger;
      const triggerEvent = { id: 'trigger-' + index, actorId: actor, timeMs: time, order: index, sourceEventIds: [],
        targetIds: fields.kind === 'action' ? [] : [target], facts: {}, ...fields };
      if (triggerHit) {
        const [source, damage] = hitFor(characters.get(actor), triggerHit);
        if (!damage) return;
        Object.assign(triggerEvent, { skillId: source.id, hitId: damage.id, category: damage.category });
      }
      if (skill) Object.assign(triggerEvent, { skillId: actor + '.' + skill, category: skill });
      setup.events.unshift(triggerEvent);
    }
    const families = Object.keys(hit.damage ?? {});
    const { element, missing } = resolveHitElement(hit, frame.facts[hit.elementBy]?.value,
      [entity, ...party].map(id => characters.get(id).identity.element));
    if (missing) return;
    Object.assign(frame, { ownerId: recipient, recipientId: recipient, contributorId: null, hit: {
      skillId: talent.id, hitId: hit.id, category: hit.category, element, origin: hit.origin,
      family: families.length === 1 ? families[0] : 'ordinary', reactionId: null,
    } });
    const context = engine.createStructuredCombatContext(built, setup);
    const actor = context.actors.find(row => row.id === entity);
    const matched = actor.effects.filter(effect => effect.id === rule);
    for (const member of context.actors) member.effects = [];
    const binding = { ...(target.startsWith('target.') ? { kind: 'enemy' } : { kind: 'attribute', actor: { role: 'recipient' } }),
      key: { namespace: 'builtin', id: target, revision: '1' }, at: { kind: 'current', phase: 'same' } };
    const current = () => {
      const reading = engine.evaluateCombatBindings(built.program, context, { value: binding }, frame).outputs.value;
      return reading?.state === 'known' && reading.value.kind === 'quantity' && reading.value.unit === 'scalar' ? reading.value.value : NaN;
    };
    const neutral = current();
    actor.effects = matched;
    return { actual: current() - neutral, matched: matched.length, hit: hit.id, element: frame.hit.element };
  }

  function check(entity, slot, grant, index, target, role, refs, probes) {
    const character = characters.get(entity);
    if (!character) return;
    const { group, index: position } = slotFor(slot);
    const piece = character.metadata[group][position];
    const id = entity + '.' + grant;
    const buff = piece?.buffs?.find(row => row.id === id);
    const modifier = buff?.modifiers[index];
    if (modifier?.target !== target || (modifier.recipient ?? buff.recipient ?? 'owner') !== role) return;
    const field = '/' + group + '/' + position + '/buffs/' + piece.buffs.indexOf(buff) + '/modifiers/' + index;
    const key = entity + field;
    const choice = choices.get(key);
    if (!choice?.listed || choice.issue || choice.id !== id || choice.target !== target || choice.role !== role || existing.has(key)) return;
    const rule = index ? id + '.' + index : id;
    const unlock = { ascension: piece.unlockAscension ?? 0, constellation: group === 'constellations' ? position + 1 : 0 };
    const active = probes.find(probe => probe.expected !== 0);
    if (!active || !probes.some(probe => probe.expected === 0)) return;
    const lock = group === 'constellations' ? { constellation: unlock.constellation - 1 }
      : unlock.ascension ? { ascension: unlock.ascension - 1, ranks: {} } : null;
    const cases = [];
    const checks = [...probes, ...(lock ? [exclude({ ...active.settings, ...lock })] : [])];
    for (const probe of checks) {
      const settings = { supplier: entity, recipient: entity, ...unlock, ...probe.settings };
      const reading = measure(entity, rule, target, buff.windowFact, settings);
      if (!reading || !close(reading.actual, probe.expected) || probe.expected !== 0 && reading.matched !== 1) return;
      cases.push({ actual: reading.actual, expected: probe.expected,
        settings: { ...settings, hit: reading.hit, element: reading.element } });
    }
    const reading = cases.find(probe => probe.expected !== 0);
    output.push({ key, entity, field, id, modifier: index, target, audit: 'characterResistanceBonusProofs',
      expected: reading.expected, actual: reading.actual, refs, scope: role === 'target'
        ? '同一敌人抗性绑定、触发生效或明确状态，以及排除分支的对照。'
        : '角色实际命中或属性所用的元素伤害加成、受益者及排除分支的对照。', cases });
  }

  function fromText(entity, slot, grant, targets, role, phrase, probes, refs = []) {
    if (!characters.has(entity)) return;
    const source = sourceFor(entity, slot);
    const values = phrase.exec(source.text)?.slice(1).map(Number);
    if (!values?.length || !values.every(Number.isFinite)) return;
    const entries = typeof targets === 'string' ? [[targets, 0]] : targets;
    for (const [target, index] of entries) {
      const cases = probes(values, target, index);
      check(entity, slot, grant, index, target, role, [source.ref, ...refs], cases);
    }
  }

  function fromTable(entity, slot, grant, index, target, role, tableSlot, label, probes, comparisonLabels = []) {
    if (!characters.has(entity)) return;
    const { values, refs } = parameter(entity, tableSlot, label);
    if (!values.length) return;
    const comparisons = comparisonLabels.map(label => parameter(entity, tableSlot, label));
    const sources = [sourceFor(entity, slot).ref, ...refs, ...comparisons.flatMap(row => row.refs)];
    check(entity, slot, grant, index, target, role, [...new Set(sources)], probes(values, ...comparisons.map(row => row.values)));
  }

  const indexed = (elements, key) => elements.map((element, index) => [key(element), index]);
  const peer = team('kaeya');
  const pyroElectro = indexed(['pyro', 'electro'], bonus);
  const pyroHydro = indexed(['pyro', 'hydro'], bonus);
  const targetFlags = (values, key, amount, settings = {}) => toggle(key, amount, { ...settings, values });

  for (const [entity, slot, grant, element, role, key, phrase, settings = {}] of [
    ['chiori', 'a1', 'a1.construct-geo', 'geo', 'owner', 'chiori.geoConstructMade', /千织获得(\d+)%岩元素伤害加成/],
    ['diluc', 'a1', 'a1.dawn-pyro', 'pyro', 'owner', 'diluc.dawnInfusion', /迪卢克获得(\d+)%火元素伤害加成/],
    ['ganyu', 'a1', 'a1.celestial-shower-cryo', 'cryo', 'team', 'ganyu.celestialShowerArea', /当前场上角色获得(\d+)%冰元素伤害加成/, peer],
    ['kamisatoayaka', 'a1', 'a1.senho-cryo', 'cryo', 'owner', 'kamisatoayaka.senhoContact', /获得(\d+)%冰元素伤害加成/],
    ['lynette', 'c6', 'c6.enigma-anemo', 'anemo', 'owner', 'lynette.enigmaInfusion', /风元素伤害加成提升(\d+)%/],
    ['ningguang', 'a1', 'a1.strategic-reserve', 'geo', 'team', 'ningguang.jadeScreenCrossed', /穿过璇玑屏的角色会获得(\d+)%岩元素伤害加成/, team('noelle')],
    ['sigewinne', 'a0', 'a0.rest-hydro', 'hydro', 'owner', 'sigewinne.restWindow', /希格雯获得(\d+)%水元素伤害加成/],
    ['tighnari', 'c2', 'c2.in-field-dendro', 'dendro', 'owner', 'tighnari.vijnanaFieldEnemy', /提纳里获得(\d+)%草元素伤害加成/],
    ['xiangling', 'c6', 'c6.pyronado-team-pyro', 'pyro', 'team', 'xiangling.pyronadoActive', /队伍中所有角色获得(\d+)%火元素伤害加成/, team('klee')],
    ['yaoyao', 'c1', 'c1.jade-radish-dendro', 'dendro', 'team', 'yaoyao.radishBurstArea', /当前场上角色获得(\d+)%草元素伤害加成/, team('collei')],
  ]) fromText(entity, slot, grant, bonus(element), role, phrase, ([amount]) => [
    ...toggle(key, amount / 100, settings),
    ...['ganyu', 'yaoyao'].includes(entity) ? [exclude({ ...settings, ...flags({ [key]: true }), onField: false })] : [],
    ...role === 'owner' ? [exclude({ ...peer, ...flags({ [key]: true }) })] : [],
  ]);

  for (const [entity, slot, grant, elements, key, phrase] of [
    ['jean', 'c4', 'c4.dandelion-anemo-shred', ['anemo'], 'jean.c4EnemyInsideDandelion', /风元素抗性下降(\d+)%/],
    ['linnea', 'a0', 'a0.lumi-geo-shred', ['geo'], 'linnea.lumiNearTarget', /附近敌人的岩元素抗性会降低(\d+)%/],
    ['mitya', 'c2', 'c2.polar-field-shred', ['cryo', 'electro'], 'mitya.polarFieldEnemy', /冰元素抗性与雷元素抗性降低(\d+)%/],
    ['venti', 'c2', 'c2.airborne-shred', ['anemo', 'physical'], 'venti.skywardEnemyAirborne', /落地前，风元素抗性与物理抗性额外降低(\d+)%/],
  ]) fromText(entity, slot, grant, indexed(elements, resistance), 'target', phrase, ([amount]) => toggle(key, -amount / 100, peer));

  fromText('linnea', 'a0', 'a0.lumi-full-moonsign-shred', resistance('geo'), 'target',
    /附近敌人的岩元素抗性还会进一步降低(\d+)%/, ([amount]) => [
      ...targetFlags({ 'linnea.lumiNearTarget': true }, 'fullMoonsign', -amount / 100, peer),
      exclude({ ...peer, ...flags({ fullMoonsign: true, 'linnea.lumiNearTarget': false }) }),
    ]);

  for (const element of ['pyro', 'dendro', 'electro', 'anemo', 'geo']) {
    const key = 'durin.whiteDragonShred-' + element;
    fromText('durin', 'a0', 'a0.white-dragon-shred-' + element, resistance(element), 'target',
      /火元素抗性与参与反应的对应元素抗性降低(\d+)%/, ([amount]) => [
        ...targetFlags({ 'durin.whiteDragonActive': true }, key, -amount / 100, peer),
        exclude({ ...peer, ...flags({ [key]: true, 'durin.whiteDragonActive': false }) }),
      ]);
  }
  for (const element of elemental) {
    fromText('durin', 'c2', 'c2.reactive-' + element, bonus(element), 'team',
      /火元素伤害与参与反应的对应元素伤害提升(\d+)%/, ([amount]) =>
        toggle('durin.reactiveWindow-' + element, amount / 100, team(peers[element])));
  }
  for (const [entity, grant, key, absorbedKey, first, converted] of [
    ...['aether-anemo', 'lumine-anemo'].map(id => [id, 'c6.gust-surge-shred-', id + '.c6GustSurgeShred', id + '.c6GustSurgeAbsorbed',
      /风元素抗性下降(\d+)%/, /对应元素抗性也下降(\d+)%/]),
    ['venti', 'c6.stormeye-shred-', 'venti.stormeyeShredWindow', 'venti.stormeyeAbsorbed',
      /风元素抗性降低(\d+)%/, /转换的元素抗性也降低(\d+)%/],
  ]) {
    fromText(entity, 'c6', entity === 'venti' ? 'c6.stormeye-anemo-shred' : grant + 'anemo', resistance('anemo'), 'target', first,
      ([amount]) => toggle(key, -amount / 100, { ...team('sucrose'), ...flags({ [absorbedKey]: 'none' }) }));
    for (const element of absorbed) {
      const receiver = team(peers[element]);
      fromText(entity, 'c6', grant + element, resistance(element), 'target', converted, ([amount]) => [
        ...targetFlags({ [absorbedKey]: element }, key, -amount / 100, receiver),
        ...['none', ...absorbed.filter(value => value !== element)].map(value => exclude({
          ...receiver, ...flags({ [key]: true, [absorbedKey]: value }),
        })),
      ]);
    }
  }

  for (const element of absorbed) {
    const receiver = team(peers[element]);
    const key = 'sucrose.spiritAbsorbedElement';
    fromText('sucrose', 'c6', 'c6.spirit-bonus-' + element, bonus(element), 'team', /获得(\d+)%的对应元素伤害加成/,
      ([amount]) => [test(amount / 100, { ...receiver, ...flags({ [key]: element }) }),
        ...['none', ...absorbed.filter(value => value !== element)].map(value => exclude({ ...receiver, ...flags({ [key]: value }) }))]);
  }

  for (const [grant, elements, radiance] of [
    ['c2.mirror-shred-electro', ['electro', 'cryo'], 'stellar-conduct'],
    ['c2.mirror-shred-anemo', ['anemo', 'cryo'], 'stellar-swirl'],
  ]) fromText('odette', 'c2', grant, indexed(elements, resistance), 'target',
    /对应元素抗性还会降低(\d+)%[^。]*辉映·星超导：冰元素、雷元素[^。]*辉映·星扩散：冰元素、风元素/, ([amount]) => [
      ...targetFlags({ radiance }, 'odette.mirrorNearTarget', -amount / 100, peer),
      ...['none', radiance === 'stellar-swirl' ? 'stellar-conduct' : 'stellar-swirl'].map(value =>
        exclude({ ...peer, ...flags({ radiance: value, 'odette.mirrorNearTarget': true }) })),
    ]);

  for (const [index, element, key, other] of [[0, 'hydro', 'Hydro', 'Dendro'], [1, 'dendro', 'Dendro', 'Hydro']]) {
    const settings = { ascension: 1, ...team('collei') };
    const field = 'nilou.starry' + key + 'Shred';
    const otherField = 'nilou.starry' + other + 'Shred';
    fromText('nilou', 'c2', 'c2.starry-shred', [[resistance(element), index]], 'target', element === 'hydro'
      ? /水元素抗性降低(\d+)%/ : /草元素抗性降低(\d+)%/, ([amount]) => [
      ...targetFlags({ [otherField]: true }, field, -amount / 100, settings),
      exclude({ ...settings, ...flags({ [field]: true }), ascension: 0 }),
      exclude({ ...settings, ...flags({ [field]: true }), party: ['collei', 'amber'] }),
      exclude({ ascension: 1, ...team('barbara'), ...flags({ [field]: true }) }),
    ]);
  }

  for (const [index, key] of ['normal', 'charged', 'skill', 'burst'].entries()) {
    const other = key === 'normal' ? 'charged' : 'normal';
    fromText('keqing', 'c6', 'c6.tenacious-star', [[bonus('electro'), index]], 'owner', /刻晴获得(\d+)%雷元素伤害加成/,
      ([amount]) => [...targetFlags({ ['keqing.tenacious-' + other]: true }, 'keqing.tenacious-' + key, amount / 100),
        exclude({ ...peer, ...flags({ ['keqing.tenacious-' + key]: true }) })]);
  }

  fromText('chevreuse', 'c6', 'c6.healing-element-bonus', pyroElectro, 'team',
    /获得(\d+)%火元素伤害加成与雷元素伤害加成[^。]*至多叠加(\d+)层/, ([amount, cap], target) => {
      const receiver = target === bonus('pyro') ? team('amber') : team('lisa');
      return [1, cap, 0].map(stacks => test(stacks * amount / 100, {
        ...receiver, ...flags({ 'chevreuse.healingStacks': stacks }),
      }));
    });
  fromText('citlali', 'c6', 'c6.mystery-team', pyroHydro, 'team',
    /秘律之数」上限为(\d+)点[^。]*每1点「秘律之数」会使附近的队伍中所有角色获得([\d.]+)%火元素与水元素伤害加成/,
    ([cap, amount], target) => [1, 14, cap, 0].map(count => test(count * amount / 100,
      { ...team(target === bonus('pyro') ? 'amber' : 'barbara'), ...flags({ 'citlali.mysteryCount': count }) })));
  fromText('yanfei', 'a0', 'a0.edict-scarlet-seals', bonus('pyro'), 'owner', /每枚丹火印会提升烟绯(\d+)%的火元素伤害加成/,
    ([amount]) => [1, 3, 4, 0].map(stacks => test(stacks * amount / 100, {
      constellation: stacks === 4 ? 6 : 0, ...flags({ 'yanfei.consumedSealStacks': stacks }),
    })));
  fromText('sethos', 'c2', 'c2-arcane-electro', bonus('electro'), 'owner',
    /雷元素伤害加成提升(\d+)%[^。]*至多叠加(\d+)层/, ([amount, cap]) => [
      ...[1, cap, 0].map(stacks => test(stacks * amount / 100, { hit: 'normal.param6', ...flags({ 'sethos.c2ArcaneStacks': stacks }) })),
      exclude({ hit: 'normal.param1', ...flags({ 'sethos.c2ArcaneStacks': cap }) }),
    ]);
  // KQM specifies 16% with one enemy and 32% with three, including the cast's initial 8%.
  fromText('ororon', 'c2', 'c2.supersense-electro', bonus('electro'), 'owner',
    /获得(\d+)%雷元素伤害加成；[^。]*每额外命中一名敌人[^。]*获得(\d+)%雷元素伤害加成，至多通过这种方式获得(\d+)%雷元素伤害加成/,
    ([base, perEnemy, cap]) => [
      ...[0, 1, 2, (cap - base) / perEnemy, cap / perEnemy].map(count => test(Math.min(base + perEnemy * count, cap) / 100,
        { ...flags({ 'ororon.burstElectroWindow': true, 'ororon.burstEnemies': count }) })),
      exclude(flags({ 'ororon.burstElectroWindow': false, 'ororon.burstEnemies': 1 })),
    ], ['https://keqingmains.com/q/ororon-quickguide/#Constellations']);
  fromText('neuvillette', 'a1', 'ascension-four.hydro-bonus', bonus('hydro'), 'owner',
    /生命值上限(\d+)%的部分，每1%使那维莱特获得([\d.]+)%水元素伤害加成[^。]*至多提升(\d+)%/,
    ([threshold, slope, cap]) => [60, 80, 100, threshold, threshold - 1].map(hp => test(
      Math.min(cap, Math.max(0, hp - threshold) * slope) / 100, flags({ hpRatio: hp / 100 }))));

  for (const [entity, slot, grant, elements, key, label] of [
    ['eula', 't1', 't1.grimheart-shred', ['physical', 'cryo'], 'eula.grimheartShredApplied', ['物理抗性降低', '冰元素抗性降低']],
    ['lauma', 't1', 'frostgrove-shred', ['hydro', 'dendro'], 'lauma.frostgroveShred', '元素抗性降低'],
    ['shenhe', 't2', 'spirit-shred', ['cryo', 'physical'], 'shenhe.burstField', '抗性降低'],
    ['vodyanitsa', 't1', 'horn-shred', ['hydro', 'cryo'], 'vodyanitsa.hornShred', '水元素/冰元素抗性降低'],
  ]) for (const [index, element] of elements.entries()) {
    const talent = slot === 't1' ? 'skill' : 'burst';
    fromTable(entity, slot, grant, index, resistance(element), 'target', slot, Array.isArray(label) ? label[index] : label,
      values => [1, 10].flatMap(rank => toggle(key, -values[rank - 1], { ...peer, ascension: rank === 1 ? 0 : 6, ranks: { [talent]: rank } })));
  }

  for (const [entity, slot, grant, targets, active, inactive, phrase, additional = []] of [
    ['chongyun', 'a1', 'a1.rimechaser-shred', ['cryo'], 'a1.rimechaser', 'skill.param1', /冰元素抗性降低(\d+)%，持续(\d+)秒/],
    ['ganyu', 'c1', 'c1.frostflake-shred', ['cryo'], 'normal.param9', 'normal.param8', /冰元素抗性降低(\d+)%，持续(\d+)秒/, ['normal.param10']],
    ['kinich', 'c2', 'c2.skill-shred', ['dendro'], 'skill.param2', 'burst.param1', /草元素抗性降低(\d+)%，持续(\d+)秒/, ['skill.param1']],
    ['lyney', 'c4', 'c4.charged-shred', ['pyro'], 'normal.param10', 'skill.param1', /火元素抗性降低(\d+)%，持续(\d+)秒/,
      ['normal.param11', 'normal.param15', 'normal.param16']],
    ['sigewinne', 'c2', 'c2.bubble-burst-shred', ['hydro'], 'skill.param1', 'normal.param1', /水元素抗性降低(\d+)%，持续(\d+)秒/, ['burst.param1']],
    ['venti', 'c2', 'c2.skyward-sonnet-shred', ['anemo', 'physical'], 'skill.param1', 'burst.param1',
      /风元素抗性与物理抗性降低(\d+)%，持续(\d+)秒/, ['skill.param3']],
  ]) fromText(entity, slot, grant, indexed(targets, resistance), 'target', phrase, ([amount, seconds]) => [
    ...event(-amount / 100, strike(active), seconds * 1000, strike(inactive), peer),
    ...additional.map(hit => test(-amount / 100, { ...peer, triggers: [strike(hit)] })),
    exclude({ ...peer, triggers: [strike(active, 'other')] }),
  ]);

  fromText('flins', 'c2', 'c2.thunder-shred', resistance('electro'), 'target', /雷元素抗性降低(\d+)%，持续(\d+)秒/,
    ([amount, seconds]) => {
      const active = strike('skill.param1');
      const settings = { party: ['aino'], ...flags({ fullMoonsign: true }) };
      return [
        ...event(-amount / 100, active, seconds * 1000, strike('normal.param1'), settings),
        exclude({ ...settings, triggers: [active], onField: false }),
        exclude({ ...settings, triggers: [active], ...flags({ fullMoonsign: false }) }),
        exclude({ ...settings, triggers: [strike('skill.param1', 'other')] }),
      ];
    });
  fromText('chevreuse', 'a0', 'a0.overloaded-shred', indexed(['pyro', 'electro'], resistance), 'target',
    /火元素与雷元素抗性降低(\d+)%，持续(\d+)秒/, ([amount, seconds]) => {
      const settings = team('lisa');
      const overloaded = reaction('overloaded', { actor: 'lisa' });
      return [
        ...event(-amount / 100, overloaded, seconds * 1000, reaction('electro-charged', { actor: 'lisa' }), settings),
        exclude({ ...settings, party: ['lisa', 'kaeya'], triggers: [overloaded] }),
        exclude({ ...team('amber'), triggers: [reaction('overloaded', { actor: 'amber' })] }),
        exclude({ ...settings, triggers: [{ ...overloaded, target: 'other' }] }),
      ];
    });
  for (const [slot, grant, phrase, ascension] of [
    ['a0', 'a0.reaction-shred', /火元素与水元素抗性还会降低(\d+)%，持续(\d+)秒/, 1],
    ['c2', 'c2.reaction-extra-shred', /火元素与水元素抗性还会额外降低(\d+)%，持续(\d+)秒/, 1],
  ]) fromText('citlali', slot, grant, indexed(['pyro', 'hydro'], resistance), 'target', phrase, ([amount, seconds]) => {
    const settings = { ascension, ...team('barbara', 'amber'), ...flags({ 'citlali.itzpapaPresent': true }) };
    const freeze = reaction('freeze', { actor: 'barbara' });
    return [
      ...event(-amount / 100, freeze, seconds * 1000, reaction('vaporize', { actor: 'barbara' }), settings),
      test(-amount / 100, { ...settings, triggers: [reaction('melt', { actor: 'amber' })] }),
      exclude({ ...settings, triggers: [{ ...freeze, target: 'other' }] }),
      exclude({ ...settings, triggers: [freeze], ...flags({ 'citlali.itzpapaPresent': false }) }),
      exclude({ ...settings, triggers: [freeze], ascension: 0 }),
    ];
  });

  for (const [entity, grant, targets, first, phrase] of [
    ['kirara', 'c6.courier-elemental', elemental, 'skill', /施放元素战技或元素爆发后的(\d+)秒内[^。]*获得(\d+)%所有元素伤害加成/],
    ['klee', 'c6.blazing-delight', ['pyro'], 'burst', /施放轰轰火花后的(\d+)秒内[^。]*获得(\d+)%火元素伤害加成/],
  ]) fromText(entity, 'c6', grant, indexed(targets, bonus), 'team', phrase, ([seconds, amount], target) => {
    const element = target.slice('attribute.'.length, -'Bonus'.length);
    const settings = team(peers[element]);
    return [
      ...event(amount / 100, cast(first), seconds * 1000, cast('normal'), settings),
      ...entity === 'kirara' ? [test(amount / 100, { ...settings, triggers: [cast('burst')] })] : [exclude({ ...settings, triggers: [cast('skill')] })],
      test(amount / 100, { triggers: [cast(first)] }),
    ];
  });

  fromText('kachina', 'a0', 'a0.nightsoul-burst-geo', bonus('geo'), 'owner',
    /岩元素伤害加成提升(\d+)%，持续(\d+)秒/, ([amount, seconds]) => {
      const trigger = { kind: 'state-change', actor: 'mualani', facts: { nightsoulBurst: bool(true) } };
      return [
        ...event(amount / 100, trigger, seconds * 1000, { ...trigger, facts: { nightsoulBurst: bool(false) } }, { party: ['mualani'] }),
        exclude({ ...team('mualani'), triggers: [trigger] }),
      ];
    });
  fromText('cyno', 'c2', 'c2.normal-hit-electro', bonus('electro'), 'owner',
    /雷元素伤害加成提升(\d+)%，持续(\d+)秒[^。]*。该效果每([\d.]+)秒至多触发一次，至多叠加(\d+)层/,
    ([amount, seconds, cooldown, cap]) => {
      const trigger = strike('normal.param1');
      const interval = cooldown * 1000;
      const sixHits = Array.from({ length: cap + 1 }, (_, index) => ({ ...trigger, time: index * interval }));
      return [
        ...event(amount / 100, trigger, seconds * 1000, strike('normal.param6')),
        test(amount / 100, { triggers: [trigger, { ...trigger, time: interval - 1 }] }),
        test(2 * amount / 100, { triggers: sixHits.slice(0, 2) }),
        test(cap * amount / 100, { triggers: sixHits }),
        exclude({ ...peer, triggers: [trigger] }),
      ];
    });

  for (const [slot, grant, skill] of [['t1', 'banner-domain', 'skill'], ['t2', 'burst-domain', 'burst']]) {
    fromTable('gorou', slot, grant, 1, bonus('geo'), 'team', 't1', '岩元素伤害加成', ([amount]) => {
      const active = { ...team('noelle', 'albedo'), hit: 'burst.param1', triggers: [cast(skill)] };
      return [
        test(amount, active), exclude({ ...active, party: ['noelle', 'kaeya'] }),
        exclude({ ...active, onField: false }), exclude({ ...active, triggers: [cast('normal')] }), exclude({ ...active, hit: 'normal.param1' }),
        ...skill === 'skill' ? [exclude({ ...active, ...flags({ 'gorou.burstDomain': true }) })] : [],
      ];
    });
  }

  fromTable('faruzan', 't2', 'wind-prayer', 0, bonus('anemo'), 'team', 't2', '风元素伤害加成', (values, [duration]) => {
    const anemo = { ...team('sucrose'), hit: 'skill.param1' };
    return [
      ...event(values[0], cast('burst'), duration * 1000, cast('skill'), anemo),
      ...toggle('faruzan.prayer', values[9], { ...anemo, ascension: 6, ranks: { burst: 10 } }),
      exclude({ ...peer, triggers: [cast('burst')] }),
    ];
  }, ['祈风之赐持续时间']);
  fromTable('faruzan', 't2', 'wind-bane', 0, resistance('anemo'), 'target', 't2', '风元素抗性降低',
    ([amount]) => toggle('faruzan.windBane', -amount, peer));
  fromTable('faruzan', 'a0', 'collapse-bane', 0, resistance('anemo'), 'target', 't2', '风元素抗性降低',
    ([amount]) => toggle('faruzan.collapseBane', -amount, peer));

  fromText('charlotte', 'a1', 'non-fontaine-cryo', bonus('cryo'), 'owner',
    /每存在1\/2\/3位非枫丹的角色[^；]*?获得(\d+)%\/(\d+)%\/(\d+)%冰元素伤害加成/, amounts =>
      [['kaeya'], ['kaeya', 'amber'], ['kaeya', 'amber', 'collei'], ['lyney', 'lynette']].map((party, index) =>
        test((amounts[index] ?? 0) / 100, { party, hit: 'normal.param9' })).concat(
        exclude({ party: ['lyney', 'kaeya'], hit: 'normal.param9', ascension: 3 }),
        exclude(peer),
      ), [catalog + 'characters.json']);

  const kqm = 'https://github.com/KQM-git/TCL/blob/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/docs/characters/pyro/bennett.md#L220-L223';
  fromText('bennett', 'c6', 'c6.inspiration-pyro', bonus('pyro'), 'team', /获得(\d+)%火元素伤害加成/,
    ([amount]) => [
      ...['kaeya', 'klee', 'amber'].map(recipient => test(amount / 100, { ...team(recipient), triggers: [cast('burst')], ...flags({ 'bennett.inField': true }) })),
      exclude({ ...team('klee'), triggers: [cast('burst')], ...flags({ 'bennett.inField': false }) }),
      exclude({ ...team('klee'), triggers: [cast('burst')], ...flags({ 'bennett.inField': true }), onField: false }),
      exclude({ ...team('klee'), ...flags({ 'bennett.inField': true }) }),
    ], [kqm]);

  for (const element of absorbed) {
    const entity = 'kaedeharakazuha', weapon = 'ironsting', ascension = 4;
    const mastery = sourceStat(entity, weapon, ascension, 70, 'elementalMastery');
    const settings = { ...team(peers[element]), weapon, ascension };
    fromText(entity, 'a1', 'a1.poetics-' + element, bonus(element), 'team', /提供([\d.]+)%对应元素伤害加成，持续(\d+)秒/,
      ([amount, seconds]) => {
        const value = mastery * amount / 100;
        const swirl = reaction('swirl', { reactionElement: element });
        const wrong = reaction('swirl', { reactionElement: element === 'pyro' ? 'hydro' : 'pyro' });
        return [
          ...event(value, swirl, seconds * 1000, wrong, settings),
          test(value, { ...settings, triggers: [reaction('stellar-swirl', { reactionElement: element })] }),
          exclude({ ...settings, party: [peers[element], 'sucrose'], triggers: [{ ...swirl, actor: 'sucrose' }] }),
        ];
      }, statRefs(entity, weapon));
  }
  const mizuki = 'yumemizukimizuki', catalyst = 'sacrificialfragments';
  fromText(mizuki, 'c2', 'c2-element-bonuses', indexed(absorbed, bonus), 'team',
    /提供([\d.]+)%火元素、水元素、冰元素与雷元素伤害加成/, ([amount], target) => {
      const element = target.slice('attribute.'.length, -'Bonus'.length);
      const value = sourceStat(mizuki, catalyst, 0, 1, 'elementalMastery') * amount / 100;
      const hit = { pyro: 'normal.param7', cryo: 'skill.param1' }[element];
      return [
        ...toggle(mizuki + '.dreamdrifter', value, { ...team(peers[element]), ...(hit ? { hit } : {}), weapon: catalyst }),
        exclude({ weapon: catalyst, ...flags({ [mizuki + '.dreamdrifter']: true }) }),
      ];
    }, statRefs(mizuki, catalyst));

  const raiden = 'raidenshogun';
  fromText(raiden, 'a1', 'a1.enlightened-electro', bonus('electro'), 'owner',
    /元素充能效率超过(\d+)%[^。]*雷元素伤害加成提升([\d.]+)%/, ([threshold, amount]) => [
      ...['thecatch', 'beginnersprotector'].map(weapon => test(
        Math.max(sourceStat(raiden, weapon, 4, 70, 'energyRecharge') - threshold / 100, 0) * amount, { weapon })),
      exclude({ ...peer, weapon: 'thecatch' }),
    ], [...new Set([...statRefs(raiden, 'thecatch'), ...statRefs(raiden, 'beginnersprotector')])]);

  const expedition = ['pyro', 'hydro', 'electro', 'cryo'];
  const attack = sourceStat('varka', 'wastergreatsword', 1, 40, 'attack');
  for (const element of ['anemo', ...expedition]) {
    fromText('varka', 'a0', 'expedition-' + element, bonus(element), 'owner',
      /每(\d+)点攻击力[^。]*获得(\d+)%风元素伤害加成与对应元素伤害加成[^。]*至多通过这种方式获得(\d+)%/,
      ([basis, amount, cap]) => {
        const settings = { hit: element === 'anemo' ? 'burst.param2' : 'burst.param1' };
        const parties = element === 'anemo' ? expedition.map(type => [peers[type]]) : [[peers[element]]];
        const value = Math.min(attack / basis * amount, cap) / 100;
        return [
          ...parties.map(party => test(value, { ...settings, party })),
          exclude({ ...settings, party: ['collei'] }),
          ...expedition.slice(0, expedition.indexOf(element)).filter(() => element !== 'anemo')
            .map(type => exclude({ ...settings, party: [peers[element], peers[type]] })),
          exclude(team(peers[element])),
        ];
      }, statRefs('varka', 'wastergreatsword'));
  }

  fromText('escoffier', 'a1', 'a1.pairing-shred', indexed(['cryo', 'hydro'], resistance), 'target',
    /水元素抗性与冰元素抗性降低(\d+)%\/(\d+)%\/(\d+)%\/(\d+)%，持续(\d+)秒/,
    ([one, two, three, four, seconds]) => {
      const trigger = strike('skill.param1');
      const full = team('barbara', 'kaeya', 'mona');
      return [
        ...event(-four / 100, trigger, seconds * 1000, strike('normal.param1'), full),
        test(-one / 100, { triggers: [trigger] }),
        test(-two / 100, { ...team('barbara'), triggers: [strike('burst.param1')] }),
        test(-three / 100, { ...team('barbara', 'kaeya', 'amber'), triggers: [trigger] }),
        exclude({ ...full, triggers: [strike('skill.param1', 'other')] }),
      ];
    });
  return output;
}
