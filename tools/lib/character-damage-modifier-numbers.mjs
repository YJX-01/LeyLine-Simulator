import { combatFactDeclaration } from '../../src/schema/src/calculation/buffs.mjs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const catalog = 'tools/data/sources/catalog/genshin-db/';
const table = capture + 'stats/talents.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const rates = read(table);
const growth = read(catalog + 'characters.json');
const weapons = read(catalog + 'weapons.json');
const curves = read(catalog + 'character-curves.json');
const weaponCurves = read(catalog + 'weapon-curves.json');
const sourcePaths = new Map();
const scalar = amount => amount / 100;
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-9);
const attribute = name => 'attribute.' + name;
const peer = (recipient, hit, ...other) => ({ recipient, hit, party: [recipient, ...other] });
const set = (key, value = true) => ({ [key]: value });
const action = (skill, timeMs = 0) => ({ kind: 'action', skill, timeMs });
const positive = (expected, hit, settings = {}) => ({ expected, settings: { ...settings, hit } });
const negative = (hit, settings) => ({ ...positive(0, hit, settings), excluded: true });
const plain = (value, hits, excluded, settings = {}) => [
  ...[].concat(hits).map(hit => positive(value, hit, settings)), negative(excluded, settings),
];
const toggle = (value, hits, excluded, key, settings = {}) => [
  ...plain(value, hits, excluded, { ...settings, values: { ...settings.values, [key]: true } }),
  negative([].concat(hits)[0], { ...settings, values: { ...settings.values, [key]: false } }),
];

function source(entity, slot) {
  const constellations = slot[0] === 'c';
  const key = constellations ? slot : (slot[0] === 'a' ? 'passive' : 'combat') + (Number(slot.slice(1)) + 1);
  const origin = entity.replace(/^(?:aether|lumine)-/, 'traveler');
  const path = capture + 'ChineseSimplified/' + (constellations ? 'constellations/' : 'talents/') + origin + '.json';
  if (!sourcePaths.has(path)) sourcePaths.set(path, read(path));
  const record = sourcePaths.get(path)[key];
  return { text: record?.description.replaceAll('**', ''), key, origin, labels: record?.attributes?.labels, ref: path + '#' + key };
}

function progression(entity, stat, { ascension = 0, level, weapon, weaponLevel = 1, weaponAscension = 0 } = {}) {
  const source = growth[entity] ?? growth[entity.split('-')[0]];
  const character = source.stats;
  level ??= ascension ? [20, 40, 50, 60, 70, 80, 90][ascension] : 1;
  const item = weapons[weapon ?? novice[source.metadata.weaponType]].stats;
  if (stat === 'elementalMastery' || stat === 'energyRecharge') {
    const property = stat === 'elementalMastery' ? 'FIGHT_PROP_ELEMENT_MASTERY' : 'FIGHT_PROP_CHARGE_EFFICIENCY';
    return Number(stat === 'energyRecharge')
      + (character.specialized === property ? character.promotion[ascension].specialized : 0)
      + (item.specialized === property ? item.base.specialized * weaponCurves[weaponLevel][item.curve.specialized] : 0);
  }
  const basis = stat === 'whiteAttack' ? 'attack' : stat;
  const base = character.base[basis] * curves[level][character.curve[basis]] + character.promotion[ascension][basis];
  const attack = item.base.attack * weaponCurves[weaponLevel][item.curve.attack] + item.promotion[weaponAscension].attack;
  if (stat === 'whiteAttack') return base + attack;
  const property = 'FIGHT_PROP_' + basis.toUpperCase() + '_PERCENT';
  const percentage = (character.specialized === property ? character.promotion[ascension].specialized : 0)
    + (item.specialized === property ? item.base.specialized * weaponCurves[weaponLevel][item.curve.specialized] : 0);
  return (base + (basis === 'attack' ? attack : 0)) * (1 + percentage);
}

function overrides(frame, kind, id) {
  let row = frame.factOverrides.find(entry => entry.subject.kind === kind && entry.subject.id === id);
  if (!row) {
    row = { subject: { kind, ...(id ? { id } : {}) }, facts: {} };
    frame.factOverrides.push(row);
  }
  return row.facts;
}

function inputs(supplier, frame, recipient, values) {
  for (const [key, value] of Object.entries(values)) {
    const declaration = combatFactDeclaration(supplier.metadata.facts, key);
    if (!declaration) return key;
    const typed = typeof value === 'boolean' ? bool(value) : typeof value === 'number' ? number(declaration.type.unit, value)
      : fact({ kind: 'enum', value });
    const scope = declaration.scope;
    const facts = scope === 'query' ? frame.facts : overrides(frame, ['team', 'target'].includes(scope) ? scope : 'actor',
      scope === 'target' ? 'enemy' : scope === 'team' ? undefined : scope === 'recipient' ? recipient : supplier.id);
    facts[key] = typed;
  }
}

export function effectReading(reading, identity, target, supplier, recipient) {
  const [output] = reading.outputs;
  if (!output) return { issue: reading.diagnostics.map(row => row.message).join('；') };
  if (output.value.state !== 'known') return { issue: reading.diagnostics.map(row => row.message).join('；') };
  const rootDependencies = new Set([output.value.traceId]);
  const relevant = new Set();
  const instances = new Map();
  for (const node of reading.trace.toReversed()) {
    if (rootDependencies.has(node.id)) {
      for (const dependency of node.dependencies) rootDependencies.add(dependency);
      if (node.kind === 'attribute' && node.definition.id === target && node.context?.actorId === recipient) {
        for (const dependency of node.dependencies) relevant.add(dependency);
      }
    }
    if (!relevant.has(node.id)) continue;
    for (const dependency of node.dependencies) relevant.add(dependency);
    if (node.kind !== 'effect' || node.definition.id !== identity.id || node.definition.namespace !== identity.namespace
      || node.definition.revision !== identity.revision || node.context?.actorId !== supplier
      || node.context.recipientId !== recipient) continue;
    if (node.state !== 'known' || node.value?.kind !== 'quantity' || !node.context.effectInstanceId) return { issue: node.nodeId };
    instances.set(node.context.effectInstanceId, node.value.value);
  }
  if (instances.size > 1) return { issue: '同一命中有多个来源实例，未独立区分。' };
  return { actual: instances.values().next().value ?? 0, usingTarget: relevant.size > 0, instances: instances.size };
}

/** Certify the exact retained contributor in a fully evaluated, catalog-backed hit. */
export function characterDamageModifierNumbers(entities, results, engine) {
  const characters = new Map(entities.characters.map(row => [row.id, row]));
  const equipment = new Map(entities.weapons.map(row => [row.id, row]));
  const occupied = new Set(results.registeredModifierEvidence?.map(row => row.key));
  const choices = new Map(), prepared = new Map(), output = [];
  for (const row of results.calculator.buffs) {
    const key = row.entity + row.field;
    choices.set(key, choices.has(key) ? null : row);
  }

  function teamFor(supplier, settings) {
    const { party = [], ascension, constellation, ranks, weapon, weaponLevel, weaponAscension } = settings;
    const key = JSON.stringify([supplier, party, ascension, constellation, ranks, weapon, weaponLevel, weaponAscension]);
    if (!prepared.has(key)) {
      const actors = [supplier, ...party].map((id, index) => {
        const entity = characters.get(id);
        const item = entity && equipment.get(index === 0 && weapon || novice[entity.identity.weaponType]);
        if (!item) return;
        const build = auditBuild(entity, item);
        if (index === 0) {
          Object.assign(build, { ascension, constellation, level: ascension ? entity.progression.promotion[ascension].maxLevel : 1 });
          if (weaponLevel) Object.assign(build, { weaponLevel, weaponAscension: weaponAscension ?? 0 });
          Object.assign(build.talents, ranks);
        }
        return { id, build };
      });
      const result = actors.every(Boolean) && engine.prepareStructuredBuilds(actors);
      prepared.set(key, result?.ok ? result.team : null);
    }
    return prepared.get(key);
  }

  function measure(entity, definition, buff, settings) {
    const { hit: suffix, recipient = entity, party = [], values = {}, actions = [], timeMs = 1, onField = true,
      supplierOnField = recipient === entity && onField, supplemental = {}, application } = settings;
    const team = teamFor(entity, settings);
    if (!team || ![entity, ...party].includes(recipient)) return { issue: '配装或实际受益者无效' };
    const owner = characters.get(entity), dealer = characters.get(recipient);
    const hitId = recipient + '.' + suffix;
    const talent = dealer.talents.find(row => row.hits.some(hit => hit.id === hitId));
    const hit = talent?.hits.find(row => row.id === hitId);
    if (!hit) return { issue: '缺少真实命中 ' + hitId };
    const { setup, request } = auditHit(dealer, talent, hit);
    const { frame } = request;
    const ownerFacts = frame.factOverrides[0].facts;
    overrides(frame, 'target', 'enemy').targetHpRatio = number('scalar', 1);
    if (recipient !== entity) frame.factOverrides.unshift({ subject: { kind: 'actor', id: 'actor' }, facts: {} });
    setAuditDefaults(owner, frame);
    const ownerWeapon = equipment.get(settings.weapon ?? novice[owner.identity.weaponType]);
    if (ownerWeapon) setAuditDefaults(ownerWeapon, frame);
    if (buff.windowFact) delete frame.factOverrides[0].facts[buff.windowFact];
    if (recipient !== entity) frame.factOverrides[1].subject = { kind: 'actor', id: recipient };
    frame.factOverrides[0].subject = { kind: 'actor', id: entity };
    frame.factOverrides[0].facts.onField = bool(supplierOnField);
    ownerFacts.onField = bool(onField);
    const missing = inputs(owner, frame, recipient, values);
    if (missing) return { issue: '缺少角色条件 ' + missing };
    for (const event of setup.events) {
      event.actorId = recipient;
      for (const entry of event.subjectFacts ?? []) if (entry.subject.kind === 'actor') entry.subject = { kind: 'actor', id: recipient };
    }
    const query = setup.events.find(row => row.id === frame.eventId);
    Object.assign(query, { timeMs, order: actions.length + 1 });
    for (const [index, { skill, ...event }] of actions.entries()) {
      setup.events.unshift({ id: 'action-' + index, actorId: entity, order: index, targetIds: [], sourceEventIds: [], facts: {},
        ...(skill ? { skillId: entity + '.' + skill, category: skill } : {}), ...event });
    }
    if (application !== undefined) frame.applications.push({
      instanceId: engine.calculationEffectInstanceId(entity, definition.buff ?? definition.identity, 'action-0'),
      active: application,
    });
    request.actorId = recipient;
    const context = engine.createStructuredCombatContext(team, setup);
    const actor = context.actors.find(row => row.id === entity);
    for (const [key, value] of Object.entries(supplemental)) {
      const unit = actor.inputs[key]?.value?.unit;
      if (!unit) return { issue: '缺少基础属性输入 ' + key };
      actor.inputs[key] = number(unit, value);
    }
    const reading = engine.evaluateStructuredHit(team, setup, request, { context });
    return effectReading(reading, definition.identity, definition.target.attribute.id, entity, recipient);
  }

  function check(entity, slot, grant, target, refs, probes, options = {}) {
    const character = characters.get(entity);
    if (!character) return;
    const group = { a: 'passives', c: 'constellations', t: 'talents' }[slot[0]];
    const position = Number(slot.slice(1)) - Number(group === 'constellations');
    const piece = character.metadata[group][position];
    const id = entity + '.' + grant;
    const buffIndex = piece?.buffs?.findIndex(row => row.id === id);
    const buff = piece?.buffs?.[buffIndex];
    const index = options.index ?? 0;
    const modifier = buff?.modifiers[index];
    const role = options.role ?? 'owner';
    if (modifier?.target !== target || (modifier.recipient ?? buff.recipient ?? 'owner') !== role) return;
    const field = '/' + group + '/' + position + '/buffs/' + buffIndex + '/modifiers/' + index;
    const key = entity + field;
    const choice = choices.get(key);
    if (!choice?.listed || choice.issue || choice.id !== id || choice.target !== target || choice.role !== role || occupied.has(key)) return;
    const definitions = character.calculation.bundle.effects.filter(row => row.identity.id === (index ? id + '.' + index : id)
      && (row.buff ?? row.identity).id === id && row.target.kind === 'attribute' && row.target.attribute.id === target
      && row.recipient.role === role);
    if (definitions.length !== 1) return;
    const active = probes.find(row => row.expected !== 0);
    if (!active || !probes.some(row => row.expected === 0) || !probes.every(row => Number.isFinite(row.expected))) return;
    const unlock = { ascension: piece.unlockAscension ?? 0, constellation: group === 'constellations' ? position + 1 : 0 };
    const lock = group === 'constellations' ? { constellation: unlock.constellation - 1 }
      : unlock.ascension ? { ascension: unlock.ascension - 1, ranks: {} } : null;
    const settings = [...probes, ...(lock ? [negative(active.settings.hit, { ...active.settings, ...lock })] : [])];
    const cases = settings.map(({ expected, settings, excluded }) => {
      const input = { supplier: entity, recipient: entity, ...unlock, ...settings };
      return { ...measure(entity, definitions[0], buff, input), expected, settings: input, excluded };
    });
    const failed = cases.find(row => !close(row.actual, row.expected) || row.excluded && row.instances !== 0
      || row.expected !== 0 && (!row.usingTarget || row.instances !== 1));
    if (failed) {
      if (process.env.CHARACTER_DAMAGE_AUDIT_DEBUG) process.stderr.write(JSON.stringify({ entity, grant, index, ...failed }) + '\n');
      return;
    }
    const result = cases.find(row => row.expected !== 0);
    output.push({ key, entity, field, id, modifier: index, target, actual: result.actual, expected: result.expected,
      audit: 'characterDamageModifierNumbers', refs: [...new Set(refs)],
      ...(options.sourceExcerpt ? { sourceExcerpt: options.sourceExcerpt } : {}),
      scope: '由固定来源独立推导数值，使用实际命中输出的依赖链核对角色、受益者、计算阶段和排除分支。',
      cases: cases.map(({ actual, expected, settings }) => ({ actual, expected, settings })),
    });
    occupied.add(key);
  }

  function fromText(entity, slot, grant, target, pattern, probes, options = {}) {
    if (!characters.has(entity)) return;
    const { text, ref } = source(entity, options.sourceSlot ?? slot);
    const sourceMatch = text ? pattern.exec(text) : null;
    const values = sourceMatch?.slice(1).map(Number);
    if (values?.length && values.every(Number.isFinite)) check(entity, slot, grant, attribute(target), [ref, ...options.refs ?? []], probes(values), {
      ...options, sourceExcerpt: !options.sourceSlot || options.sourceSlot === slot ? sourceMatch[0] : undefined,
    });
  }

  function fromTable(entity, slot, grant, target, tableSlot, label, parameterIndex, probes, options = {}) {
    if (!characters.has(entity)) return;
    const origin = source(entity, tableSlot);
    const labels = origin.labels?.filter(row => row.startsWith(label + '|')) ?? [];
    const parameter = labels.flatMap(row => [...row.matchAll(/\{(param\d+):/g)])[parameterIndex]?.[1];
    const values = rates[origin.origin]?.[origin.key]?.[parameter];
    if (values?.length) check(entity, slot, grant, attribute(target),
      [source(entity, slot).ref, origin.ref, table + '#' + origin.origin + '/' + origin.key + '/' + parameter, ...options.refs ?? []], probes(values), options);
  }
  const damage = 'damageBonus', flat = 'baseDamageBonus', factor = 'baseMultiplier';
  const normal = 'normal.param1', skill = 'skill.param1', burst = 'burst.param1';
  // Fixed grants are keyed by the source phrase and actual qualifying and excluded hits.
  for (const [id, slot, grant, target, pattern, hits, excluded, gate, settings = {}] of [
    ['amber', 'c1', 'second-arrow', factor, /第二支箭能造成原本(\d+)%/, ['normal.c1-aimed', 'normal.c1-full'], normal],
    ['chasca', 'a1', 'a1.covering-fire-factor', factor, /追影弹的(\d+)%；/, 'a1.covering-fire', normal, null, { values: set('chasca.nightsoulBurst') }],
    ['chasca', 'a1', 'a1.covering-fire-converted-factor', factor, /焕光追影弹的(\d+)%/, 'a1.covering-fire-converted', normal, null,
      { party: ['amber'], values: { absorbedElement: 'pyro', 'chasca.nightsoulBurst': true } }],
    ['chiori', 'c2', 'c2.kinu-factor', factor, /相当于袖(\d+)%/, 'c2.kinu', skill, null, { values: set('chiori.kinuAttack') }],
    ['chongyun', 'c6', 'c6.lower-hp-burst', damage, /生命值百分比低于重云的敌人造成伤害时，伤害提升(\d+)%/, burst, skill, 'chongyun.lowerHpEnemy'],
    ['cyno', 'a0', 'a0.judication-skill', damage, /此次秘仪·律渊渡魂造成的伤害提升(\d+)%/, 'skill.param2', skill, 'cyno.endseer'],
    ['dehya', 'c2', 'c2.fiery-sanctum-retaliation', damage, /下次协同攻击造成的伤害提升(\d+)%/, 'skill.param3', skill, 'dehya.sanctumRetaliation'],
    ['diluc', 'c4', 'c4.searing-onslaught-rhythm', damage, /下一段逆焰之刃的伤害提高(\d+)%/, ['skill.param2', 'skill.param3'], skill, 'diluc.searingOnslaughtRhythm'],
    ['diluc', 'c6', 'c6.searing-onslaught-normal', damage, /普通攻击速度提升\d+%，造成的伤害提高(\d+)%/, normal, skill, 'diluc.searingNormalRemaining'],
    ['diona', 'c2', 'c2.icy-paws-damage', damage, /猫爪冻冻造成的伤害提高(\d+)%/, skill, burst],
    ['emilie', 'c1', 'c1.perfume-bonus', damage, /清露香氛造成的伤害提升(\d+)%/, [skill, 'skill.param2', 'skill.param3'], burst],
    ['eula', 'a0', 'a0.shattered-lightfall-factor', factor, /光降之剑基础伤害(\d+)%/, 'a0.shattered-lightfall', 'burst.param2', null, { values: set('eula.spentTwoGrimheart') }],
    ['fischl', 'a0', 'a0.stellar-predator-factor', factor, /射击伤害([\d.]+)%/, 'a0.stellar-predator', normal, null, { values: set('fischl.chargedArrowStruckOz') }],
    ['jean', 'c1', 'c1.gale-blade-long-hold', damage, /使造成的伤害提升(\d+)%/, skill, normal, 'jean.galeBladeHeld'],
    ['kamisatoayaka', 'c2', 'c2.smaller-frostflake-cut-factor', factor, /各自能造成原本(\d+)%/, 'c2.smaller-frostflake-cut', burst],
    ['kamisatoayaka', 'c2', 'c2.smaller-frostflake-bloom-factor', factor, /各自能造成原本(\d+)%/, 'c2.smaller-frostflake-bloom', burst],
    ['kamisatoayaka', 'c6', 'c6.usurahi-butou', damage, /重击造成的伤害提高(\d+)%/, 'normal.param8', normal, 'kamisatoayaka.usurahiButou'],
    ['klee', 'a0', 'a0.explosive-spark', damage, /重击不消耗体力，造成的伤害提升(\d+)%/, 'normal.param4', normal, 'klee.explosiveSparkSpent'],
    ['klee', 'c1', 'c1.chained-reactions-factor', factor, /轰轰火花攻击伤害(\d+)%/, 'c1.chained-reactions', burst, null, { values: set('klee.chainedSpark') }],
    ['lanyan', 'a0', 'a0.absorbed-ring-factor', factor, /附加原本(\d+)%/, 'a0.absorbed-ring', skill, null, { values: { absorbedElement: 'pyro' } }],
    ['linnea', 'a3', 'a3.ultra-convenient-quick-arrow-factor', factor, /对敌人造成的伤害降低为原本的(\d+)%/, 'normal.ultra-convenient-quick-arrow', normal, null, { values: set('linnea.ultraConvenientQuickArrow') }],
    ['lynette', 'a1', 'a1.box-converted-bonus', damage, /元素爆发造成的伤害提升(\d+)%/, burst, skill, 'lynette.bogglecatAbsorbed'],
    ['lyney', 'c6', 'c6.reprised-strike-factor', factor, /造成礼花术弹(\d+)%/, 'c6.reprised-strike', 'normal.param15', null, { values: { 'lyney.pyrotechnicStrike': true, 'lyney.propArrowFired': true } }],
    ['mona', 'a0', 'torrent-base', factor, /水中幻愿伤害的(\d+)%/, 'skill.illusory-torrent', skill, null, { values: set('mona.illusoryTorrent') }],
    ['mualani', 'c4', 'c4.stormburst-bonus', damage, /爆瀑飞弹造成的伤害提升(\d+)%/, burst, normal],
    ['navia', 'a0', 'a0.undisclosed-distribution', damage, /下落攻击造成的伤害提升(\d+)%/, [normal, 'normal.param6', 'normal.param9'], skill, 'navia.crystallineInfusion'],
    ['nilou', 'c1', 'c1.luminous-illusion', damage, /水月造成的伤害提升(\d+)%/, 'skill.param4', skill],
    ['qiqi', 'c2', 'c2.cryo-strikes', damage, /普通攻击与重击造成的伤害提升(\d+)%/, [normal, 'normal.param6'], 'skill.param8', 'aura.cryo'],
    ['razor', 'c1', 'c1.wolf-instinct', damage, /造成的伤害提高(\d+)%/, normal, null, 'razor.particlePickupWindow'],
    ['rosaria', 'c1', 'c1.critical-normal', damage, /普通攻击造成的伤害提升(\d+)%/, normal, skill, 'rosaria.criticalWindow'],
    ['sayu', 'c2', 'c2.press-kick', damage, /点按施放时，风风轮舞踢造成的伤害提高([\d.]+)%/, 'skill.param3', skill],
    ['varesa', 'c4', 'c4.fiery-burst-bonus', damage, /本次元素爆发闪烈降临！造成的伤害提升(\d+)%/, burst, normal, 'varesa.fireBurstState'],
    ['varka', 'c1', 'c1-king-wine', factor, /四风将起或苍噬造成原本(\d+)%/, ['skill.param14', 'skill.param16'], normal,
      'varka.kingWine', { party: ['amber'], values: { 'varka.stance': true } }],
    ['yelan', 'c6', 'c6.mastermind-barb-factor', factor, /破局矢(\d+)%的伤害/, 'c6.mastermind-barb', 'normal.param7', null, { values: set('yelan.mastermind') }],
    ...Array.from({ length: 4 }, (_, index) => ['wanderer', 'c6', 'c6.kuugo-param' + (index + 1) + '-factor', factor,
      /额外进行一次空居·不生断，造成原本(\d+)%/, 'c6.kuugo-param' + (index + 1), 'normal.param' + (index + 1), null,
      { values: { 'wanderer.windfavored': true, 'wanderer.extraKuugo': true } }]),
    ...Array.from({ length: 5 }, (_, index) => ['yoimiya', 'c6', 'c6.kindling-arrow-' + (index + 1) + '-factor', factor,
      /额外的炽焰箭，造成原本(\d+)%/, 'c6.kindling-arrow-' + (index + 1), 'normal.param' + (index + 1) + '.pyro', null,
      { values: { 'yoimiya.niwabi': true, 'yoimiya.extraKindlingArrow': true } }]),
  ]) fromText(id, slot, grant, target, pattern, ([amount]) => {
    if (!gate) return plain(scalar(amount), hits, excluded, settings);
    if (excluded) return toggle(scalar(amount), hits, excluded, gate, settings);
    return [positive(scalar(amount), hits, { ...settings, values: set(gate) }), negative(hits, { ...settings, values: set(gate, false) })];
  });

  for (const [index, amount] of [1, 2, 3].entries()) {
    fromText('chasca', 'a0', 'a0.shining-spirit-bonus', damage, /伤害提升(\d+)%\/(\d+)%\/(\d+)%/, values => [
      ...plain(scalar(values[index]), 'skill.param4', normal, { party: ['amber'], values: { 'chasca.shiningSpiritStacks': amount, absorbedElement: 'pyro' } }),
      negative('skill.param4', { party: ['amber'], values: { 'chasca.shiningSpiritStacks': amount % 3 + 1, absorbedElement: 'pyro' } }),
    ], { index });
    fromText('neuvillette', 'a0', 'a0.dragon-glory', factor, /衡平推裁造成原本(\d+)%\/(\d+)%\/(\d+)%/, values => [
      ...plain(scalar(values[index]), 'normal.param5', skill, { values: set('neuvillette.dragonGloryStacks', amount) }),
      negative('normal.param5', { values: set('neuvillette.dragonGloryStacks', amount % 3 + 1) }),
    ], { index });
  }

  fromText('eula', 'c4', 'c4.lightfall-execution', damage, /生命值低于(\d+)%的敌人，光降之剑造成的伤害提高(\d+)%/, ([hp, value]) => [
    ...plain(scalar(value), 'burst.param2', burst, { values: set('targetHpRatio', scalar(hp - 1)) }),
    negative('burst.param2', { values: set('targetHpRatio', scalar(hp)) }),
    negative('burst.param2', { values: set('targetHpRatio', scalar(hp + 1)) }),
  ]);

  fromText('wriothesley', 'a0', 'a0.gracious-rebuke', damage, /造成的伤害提升(\d+)%/, ([amount]) => [
    ...plain(scalar(amount), 'a0.rebuke-vaulting-fist', 'normal.param7', { values: { hpRatio: .59, 'wriothesley.graciousRebuke': true } }),
    negative('a0.rebuke-vaulting-fist', { constellation: 1, values: { hpRatio: .59, 'wriothesley.graciousRebuke': true } }),
  ]);
  fromText('wriothesley', 'c1', 'c1.gracious-rebuke-enhanced', damage, /伤害提升进一步提升至(\d+)%/,
    ([amount]) => plain(scalar(amount), 'a0.rebuke-vaulting-fist', 'normal.param7', { ascension: 1, values: { hpRatio: .59, 'wriothesley.graciousRebuke': true } }));
  fromText('wriothesley', 'c6', 'c6.gracious-icicle-enhanced', damage, /造成的伤害提升进一步提升至(\d+)%/,
    ([amount]) => plain(scalar(amount), 'c6.gracious-icicle', 'normal.param7', { ascension: 1, values: { hpRatio: .59, 'wriothesley.graciousRebuke': true } }),
    { sourceSlot: 'c1', refs: [source('wriothesley', 'c6').ref] });

  for (const [id, slot, grant, target, label, index, hits, excluded, gate, settings = {}] of [
    ...['coil-1', 'coil-2', 'coil-3'].map((grant, index) => ['aloy', 't1', grant, damage, '线圈普通攻击伤害提升', index, normal, 'normal.param6', null,
      { values: { 'aloy.coilStacks': index + 1, 'aloy.rushingIce': false } }]),
    ['aloy', 't1', 'rushing-ice', damage, '冰驰普通攻击伤害提升', 0, 'normal.ice-1', skill, 'aloy.rushingIce', { values: set('aloy.iceSeconds', 0) }],
    ['vodyanitsa', 't2', 'long-song-damage', damage, '遥久之歌伤害加成', 0, burst, skill, 'vodyanitsa.longSong'],
    ['wanderer', 't1', 'stance-normal', factor, '空居·不生断伤害', 0, [normal, 'normal.param4'], 'normal.param5', 'wanderer.windfavored'],
    ['wanderer', 't1', 'stance-charged', factor, '空居·刀风界伤害', 0, 'normal.param5', normal, 'wanderer.windfavored'],
    ['wriothesley', 't1', 'stance-normal', factor, '强化斥逐拳伤害', 0, [normal, 'normal.param6'], 'normal.param7',
      'wriothesley.chillingPenalty', { values: set('hpRatio', .51) }],
    ['xiao', 't2', 'mask-bonus', damage, '普通攻击/重击/下落攻击伤害提升', 0, [normal, 'normal.param7', 'normal.param9'], skill, 'xiao.mask'],
    ['yanfei', 't2', 'brilliance-bonus', damage, '重击伤害提升', 0, 'normal.param4', normal, 'yanfei.brilliance'],
    ['yoimiya', 't1', 'niwabi-multiplier', factor, '炽焰箭伤害', 0, ['normal.param1.pyro', 'normal.param5.pyro'], normal, null,
      { values: set('yoimiya.niwabi') }],
  ]) fromTable(id, slot, grant, target, slot, label, index, values => [
    ...[1, 10].flatMap(rank => {
      const input = { ...settings, ...(rank === 10 ? { ascension: 6, ranks: { [slot === 't1' ? 'skill' : 'burst']: rank } } : {}) };
      const probes = gate ? toggle(values[rank - 1], hits, excluded, gate, input) : plain(values[rank - 1], hits, excluded, input);
      if (grant.startsWith('coil-')) return probes.slice(0, -1).concat(negative(skill, { ...input, values: {} }));
      return grant === 'rushing-ice' ? [probes[0], negative('normal.param6', { ...input, values: { 'aloy.rushingIce': true, 'aloy.iceSeconds': 0 } }), probes.at(-1)] : probes;
    }),
    ...grant.startsWith('coil-') ? [negative(normal, { values: { ...settings.values, 'aloy.coilStacks': 0 } })] : [],
    ...id === 'wriothesley' ? [negative(normal, { values: { 'wriothesley.chillingPenalty': true, hpRatio: .5 } })] : [],
  ]);

  const sourceStats = (entity, weapon) => [catalog + 'characters.json#/' + (growth[entity] ? entity : entity.split('-')[0]) + '/stats',
    catalog + 'character-curves.json', catalog + 'weapons.json#/' + (weapon ?? novice[(growth[entity] ?? growth[entity.split('-')[0]]).metadata.weaponType]) + '/stats',
    catalog + 'weapon-curves.json'];
  const swordMastery = { weapon: 'ironsting' };
  const spearMastery = { weapon: 'kitaincrossspear' };
  const catalystMastery = { weapon: 'sacrificialfragments' };
  const claymoreMastery = { weapon: 'bloodtaintedgreatsword' };
  for (const [id, slot, grant, stat, pattern, hits, excluded, input = {}, gate, role = 'owner'] of [
    ['baizhu', 'c6', 'c6.spiritvein-hp', 'hp', /相当于白术生命值上限的(\d+)%/, 'burst.param7', skill],
    ['chiori', 'c6', 'c6.normal-defence', 'defense', /防御力的(\d+)%/, normal, 'normal.param6'],
    ['citlali', 'a1', 'a1.frostfall-em', 'elementalMastery', /霜陨风暴造成的伤害提升，提升值相当于茜特菈莉的元素精通的(\d+)%/,
      'skill.param5', skill, catalystMastery],
    ['citlali', 'a1', 'a1.ice-storm-em', 'elementalMastery', /冰风暴造成的伤害提升，提升值相当于茜特菈莉的元素精通的(\d+)%/,
      burst, 'burst.param2', catalystMastery],
    ['citlali', 'c1', 'c1.starblade', 'elementalMastery', /提升值相当于茜特菈莉元素精通的(\d+)%/,
      normal, 'normal.param1', { ...catalystMastery, ...peer('kaeya', normal) }, 'citlali.starbladeRemaining', 'team'],
    ['cyno', 'a1', 'a1.duskstalker-mastery', 'elementalMastery', /「落羽的裁择」的渡荒之雷：元素精通的(\d+)%/,
      'a0.duststalker-bolt', 'skill.param2', { ...spearMastery, values: { 'cyno.endseer': true } }],
    ['durin', 'c1', 'c1.white-whorl', 'attack', /提升值相当于杜林攻击力的(\d+)%/, normal, normal,
      { ...peer('kaeya', normal), values: set('durin.whiteDragonActive') }, 'durin.recipientWhiteWhorl', 'team'],
    ['durin', 'c1', 'c1.black-whorl', 'attack', /黑度法[^]+?提升值相当于杜林攻击力的(\d+)%/, 'burst.param8', normal,
      { values: set('durin.blackDragonActive') }, 'durin.blackWhorlRemaining'],
    ['emilie', 'c6', 'c6.abiding-fragrance', 'attack', /提升值相当于艾梅莉埃攻击力的(\d+)%/,
      ['normal.c6-fragrance-1', 'normal.c6-fragrance-5'], normal, {}, 'emilie.abidingFragrance'],
    ['escoffier', 'c2', 'c2.cold-dish', 'attack', /提升值相当于爱可菲攻击力的(\d+)%/, 'skill.param1', normal,
      peer('kaeya', skill), 'escoffier.coldDishStacksRemaining', 'team'],
    ['gorou', 'a1', 'favored-skill', 'defense', /犬坂吠吠方圆阵的技能伤害提高值：防御力的([\d.]+)%/, skill, burst],
    ['gorou', 'a1', 'favored-burst', 'defense', /岩晶崩破伤害提高值：防御力的([\d.]+)%/, [burst, 'burst.param2'], skill,
      { values: set('gorou.generalsGloryTick') }],
    ['kaedeharakazuha', 'c6', 'c6.crimson-momiji', 'elementalMastery', /下落攻击造成的伤害提高([\d.]+)%/,
      [normal, 'normal.param7', 'normal.param10'], skill, { ...swordMastery, actions: [action('skill')] }, null, 'owner'],
    ['kukishinobu', 'a1', 'heart-repose-damage', 'elementalMastery', /伤害提升值：元素精通的(\d+)%/, 'skill.param4', skill, swordMastery],
    ['lanyan', 'a1', 'a1.skill-mastery', 'elementalMastery', /分别相当于蓝砚元素精通的(\d+)%和/, skill, burst, catalystMastery],
    ['lanyan', 'a1', 'a1.burst-mastery', 'elementalMastery', /分别相当于蓝砚元素精通的\d+%和(\d+)%/, burst, skill, catalystMastery],
    ['layla', 'a1', 'a1.shooting-star-hp', 'hp', /莱依拉生命值上限的([\d.]+)%/, 'skill.param2', skill],
    ['layla', 'c4', 'c4.dawn-star', 'hp', /相当于莱依拉生命值上限的(\d+)%/, normal, skill,
      peer('kaeya', normal), 'layla.dawnStarRecipient', 'team'],
    ['lyney', 'a0', 'a0.prop-hp-sacrifice', 'attack', /基于攻击力的(\d+)%/, 'normal.param15', normal,
      { values: set('lyney.pyrotechnicStrike') }, 'lyney.propArrowHpConsumed'],
    ['sethos', 'a1', 'sand-king', 'elementalMastery', /元素精通的(\d+)%/, 'normal.param7', normal,
      { supplemental: { elementalMastery: 80 } }, 'sethos.desertShadow'],
    ['wanderer', 'c1', 'c1.descent-arrow-strength', 'attack', /风矢能额外造成(\d+)%攻击力/,
      'a1.descent-arrow', skill, { ascension: 4, values: { 'wanderer.windfavored': true, 'wanderer.descentDash': true } }],
    ['xilonen', 'c4', 'c4.blooming-blessing', 'defense', /希诺宁的防御力的(\d+)%/, normal, skill,
      peer('kaeya', normal), 'xilonen.bloomingBlessingReady', 'team'],
    ['xilonen', 'c6', 'c6.imperishable-blessing', 'defense', /伤害提升，提升值相当于希诺宁的防御力的(\d+)%/, 'normal.roller10', skill,
      { values: set('xilonen.nightsoul') }, 'xilonen.imperishableBlessing'],
    ['zhongli', 'a1', 'a1.dominance-normal-hp', 'hp', /普通攻击、重击与下落攻击伤害提高值：生命值上限的([\d.]+)%/,
      [normal, 'normal.param7', 'normal.param10'], skill],
    ['zhongli', 'a1', 'a1.dominance-skill-hp', 'hp', /共鸣伤害与长按伤害提高值：生命值上限的([\d.]+)%/,
      [skill, 'skill.param2', 'skill.param4'], burst],
    ['zhongli', 'a1', 'a1.dominance-burst-hp', 'hp', /天星伤害提高值：生命值上限的(\d+)%/, burst, normal],
  ]) {
    if (!characters.has(id)) continue;
    const ascension = input.ascension ?? (slot[0] === 'a' ? characters.get(id).metadata.passives[Number(slot.slice(1))].unlockAscension : 0);
    fromText(id, slot, grant, id === 'kaedeharakazuha' ? damage : flat, pattern, ([amount]) => {
      const value = scalar(amount) * (input.supplemental?.elementalMastery ?? progression(id, stat, { ...input, ascension }));
      if (role === 'team' && hits === excluded) return [
        positive(value, hits, { ...input, values: { ...input.values, [gate]: true } }),
        negative(hits, { ...input, recipient: id, values: { ...input.values, [gate]: true } }),
        negative(hits, { ...input, onField: false, values: { ...input.values, [gate]: true } }),
        negative(hits, { ...input, values: { ...input.values, [gate]: false } }),
      ];
      return gate ? toggle(value, hits, excluded, gate, input) : plain(value, hits, excluded, input);
    }, { role, refs: sourceStats(id, input.weapon) });
  }

  const countCases = (values, countKey, hit, expected, settings = {}) =>
    values.map(value => positive(expected(value), hit, { ...settings, values: { ...settings.values, [countKey]: value } }));
  for (const [id, slot, grant, target, text, key, hit, excluded, max, settings = {}] of [
    ['citlali', 'c6', 'c6.mystery-owner', damage, /秘律之数」上限为(\d+)点[^。]*使茜特菈莉造成的伤害提升([\d.]+)%/,
      'citlali.mysteryCount', normal, null, true],
    ['clorinde', 'c4', 'c4.last-light-pact', damage, /每1%生命之契都将使此次残光将终造成的伤害提升(\d+)%[^]+?伤害提升(\d+)%/,
      'clorinde.bondOfLifeRatio', burst, normal, false],
    ['mona', 'c6', 'c6-rhetoric', damage, /下一次重击伤害就增加(\d+)%[^。]*获得(\d+)%重击伤害加成/,
      'mona.c6SlideSeconds', 'normal.param5', normal, false],
    ['sayu', 'c2', 'c2.hold-kick', damage, /风风轮舞踢造成的伤害提高([\d.]+)%[^]+?通过这种方式，风风轮舞踢造成的伤害至多可以提高(\d+)%/,
      'sayu.rollHalfSeconds', 'skill.param4', skill, false],
    ['shenhe', 'c4', 'c4-frost', damage, /每层使本次仰灵威召将役咒造成的伤害提高(\d+)%[^。]*该效果至多叠加(\d+)次/,
      'shenhe.frostStacks', skill, burst, true],
    ['wanderer', 'c2', 'c2.kugen-burst', damage, /每1点使此次狂言·式乐五番造成的伤害提升(\d+)%[^]+?伤害提升(\d+)%/,
      'wanderer.kugoryokuDepletion', burst, skill, false, { values: set('wanderer.windfavored') }],
    ['xiao', 'a0', 'a0.bane-of-all-evil-damage', damage, /造成的伤害再额外提高(\d+)%[^]+?获得(\d+)%伤害加成/,
      'xiao.baneDamageSteps', normal, null, false, { values: set('xiao.baneActive') }],
    ['xiao', 'a1', 'a1.lemniscatic-wind-cycling', damage, /风轮两立造成的伤害提高(\d+)%[^]+?最多叠加(\d+)次/,
      'xiao.windCyclingStacks', skill, normal, true],
  ]) fromText(id, slot, grant, target, text, ([first, second]) => {
    const rate = id === 'citlali' ? second : first;
    const cap = id === 'citlali' ? first : max ? second : Math.round(second / first);
    const expected = value => scalar(rate * Math.min(value * (id === 'clorinde' ? 100 : 1), cap));
    const values = id === 'clorinde' ? [0, .25, 1, 1.5] : id === 'xiao' && slot === 'a0' ? [1, 2, cap] : [0, 1, cap];
    return [...countCases(values, key, hit, expected, settings), ...excluded ? [negative(excluded, settings)] : [],
      ...id === 'xiao' && slot === 'a0' ? [negative(hit, { values: { [key]: cap, 'xiao.baneActive': false } })] : []];
  });

  fromText('albedo', 'c2', 'c2.fatal-reckoning', flat, /防御力的(\d+)%的伤害；\s*·该效果至多叠加(\d+)次/,
    ([amount, cap]) => [
      ...countCases([0, 1, cap], 'albedo.fatalReckoningSpent', burst, count => progression('albedo', 'defense') * scalar(amount) * count),
      ...countCases([cap], 'albedo.fatalReckoningSpent', 'burst.param2', count => progression('albedo', 'defense') * scalar(amount) * count),
      negative(skill, { values: set('albedo.fatalReckoningSpent', cap) }),
    ], { refs: sourceStats('albedo') });

  const arlecchino = 'arlecchino';
  fromTable(arlecchino, 't0', 't0.masque-red-death', flat, 't0', '红死之宴提升', 0, ([rate]) => [
    ...countCases([.3, .5], 'arlecchino.bondOfLifeRatio', normal, ratio => ratio * rate * progression(arlecchino, 'attack'),
      { values: set('arlecchino.masqueRedDeath') }),
    negative(normal, { values: { 'arlecchino.masqueRedDeath': false, 'arlecchino.bondOfLifeRatio': .29 } }),
    negative('normal.param7', { values: set('arlecchino.masqueRedDeath') }),
  ], { refs: sourceStats(arlecchino) });
  fromText(arlecchino, 'c6', 'c6.burst-bond', flat, /当前生命之契百分比的(\d+)%/, ([rate]) => [
    ...countCases([0, .3, .6], 'arlecchino.bondOfLifeRatio', burst, ratio => ratio * scalar(rate) * progression(arlecchino, 'attack')),
    negative(skill, {}),
  ], { refs: sourceStats(arlecchino) });

  fromText('hutao', 'c2', 'c2.blood-blossom-hp', flat, /效果附加时胡桃生命值上限的(\d+)%/, ([amount]) => [
    ...countCases([1000, 14000, 30000], 'hutao.markingHp', 'skill.param3', hp => hp * scalar(amount)),
    negative(normal, { values: set('hutao.markingHp', 14000) }),
  ]);
  fromText('kinich', 'a1', 'a1.hunter-experience', flat, /至多叠加(\d+)层[^]+?攻击力的(\d+)%/, ([cap, amount]) => [
    ...countCases([0, 1, cap], 'kinich.hunterExperienceSpent', 'skill.param2', count => progression('kinich', 'attack', { ascension: 4 }) * scalar(amount) * count),
    negative(skill, {}),
  ], { refs: sourceStats('kinich') });

  for (const [entity, slot, grant, target, pattern, stat, hits, excluded, input, compute] of [
    ['alyosha', 'a1', 'a1.recharge-damage', damage, /每1%元素充能效率都会使上述伤害提升([\d.]+)%，至多提升至(\d+)%/,
      'energyRecharge', [skill, burst], normal, {}, ([rate, cap], amount) => Math.min(rate * amount, scalar(cap))],
    ['emilie', 'a1', 'a1.burning-enemy', damage, /每(\d+)点攻击力都将提升(\d+)%伤害，至多通过这种方式提升(\d+)%/,
      'attack', [normal, skill], null, { values: set('emilie.targetBurning') }, ([basis, rate, cap], amount) => scalar(Math.min(cap, rate * amount / basis))],
    ['durin', 'a1', 'a1.dragon-primordial', factor, /每(\d+)点攻击力都将额外造成相当于原本(\d+)%的伤害，至多通过这种方式额外造成相当于原本(\d+)%/,
      'attack', ['burst.param7', 'burst.param8'], normal, { values: { 'durin.primordialStackReady': true } },
      ([basis, rate, cap], amount) => 1 + scalar(Math.min(cap, rate * amount / basis))],
    ['furina', 'a1', 'salon-max-hp', damage, /每(\d+)点生命值上限[^]+?「沙龙成员」造成的伤害提升([\d.]+)%，通过这种方式至多使「沙龙成员」造成的伤害提升(\d+)%/,
      'hp', ['skill.param3', 'skill.param4', 'skill.param5'], skill, {},
      ([basis, rate, cap], amount) => scalar(Math.min(cap, rate * amount / basis))],
    ['kirara', 'a1', 'a1.skill-hp-damage', damage, /每(\d+)点生命值上限将使呜喵町飞足造成的伤害提升([\d.]+)%/,
      'hp', [skill, 'skill.param7', 'skill.param9'], burst, {}, ([basis, rate], amount) => scalar(rate * amount / basis)],
    ['kirara', 'a1', 'a1.burst-hp-damage', damage, /每(\d+)点生命值上限[^]+?秘法·惊喜特派造成的伤害提升([\d.]+)%/,
      'hp', [burst, 'burst.param2'], skill, {}, ([basis, rate], amount) => scalar(rate * amount / basis)],
    ['lauma', 'a1', 'skill-em-damage', damage, /元素战技造成的伤害提升([\d.]+)%，通过这种方式至多提升(\d+)%/,
      'elementalMastery', [skill], normal, catalystMastery, ([rate, cap], amount) => scalar(Math.min(cap, rate * amount))],
    ['nahida', 'a1', 'ascension-four.tri-karma-bonus', damage, /元素精通超过(\d+)点的部分，每1点元素精通能使所闻遍计的灭净三业造成的伤害提升([\d.]+)%[^]+?造成的伤害提升(\d+)%/,
      'elementalMastery', ['skill.param3'], skill, {}, ([threshold, rate, cap], amount) => scalar(Math.min(cap, rate * Math.max(0, amount - threshold)))],
  ]) {
    if (!characters.has(entity)) continue;
    const ascension = 4;
    const base = progression(entity, stat, { ...input, ascension });
    fromText(entity, slot, grant, target, pattern, values => {
      const extra = { attack: 'flatAttack', hp: 'flatHp', elementalMastery: 'elementalMastery', energyRecharge: 'energyRecharge' }[stat];
      const minimum = stat === 'elementalMastery' ? 400 : base;
      const chosen = [...new Set([minimum, { attack: 4000, hp: 50000, elementalMastery: 1100, energyRecharge: 2.5 }[stat]])];
      const active = chosen.flatMap(total => {
        const amount = stat === 'attack' || stat === 'hp' ? total - base : total;
        const supplemental = total === base ? {} : { [extra]: amount };
        return hits.map(hit => positive(compute(values, total), hit, { ...input, supplemental }));
      });
      const absence = excluded ? negative(excluded, input) : negative(hits[0], { values: set('emilie.targetBurning', false) });
      return [...active, absence];
    }, { refs: sourceStats(entity, input.weapon) });
  }
  fromText('furina', 't1', 'salon-allies', factor, /伤害为原本的(\d+)%\/(\d+)%\/(\d+)%\/(\d+)%/, values => [
    ...['skill.param3', 'skill.param4', 'skill.param5'].flatMap(hit =>
      countCases([0, 1, 2, 3, 4], 'furina.salonAllies', hit, count => count ? scalar(values[count - 1]) : 1)),
    negative(normal, {}),
  ]);

  fromText('lyney', 'a1', 'a1.conclusive-ovation', damage, /基础提升(\d+)%[^]+?提升(\d+)%[^]+?伤害提升(\d+)%/,
    ([base, rate, cap]) => [
      ...[[], ['amber'], ['amber', 'bennett'], ['amber', 'bennett', 'klee']].map((party, index) =>
        positive(scalar(Math.min(cap, base + rate * index)), normal, { party, values: set('aura.pyro') })),
      negative(normal, { party: ['amber'], values: set('aura.pyro', false) }),
    ]);
  fromText('mualani', 'a1', 'a1.wavechaser-hp', flat, /生命值上限的(\d+)%\/(\d+)%\/(\d+)%/, values => [
    ...countCases([0, 1, 2, 3], 'mualani.wavechaserSpent', burst,
      count => progression('mualani', 'hp', { ascension: 4 }) * scalar(values[count - 1] ?? 0)),
    negative(normal, {}),
  ], { refs: sourceStats('mualani') });
  fromText('mualani', 'c1', 'c1.first-surging-bite', flat, /玛拉妮生命值上限的(\d+)%/, ([rate]) => [
    positive(scalar(rate) * progression('mualani', 'hp'), skill, { values: { 'mualani.waveMomentum': 3, 'mualani.firstSurgingBite': true } }),
    negative(skill, { values: { 'mualani.waveMomentum': 2, 'mualani.firstSurgingBite': true } }),
    negative(skill, { values: { 'mualani.waveMomentum': 3, 'mualani.firstSurgingBite': false } }),
  ], { refs: sourceStats('mualani') });

  for (const [id, slot, grant, tableSlot, label, stat, hit, outside, values = {}, second] of [
    ['mualani', 't1', 'full-charge-base', 't1', '巨浪鲨鲨撕咬伤害额外提升', 'hp', skill, 2, set('mualani.waveMomentum', 3)],
    ['sangonomiyakokomi', 't2', 'garment-jellyfish', 't2', '化海月伤害提升', 'hp', 'skill.param3', false, set('sangonomiyakokomi.garment')],
    ['shikanoinheizou', 't1', 'full-charge-base', 't1', '正论伤害提升', 'attack', skill, 3, set('shikanoinheizou.declension', 4)],
    ['aether-hydro', 't1', 'suffusion', 't1', '充盈伤害增加', 'hp', skill, .5, set('hpRatio', .51), { hit: 'skill.param2' }],
    ['lumine-hydro', 't1', 'suffusion', 't1', '充盈伤害增加', 'hp', skill, .5, set('hpRatio', .51), { hit: 'skill.param2' }],
  ]) if (characters.has(id)) fromTable(id, slot, grant, flat, tableSlot, label, 0, numbers =>
    [1, 10].flatMap(rank => {
      const settings = { ascension: rank === 1 ? 0 : 6, ranks: { [tableSlot === 't1' ? 'skill' : 'burst']: rank } };
      return [positive(numbers[rank - 1] * progression(id, stat, settings), hit, { ...settings, values }),
        negative(hit, { ...settings, values: set(Object.keys(values)[0], outside) }),
        ...second ? [negative(second.hit, { ...settings, values })] : []];
    }), { refs: sourceStats(id) });

  for (const [entity, index, label, hit] of [
    ['mavuika', 0, '坠日斩伤害提升', burst], ['mavuika', 1, '驰轮车普通攻击伤害提升', 'skill.param4'],
    ['mavuika', 2, '驰轮车重击伤害提升', 'skill.param10'],
  ]) {
    if (!characters.has(entity)) continue;
    const setting = { values: { 'mavuika.ancientName': true, 'mavuika.flamestrider': true, 'mavuika.nightsoulActive': true } };
    const grant = ['fighting-spirit-slash', 'fighting-spirit-rider-normal', 'fighting-spirit-rider-charged'][index];
    fromTable(entity, 't2', grant, flat, 't2', label, 0, numbers => [1, 10].flatMap(rank => {
      const input = { ...setting, ascension: rank === 1 ? 0 : 6, ranks: { burst: rank } };
      const value = progression(entity, 'attack', input) * numbers[rank - 1];
      return [...countCases([50, 125, 200], 'mavuika.fightingSpirit', hit, count => value * count, input), negative(normal, {})];
    }), { refs: sourceStats(entity) });
    fromText(entity, 'c2', ['c2-rider-slash', 'c2-rider-normal', 'c2-rider-charged'][index], flat,
      /基础攻击力提升(\d+)点[^]+?攻击力的(\d+)%\/(\d+)%\/(\d+)%/, ([added, ...values]) =>
        plain((progression(entity, 'attack') + added) * scalar(values[(index + 2) % 3]), hit, normal, setting), { refs: sourceStats(entity) });
  }

  for (const [entity, slot, grant, label, hit, scaleKey, cap, settings] of [
    ['lohen', 't1', 'skill.will-factor', '每点争胜提升原本伤害', 'skill.param17', 'lohen.will', 100, { values: set('lohen.masterstroke') }],
    ['lohen', 't2', 'burst.will-factor', '每点争胜提升原本伤害', burst, 'lohen.will', 100, { values: set('lohen.masterstroke') }],
    ['nefer', 't2', 'spent-veil', '伤害提升', burst, 'nefer.consumedVeil', 3, {}],
  ]) fromTable(entity, slot, grant, entity === 'lohen' ? factor : damage, slot, label, 0, numbers =>
    [1, 10].flatMap(rank => {
      const input = { ...settings, ascension: rank === 1 ? 0 : 6, ranks: { [slot === 't1' ? 'skill' : 'burst']: rank } };
      return [...countCases([0, Math.floor(cap / 3), cap], scaleKey, hit, count => Number(entity === 'lohen') + numbers[rank - 1] * count, input),
        negative(normal, input)];
    }));

  fromText('nilou', 'c4', 'c4.fricative-pulse', damage, /第三段舞步命中敌人后[^]+?造成的伤害提升(\d+)%，持续(\d+)秒/,
    ([amount, duration]) => {
      const dance = hit => ({ kind: 'hit', skillId: 'nilou.skill', category: 'skill', hitId: 'nilou.' + hit, targetIds: ['enemy'], timeMs: 0 });
      return [
        positive(scalar(amount), burst, { actions: [dance('skill.param4')] }),
        positive(scalar(amount), 'burst.param2', { actions: [dance('skill.param6')], timeMs: duration * 1000 - 1 }),
        negative(burst, { actions: [dance('skill.param4')], timeMs: duration * 1000 }),
        negative(burst, { actions: [dance('skill.param2')] }),
        negative(burst, {}),
      ];
    });

  fromText('iansan', 'c6', 'c6.extreme-force', damage, /当前场上角色造成的伤害提升(\d+)%/, ([rate]) => {
    const input = { ...peer('kaeya', normal), values: set('iansan.extremeForce') };
    return [positive(scalar(rate), normal, input),
      negative(normal, { ...input, onField: false }), negative(normal, { ...input, values: set('iansan.extremeForce', false) })];
  }, { role: 'team' });
  fromText('xilonen', 'c2', 'c2.chiucue-geo', damage, /岩元素「源音采样」将始终保持激活状态[^]+?岩元素：造成的伤害提升(\d+)%/,
    ([rate]) => [
      positive(scalar(rate), normal, { ...peer('noelle', normal), values: set('xilonen.sourceSamplesActive', false) }),
      positive(scalar(rate), normal, { ...peer('noelle', normal, 'amber', 'kaeya'), values: set('xilonen.sourceSamplesActive', false) }),
      positive(scalar(rate), normal, { party: ['amber', 'kaeya'], values: set('xilonen.sourceSamplesActive', false) }),
      negative(normal, { party: ['amber', 'kaeya', 'lisa'], values: set('xilonen.sourceSamplesActive', true) }),
      negative(normal, { ...peer('kaeya', normal), values: set('xilonen.sourceSamplesActive', true) }),
    ], { role: 'team', refs: [source('xilonen', 't1').ref] });

  for (const [id, slot, grant, label, to, hit, condition, opposite] of [
    ['kamisatoayato', 't2', 'suiyuu', '普通攻击伤害提升', 'kaeya', normal, 'kamisatoayato.inGarden', skill],
    ['mona', 't2', 'omen', '伤害加成', 'kaeya', skill, 'mona.omen', null],
  ]) fromTable(id, slot, grant, damage, slot, label, 0, values => [1, 10].flatMap(rank => {
    const input = { ...peer(to, hit), ascension: rank === 1 ? 0 : 6, ranks: { burst: rank }, values: set(condition), ...(id === 'kamisatoayato' ? { actions: [action('burst')] } : {}) };
    return [positive(values[rank - 1], hit, input), negative(hit, { ...input, values: set(condition, false) }),
      ...opposite ? [negative(opposite, input)] : []];
  }), { role: 'team' });

  for (const constellation of [0, 1]) {
    const suffix = constellation ? '-c1' : '';
    const candace = 'candace';
    const hydronormal = peer('barbara', normal);
    const c1 = source(candace, 'c1');
    const extension = Number(/延长(\d+)秒/.exec(c1.text)?.[1]) * constellation;
    const durationSource = source(candace, 't2');
    const duration = rates[candace][durationSource.key].param2[0] + extension;
    const cast = { ...hydronormal, constellation, actions: [action('burst')] };
    const cases = value => [
      positive(value, normal, cast), positive(value, normal, { ...cast, timeMs: duration * 1000 - 1 }),
      negative(normal, { ...cast, timeMs: duration * 1000 }),
      negative(normal, { ...cast, onField: false }), negative(normal, { ...cast, actions: [] }),
      negative(normal, { ...cast, constellation: 1 - constellation }),
      negative(normal, { ...cast, ...peer('amber', normal) }),
      negative('normal.param5', cast),
    ];
    const options = { role: 'team', refs: [c1.ref, table + '#' + candace + '/' + durationSource.key + '/param2'] };
    fromTable(candace, 't2', 'scarlet-crown' + suffix, damage, 't2', '伤害加成', 0, ([amount]) => cases(amount), options);
    fromText(candace, 'a1', 'celestial-dome' + suffix, damage, /每(\d+)点生命值上限会使这次伤害提高([\d.]+)%/,
      ([basis, rate]) => cases(progression(candace, 'hp', { ascension: 4 }) / basis * scalar(rate)),
      { ...options, refs: [...options.refs, ...sourceStats(candace)] });
  }

  fromText('faruzan', 'a1', 'hurricane-guard', flat, /珐露珊基础攻击力的(\d+)%/, ([amount]) => {
    const input = { ...peer('sucrose', skill), actions: [action('burst')], values: set('faruzan.hurricaneGuard') };
    return [
      positive(scalar(amount) * progression('faruzan', 'whiteAttack', { ascension: 4 }), skill, input),
      negative(skill, { ...input, actions: [] }),
      negative(skill, { ...input, values: set('faruzan.hurricaneGuard', false) }),
      negative(skill, { ...input, ...peer('kaeya', skill) }),
    ];
  }, { role: 'team', refs: sourceStats('faruzan') });

  const illuga = 'illuga';
  const illugaState = { 'illuga.nightingaleSong': true, 'illuga.nightingaleSpend': true };
  const illugaCase = { ...peer('ningguang', 'skill.param2'), ...spearMastery, values: illugaState };
  fromTable(illuga, 't2', 'nightingale-song', flat, 't2', '岩元素伤害增加', 0, values => [1, 10].flatMap(rank => {
    const input = { ...illugaCase, ascension: rank === 1 ? 0 : 6, ranks: { burst: rank } };
    return [positive(values[rank - 1] * progression(illuga, 'elementalMastery', input), 'skill.param2', input),
      negative('skill.param2', { ...input, onField: false }),
      negative(skill, { ...input, ...peer('kaeya', skill) }),
      negative('skill.param2', { ...input, values: { ...input.values, 'illuga.nightingaleSpend': false } })];
  }), { role: 'team', refs: sourceStats(illuga, spearMastery.weapon) });
  for (const [index, party] of [['kaeya'], ['ningguang'], ['ningguang', 'barbara']].entries()) {
    const count = index + 1;
    fromText(illuga, 'a1', 'hunter-dusk-' + count, flat, /元素精通的(\d+)%\/(\d+)%\/(\d+)%/, values => {
      const recipient = count === 1 ? illuga : 'ningguang';
      const input = { ...illugaCase, party, recipient };
      const hit = index === 0 ? skill : 'skill.param2';
      return [positive(scalar(values[index]) * progression(illuga, 'elementalMastery', { ...input, ascension: 4 }), hit, input),
        negative(hit, { ...input, onField: false }),
        negative(hit, { ...input, party: count === 1 ? ['ningguang'] : count === 2 ? ['ningguang', 'barbara'] : ['ningguang'] }),
        negative(normal, { ...input, values: { ...input.values, 'illuga.nightingaleSpend': false } })];
    }, { role: 'team', refs: sourceStats(illuga, spearMastery.weapon) });
  }

  const shenhe = 'shenhe';
  fromTable(shenhe, 't1', 'icy-quill', flat, 't1', '伤害值提升', 0, numbers => [1, 10].flatMap(rank => {
    const input = { ...peer('kaeya', skill), ascension: rank === 1 ? 0 : 6, ranks: { skill: rank }, values: set('shenhe.quillTap') };
    const amount = numbers[rank - 1] * progression(shenhe, 'attack', input);
    return [positive(amount, skill, input), positive(amount, skill, { ...input, values: set('shenhe.quillHold') }),
      negative(skill, { ...input, values: {} }), negative(normal, input), negative(skill, { ...input, ...peer('lisa', skill) })];
  }), { role: 'team', refs: sourceStats(shenhe) });

  const yunjin = 'yunjin';
  fromTable(yunjin, 't2', 'flying-cloud-base.base', flat, 't2', '伤害值提升', 0, numbers => [1, 10].flatMap(rank => {
    const input = { ...peer('kaeya', normal), ascension: rank === 1 ? 0 : 6, ranks: { burst: rank }, values: set('yunjin.flagFormation'), actions: [action('burst')], application: true };
    return [positive(numbers[rank - 1] * progression(yunjin, 'defense', input), normal, input),
      negative(normal, { ...input, application: false }), negative(skill, { ...input, application: undefined })];
  }), { role: 'team', refs: sourceStats(yunjin) });
  for (const index of [0, 1]) fromText(yunjin, 'a1', 'a1.flag-party', flat,
    /防御力的([\d.]+)%\/([\d.]+)%\/([\d.]+)%\/([\d.]+)%/, values => {
      const base = progression(yunjin, 'defense', { ascension: 4 });
      if (index) return [
        positive(base * scalar(values[3] - 4 * values[0]), normal,
          { ...peer('kaeya', normal, 'amber', 'lisa'), values: set('yunjin.flagFormation') }),
        negative(normal, { ...peer('kaeya', normal, 'amber'), values: set('yunjin.flagFormation') }),
        negative(skill, { ...peer('kaeya', normal, 'amber', 'lisa'), values: set('yunjin.flagFormation') }),
        negative(normal, { ...peer('kaeya', normal, 'amber', 'lisa'), values: set('yunjin.flagFormation', false) }),
      ];
      return [
        ...[[], ['kaeya', 'charlotte'], ['kaeya', 'amber'], ['kaeya', 'amber', 'lisa']].map((party, level) => {
          const recipient = level ? 'kaeya' : yunjin;
          return positive(base * scalar(level === 3 ? 4 * values[0] : values[level]), normal,
            { party, recipient, values: set('yunjin.flagFormation') });
        }),
        negative(skill, { ...peer('kaeya', normal), values: set('yunjin.flagFormation') }),
        negative(normal, { ...peer('kaeya', normal), values: set('yunjin.flagFormation', false) }),
      ];
    }, { role: 'team', index, refs: sourceStats(yunjin) });

  fromText('yelan', 'a1', 'a1.adapt-with-ease', damage, /伤害提高(\d+)%，并且每1秒进一步提高([\d.]+)%，至多使角色造成的伤害提高(\d+)%/,
    ([initial, rate, cap]) => {
      const input = { ...peer('kaeya', normal), values: set('yelan.exquisiteThrowActive') };
      return [...countCases([0, 1, 9, 14, 15], 'yelan.exquisiteSeconds', normal,
        seconds => scalar(Math.min(cap, initial + rate * seconds)), input),
      negative(normal, { ...input, onField: false }),
      negative(normal, { ...input, values: set('yelan.exquisiteThrowActive', false) })];
    }, { role: 'team' });

  for (const traveler of ['aether', 'lumine']) {
    const pyro = traveler + '-pyro', hydro = traveler + '-hydro', dendro = traveler + '-dendro', electro = traveler + '-electro', cryo = traveler + '-cryo';
    fromText(electro, 'c6', 'c6.falling-thunder-multiplier', factor, /下一次威光落雷，造成原本(\d+)%/,
      ([value]) => toggle(scalar(value), 'burst.param2', burst, electro + '.c6EnhancedFallingThunder'));
    for (const [type, phrase, hit] of [
      ['skill', /草缘剑造成的伤害提升([\d.]+)%/, skill], ['burst', /偃草若化造成的伤害提升([\d.]+)%/, burst],
    ]) if (characters.has(dendro)) fromText(dendro, 'a1', 'a1.verdant-luxury-' + type, damage, phrase,
      ([rate]) => plain(scalar(rate) * progression(dendro, 'elementalMastery', { ...swordMastery, ascension: 4 }), hit, normal, swordMastery),
      { refs: sourceStats(dendro, swordMastery.weapon) });
    fromText(hydro, 'a1', 'a1.clear-waters', flat, /消耗的生命值总和的(\d+)%[^]+?伤害提高(\d+)点/, ([rate, cap]) => [
      ...countCases([0, 1000, 14000], hydro + '.suffusionHpConsumed', 'skill.param2', hp => Math.min(cap, hp * scalar(rate))),
      negative(normal, {}),
    ]);
    for (const [index, pattern, key] of [[0, /当前场上角色造成的伤害提升(\d+)%/, 'thresholdActive'],
      [1, /夜魂加持状态，造成的伤害还会提升(\d+)%/, 'recipientNightsoul']]) {
      fromText(pyro, 'c1', 'c1.raging-fire', damage, pattern, ([amount]) => {
        const input = { ...peer('kaeya', normal), values: { [pyro + '.thresholdActive']: true, [pyro + '.recipientNightsoul']: true } };
        return [positive(scalar(amount), normal, input), negative(normal, { ...input, values: { ...input.values, [pyro + '.' + key]: false } }),
          negative(normal, { ...input, onField: false }), negative(normal, { ...input, values: { ...input.values, [pyro + '.thresholdActive']: false } })];
      }, { index, role: 'team' });
    }
    if (characters.has(cryo)) fromText(cryo, 'a0', 'a0.froststar-infused', flat, /相当于旅行者攻击力的(\d+)%/,
      ([amount]) => toggle(scalar(amount) * progression(cryo, 'attack', { ascension: 1 }), normal, skill, cryo + '.cryoFroststarInfusion',
        { values: { radiance: 'stellar-conduct' } }), { refs: sourceStats(cryo) });
  }

  const lohenC1 = source('lohen', 'c1'), lohenC4 = source('lohen', 'c4');
  if (/奇谋状态下[^]+?争胜积攒至上限/.test(lohenC4.text)) {
    const cap = 100 * scalar(Number(/上限提升至原来的(\d+)%/.exec(lohenC1.text)?.[1]));
    fromTable('lohen', 'c4', 'c4.burst-will-cap', factor, 't2', '每点争胜提升原本伤害', 0, numbers => [
      ...countCases([0, 40, 300], 'lohen.will', burst, () => 1 + cap * numbers[0], { values: set('lohen.masterstroke') }),
      negative(normal, { values: set('lohen.masterstroke') }),
      negative(burst, { values: set('lohen.masterstroke', false) }),
    ], { refs: [lohenC1.ref] });
  }

  for (const [slot, grant, constellation] of [['a0', 'a0.flame-a1', 0], ['c2', 'c2.flame-c2', 2]]) {
    const id = 'clorinde', ascension = 1, attack = progression(id, 'attack', { ascension });
    fromText(id, slot, grant, flat, /攻击力的(\d+)%[^]+?至多叠加(\d+)层[^]+?伤害提升(\d+)/,
      ([rate, layers, cap]) => {
        const settings = { ascension, constellation, values: set('clorinde.nightVigil') };
        return [
          ...countCases([0, 1, layers], 'clorinde.brightFlameStacks', burst, count => Math.min(cap, scalar(rate) * attack * count), settings),
          ...countCases([layers], 'clorinde.brightFlameStacks', burst, () => cap, { ...settings, supplemental: { flatAttack: 4000 - attack } }),
          negative(normal, { ...settings, values: { 'clorinde.nightVigil': false, 'clorinde.brightFlameStacks': layers } }),
          negative(burst, { ...settings, constellation: constellation ? 1 : 2, values: { 'clorinde.brightFlameStacks': layers } }),
        ];
      }, { refs: sourceStats(id) });
  }

  const mavuika = 'mavuika';
  const kiongozi = source(mavuika, 'a1');
  const kiongoziRate = /每点战意都将使当前场上角色造成的伤害提升([\d.]+)%[^]+?伤害提升(\d+)%/.exec(kiongozi.text);
  if (kiongoziRate) {
    const [, rate, cap] = kiongoziRate.map(Number);
    const input = { ...peer('kaeya', normal), values: set('mavuika.kiongozi') };
    fromText(mavuika, 'a1', 'kiongozi-damage', damage, /持续(\d+)秒/, () => [
      ...countCases([0, 50, 120, 200], 'mavuika.remainingSpiritBonus', normal,
        count => scalar(Math.min(cap, rate * count)), input),
      negative(normal, { ...input, onField: false, values: { 'mavuika.kiongozi': true, 'mavuika.remainingSpiritBonus': 200 } }),
      negative(normal, { ...input, constellation: 4, values: { 'mavuika.kiongozi': true, 'mavuika.remainingSpiritBonus': 200 } }),
    ], { role: 'team' });
    fromText(mavuika, 'c4', 'c4-kiongozi', damage, /额外获得(\d+)%伤害加成/, ([bonus]) => [
      ...countCases([50, 120, 200], 'mavuika.initialKiongoziSpirit', normal,
        count => scalar(bonus + Math.min(cap, rate * count)), { ...input, ascension: 4, values: { ...input.values, 'mavuika.remainingSpiritBonus': 0 } }),
      negative(normal, { ...input, ascension: 4, onField: false, values: { ...input.values, 'mavuika.initialKiongoziSpirit': 200 } }),
      negative(normal, { ...input, ascension: 4, values: { 'mavuika.kiongozi': false, 'mavuika.initialKiongoziSpirit': 200 } }),
      negative(normal, { ...input, ascension: 3, values: { ...input.values, 'mavuika.initialKiongoziSpirit': 200 } }),
    ], { role: 'team', refs: [kiongozi.ref] });
  }

  for (const [index, parties] of [[[['amber'], 0], [[], 1]], [[['amber', 'bennett'], 0], [['amber'], 1]]].entries()) {
    fromTable('nahida', 't2', 'shrine-pyro-' + (index === 0 ? 'one' : 'two'), damage, 't2', '火：伤害提升', index, values => [
      ...parties.map(([party, constellation]) => positive(values[0], 'skill.param3', { party, constellation, values: set('nahida.inShrine') })),
      negative('skill.param3', { party: parties[0][0], values: set('nahida.inShrine', false) }),
      negative('skill.param3', { party: index ? ['amber'] : ['amber', 'bennett'], values: set('nahida.inShrine') }),
      negative(skill, { party: parties[0][0], values: set('nahida.inShrine') }),
    ], { refs: [source('nahida', 'c1').ref] });
  }

  fromText('prune', 'a1', 'a1.inspiration-damage', damage, /攻击力超过(\d+)的部分[^]+?提升([\d.]+)%，至多提升(\d+)%/,
    ([threshold, rate, cap]) => {
      const input = { ...peer('kaeya', normal), values: set('prune.inspirationWindow') };
      return [...countCases([threshold - 1, threshold, threshold + 1000, threshold + 2000, threshold + 3000],
        'prune.inspirationAttack', normal, amount => scalar(Math.min(cap, rate * Math.max(0, amount - threshold))), input),
      negative(normal, { ...input, recipient: 'prune', values: { ...input.values, 'prune.inspirationAttack': threshold + 1000 } }),
      negative(normal, { ...input, values: { 'prune.inspirationWindow': false, 'prune.inspirationAttack': threshold + 1000 } })];
    }, { role: 'team' });

  const sayu = 'sayu';
  if (characters.has(sayu)) fromText(sayu, 'c6', 'c6.daruma-attack', flat,
    /额外造成([\d.]+)%攻击力的伤害[^]+?至多额外造成(\d+)%攻击力的伤害/, ([rate, cap]) => {
      const input = { ...claymoreMastery, values: { 'aura.pyro': false, 'aura.electro': false } };
      const attack = progression(sayu, 'attack', input);
      return [
        ...[200, 2000, 2400].map(em => positive(attack * scalar(Math.min(cap, em * rate)), 'burst.param4',
          { ...input, supplemental: { elementalMastery: em } })),
        negative(burst, { ...input, supplemental: { elementalMastery: 200 } }),
      ];
    }, { refs: sourceStats(sayu, claymoreMastery.weapon) });

  const sigewinne = 'sigewinne';
  for (const [slot, grant, pattern, constellation] of [
    ['a0', 'a0.rest-flat', /生命值上限超过(\d+)的部分，每(\d+)点生命值上限将提升(\d+)点伤害[^]+?提升(\d+)点/, 0],
    ['c1', 'c1.rest-enhanced-flat', /生命值上限超过(\d+)的部分，每(\d+)点生命值上限将提升(\d+)点[^]+?提升(\d+)点/, 1],
  ]) if (characters.has(sigewinne)) fromText(sigewinne, slot, grant, flat, pattern, ([threshold, basis, rate, cap]) => {
    const input = { ...peer('kaeya', skill), ascension: 1, constellation, onField: false, supplierOnField: true,
      values: { 'sigewinne.restWindow': true, 'sigewinne.restStackRemaining': true } };
    const base = progression(sigewinne, 'hp', input);
    const supplemental = hp => ({ flatHp: hp - base });
    return [
      ...[threshold, threshold + basis, threshold + 123 * basis].map(hp =>
        positive(Math.min(cap, rate * Math.max(0, hp - threshold) / basis), skill, { ...input, supplemental: supplemental(hp) })),
      negative(skill, { ...input, onField: true, supplierOnField: false, supplemental: supplemental(threshold + basis) }),
      negative(skill, { ...input, recipient: sigewinne, onField: false, supplemental: supplemental(threshold + basis) }),
      negative(skill, { ...input, values: { ...input.values, 'sigewinne.restStackRemaining': false }, supplemental: supplemental(threshold + basis) }),
    ];
  }, { role: 'team', refs: sourceStats(sigewinne) });

  const skirk = 'skirk', wither = { 'skirk.withering': true, 'skirk.sevenfold': true };
  for (const index of [0, 1, 2, 3]) fromTable(skirk, 't2', 'wither-rifts-' + index, damage, 't2',
    '汲取0/1/2/3枚虚境裂隙伤害提升', index, values => [1, 10].flatMap(rank => {
      const input = { ascension: rank === 1 ? Number(index > 0) : 6, ranks: { burst: rank }, values: { ...wither, 'skirk.consumedRifts': index } };
      return [positive(values[rank - 1], skill, input), negative(skill, { ...input, values: { ...input.values, 'skirk.withering': false } }),
        negative(skill, { ...input, values: { ...input.values, 'skirk.consumedRifts': (index + 1) % 4 } })];
    }));
  const skirkC2 = source(skirk, 'c2');
  const extraGuile = Number(/至多额外计入(\d+)点/.exec(skirkC2.text)?.[1]);
  const guileText = /至少(\d+)点蛇之狡谋时[^]+?至多通过这种方式计入(\d+)点/.exec(source(skirk, 't2').text);
  if (characters.has(skirk) && guileText && Number.isFinite(extraGuile)) {
    const [, base, limit] = guileText.map(Number);
    for (const constellation of [0, 2]) fromTable(skirk, 't2', 'serpent-guile-' + constellation, flat, 't2', '蛇之狡谋加成', 0, values =>
      [1, 10].flatMap(rank => {
        const input = { constellation, ascension: rank === 1 ? 0 : 6, ranks: { burst: rank } };
        const cap = limit + (constellation ? extraGuile : 0);
        const value = values[rank - 1] * progression(skirk, 'attack', input);
        return [burst, 'burst.param2'].flatMap(hit =>
          countCases([base, base + 5, base + cap, base + cap + 1], 'skirk.serpentGuile', hit,
            count => value * Math.min(cap, count - base), input));
      }), { refs: [skirkC2.ref, ...sourceStats(skirk)] });
  }
  for (const index of [0, 1, 2]) for (const [type, hit, excluded, column] of [
    ['na', skill, burst, index], ['burst', burst, skill, index + 3],
  ]) fromText(skirk, 'a1', 'crossing-' + type + '-' + (index + 1), factor,
    /普通攻击造成原本(\d+)%\/(\d+)%\/(\d+)%[^]+?爆发极恶技·灭造成原本(\d+)%\/(\d+)%\/(\d+)%/, values => [
      positive(scalar(values[column]), hit, { values: { 'skirk.deathCrossingStacks': index + 1, 'skirk.sevenfold': type === 'na' } }),
      negative(hit, { values: { 'skirk.deathCrossingStacks': index, 'skirk.sevenfold': type === 'na' } }),
      negative(excluded, { values: { 'skirk.deathCrossingStacks': index + 1, 'skirk.sevenfold': type === 'burst' } }),
    ]);

  const valeriy = 'valeriy';
  const assault = { ...peer('lisa', skill), values: { 'valeriy.assaultOrder': true, 'valeriy.assaultOrderWindow': true, radiance: 'none' } };
  const assaultExclusions = [
    negative(skill, { ...assault, values: { ...assault.values, 'valeriy.assaultOrderWindow': false } }),
    negative(skill, { ...assault, values: { ...assault.values, 'valeriy.assaultOrder': false } }),
    negative(skill, { ...assault, values: { ...assault.values, radiance: 'stellar-conduct' } }),
    negative(skill, { ...assault, onField: false }),
    negative(skill, { ...assault, ...peer('kaeya', skill) }),
  ];
  if (characters.has(valeriy)) {
    fromTable(valeriy, 't0', 'assault-order', flat, 't0', '雷元素伤害增加', 0, numbers =>
      [1, 10].flatMap(rank => {
        const input = { ascension: rank === 1 ? 0 : 6, ranks: { normal: rank } };
        return [positive(progression(valeriy, 'attack', input) * numbers[rank - 1], skill, { ...assault, ...input }), ...assaultExclusions];
      }), { role: 'team', refs: sourceStats(valeriy) });
    fromText(valeriy, 'a1', 'cannon-potency', flat,
      /不处于辉映·星超导状态：每点消耗的冲击势能[^]+?瓦列里攻击力的([\d.]+)%/, ([rate]) => {
        const amount = progression(valeriy, 'attack', { ascension: 4 }) * scalar(rate);
        const input = { ...assault, values: { ...assault.values, 'valeriy.spentImpactPotential': 40 } };
        return [...countCases([40, 80, 130], 'valeriy.spentImpactPotential', skill, count => count * amount, input),
          ...assaultExclusions.map(row => ({ ...row, settings: { ...row.settings, values: { ...row.settings.values, 'valeriy.spentImpactPotential': 40 } } }))];
      }, { role: 'team', refs: sourceStats(valeriy) });
  }

  const varesa = 'varesa';
  if (characters.has(varesa)) {
    const basicPlunge = 'normal.param7', fieryPlunge = 'normal.param15';
    for (const [slot, grant, phrase, constellation, fiery] of [
      ['a0', 'a0.rainbow-crash-basic', /坠地冲击能额外造成(\d+)%攻击力的伤害/, 0, false],
      ['a0', 'a0.rainbow-crash-fiery', /改为能额外造成(\d+)%攻击力的伤害/, 0, true],
      ['c1', 'c1.rainbow-crash-constant', /坠地冲击都会改为额外造成(\d+)%攻击力的伤害/, 1],
    ]) fromText(varesa, slot, grant, flat, phrase, ([rate]) => {
      const amount = progression(varesa, 'attack', { ascension: 1 }) * scalar(rate);
      const variants = fiery === undefined ? [false, true] : [fiery];
      return variants.flatMap(state => {
        const hit = state ? fieryPlunge : basicPlunge;
        const input = { ascension: 1, constellation, values: { 'varesa.fieryPassion': state, 'varesa.rainbowCrashReady': true } };
        return [positive(amount, hit, input),
          negative(hit, { ...input, values: { ...input.values, 'varesa.rainbowCrashReady': false } }),
          negative(state ? 'normal.param14' : 'normal.param6', input),
          ...constellation ? [] : [negative(hit, { ...input, constellation: 1 })]];
      });
    }, { refs: sourceStats(varesa) });
    fromText(varesa, 'c4', 'c4.refined-valor', flat, /基于瓦雷莎攻击力的(\d+)%[^]+?至多通过这种方式提升(\d+)/,
      ([rate, cap]) => {
        const base = progression(varesa, 'attack');
        return [positive(base * scalar(rate), basicPlunge, { values: set('varesa.refinedValor') }),
          positive(cap, basicPlunge, { values: set('varesa.refinedValor'), supplemental: { flatAttack: 5000 - base } }),
          negative(basicPlunge, { values: set('varesa.refinedValor', false) }),
          negative('normal.param6', { values: set('varesa.refinedValor') })];
      }, { refs: sourceStats(varesa) });
  }

  for (const [index, parties] of [[['sucrose'], ['amber', 'bennett']], [['sucrose', 'amber', 'bennett']]].entries()) {
    const grant = 'expedition-' + ['single', 'dual'][index] + '-pair';
    fromText('varka', 'a0', grant, factor, /四风将起将造成原本(\d+)%[^]+?上述效果提升至(\d+)%/, values => [
      ...parties.map(party => positive(scalar(values[index]), 'skill.param4', { party, values: set('varka.stance') })),
      negative('skill.param4', { party: ['amber'], values: set('varka.stance') }),
      negative('skill.param4', { party: index ? ['sucrose'] : ['sucrose', 'amber', 'bennett'], values: set('varka.stance') }),
      negative(normal, { party: parties[0], values: set('varka.stance', false) }),
    ]);
  }
  for (const [grant, hit, excluded, input] of [
    ['azure-oath', normal, skill, {}], ['azure-oath-special', 'skill.param14', 'burst.param2',
      { party: ['amber'], values: { 'varka.stance': true } }],
  ]) fromText('varka', 'a1', grant, damage, /四风将起造成的伤害提升([\d.]+)%[^]+?至多叠加(\d+)层/,
    ([rate, cap]) => [...countCases([0, 1, cap], 'varka.azureOath', hit, count => scalar(count * rate), input), negative(excluded, input)]);

  fromText('vesna', 'a0', 'discipline.ordinary.effect', factor, /至多叠加(\d+)层[^]+?造成原本(\d+)%\+整肃层数\*(\d+)%/,
    ([cap, original, perStack]) => [
      ...countCases([0, 1, cap], 'vesna.disciplineStacks', 'skill.param4', count => scalar(original + perStack * count),
        { values: { 'vesna.stance': true, radiance: 'none' } }),
      negative(normal, { values: set('vesna.disciplineStacks', cap) }),
    ]);

  const wriothesley = 'wriothesley';
  const edict = source(wriothesley, 'a1');
  const edictCap = Number(/(?:至多|最多)叠加(?:至)?(\d+)层/.exec(edict.text)?.[1]);
  fromText(wriothesley, 'c2', 'c2.prosecution-burst', damage, /每层「检偿之敕」效果都将使造成的伤害提升(\d+)%/, ([rate]) => {
    const input = { ascension: 4, values: set('wriothesley.chillingPenalty') };
    return [...countCases([0, 1, edictCap], 'wriothesley.prosecutionEdictStacks', burst, count => scalar(count * rate), input),
      negative('normal.param7', { ...input, values: { ...input.values, 'wriothesley.prosecutionEdictStacks': edictCap } }),
      negative(burst, { ...input, values: { 'wriothesley.chillingPenalty': false, 'wriothesley.prosecutionEdictStacks': edictCap } }),
      negative(burst, { ...input, ascension: 3, values: { ...input.values, 'wriothesley.prosecutionEdictStacks': edictCap } })];
  }, { refs: [edict.ref] });

  const xianyun = 'xianyun';
  if (characters.has(xianyun)) fromText(xianyun, 'c2', 'c2.adeptal-assistance', flat,
    /闲云的攻击力的(\d+)%[^]+?坠地冲击伤害提升(\d+)/, ([rate, cap]) => {
      const hit = 'normal.param10';
      const input = { ...peer('kaeya', hit), ascension: 4, values: set('xianyun.adeptalAssistanceTarget') };
      const base = progression(xianyun, 'attack', input);
      return [positive(base * scalar(rate), hit, input),
        positive(cap, hit, { ...input, supplemental: { flatAttack: 5000 - base } }),
        negative(hit, { ...input, onField: false }),
        negative(hit, { ...input, values: set('xianyun.adeptalAssistanceTarget', false) }),
        negative(hit, { ...input, ascension: 3 }),
        negative('normal.param9', { ...input, values: set('xianyun.adeptalAssistanceTarget', false) })];
    }, { role: 'team', refs: sourceStats(xianyun) });

  fromText('xilonen', 'a0', 'a0.unconverted-samples', damage,
    /少于两枚经过元素转化[^]+?普通攻击与下落攻击造成的伤害提升(\d+)%/, ([rate]) => {
      const values = set('xilonen.nightsoul');
      return [
        positive(scalar(rate), 'normal.roller10', { values }),
        positive(scalar(rate), 'normal.roller8', { values, party: ['amber'] }),
        negative('normal.roller10', { values, party: ['amber', 'kaeya'] }),
        negative('normal.roller8', { values, party: ['amber', 'bennett'] }),
        negative(skill, { values }),
      ];
    });

  const nicole = 'nicole';
  if (characters.has(nicole)) fromText(nicole, 'c4', 'c4.guiding-favor', flat, /相当于尼可攻击力的(\d+)%/, ([rate]) => {
    const input = { ...peer('kaeya', normal), values: set('nicole.guideProtection') };
    const amount = scalar(rate) * progression(nicole, 'attack');
    return [
      positive(amount, normal, input), positive(amount, skill, { ...input, onField: false, supplierOnField: true }),
      negative(normal, { ...input, values: set('nicole.guideProtection', false) }),
      negative(normal, { ...input, recipient: nicole, values: set('nicole.guideProtection', false) }),
    ];
  }, { role: 'team', refs: sourceStats(nicole) });

  const nefer = 'nefer', neferC2 = source(nefer, 'c2');
  const veilCap = /上限提升至(\d+)层[^]+?原本(\d+)%/.exec(neferC2.text);
  if (veilCap) fromText(nefer, 'a0', 'phantasm-veil', factor, /该效果叠加至(\d+)层/, ([max]) => {
    const [, enhancedMax, damageAtCap] = veilCap.map(Number);
    // The C2 source ties the enhanced stack count to 140%. The same 8% per-stack rate is given in the in-game help.
    const perStack = (scalar(damageAtCap) - 1) / enhancedMax;
    const expected = count => 1 + count * perStack;
    const values = { 'nefer.phantasm': true, fullMoonsign: true };
    return [
      ...['skill.param5', 'skill.param7'].flatMap(hit =>
        countCases([0, 1, max], 'nefer.phantasmVeil', hit, expected, { party: ['aino'], values })),
      ...countCases([1, max, enhancedMax], 'nefer.phantasmVeil', 'skill.param7', expected, { constellation: 2, party: ['aino'], values }),
      negative(skill, {}), negative('skill.param5', { party: ['aino'], values: { 'nefer.phantasm': false, fullMoonsign: true } }),
    ];
  }, { refs: [neferC2.ref, 'https://library.keqingmains.com/characters/dendro/nefer#ascension-1'] });
  return output;
}
