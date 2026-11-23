import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/talents/';
const raw = 'attribute.shieldAbsorption';
const cap = 'attribute.shieldAbsorptionCap';
const effective = 'attribute.effectiveShieldAbsorption';
const owner = 'actor';
const peer = 'peer';
const minLevel = [1, 20, 40, 50, 60, 70, 80];
const actor = id => ({ kind: 'actor', id });
const flag = value => value === null ? fact(null) : bool(value);
const elementFact = value => fact({ kind: 'enum', value });
const close = (actual, expected) => Number.isFinite(actual) && Number.isFinite(expected)
  && Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
const known = row => row.status === 'known' && close(row.value, row.expected);
const failed = row => row.issue || Number.isFinite(row.expected) && !known(row);
const talentRef = (entity, slot) => capture + entity + '.json#combat' + (slot + 1);

// [character, talent index, buff index, grant suffix, explicit shield state, active value, optional cap]
const talentShields = [
  ['baizhu', 2, 0, '', 'gossamerShieldActive', true],
  ['beidou', 1, 0, '', 'tidecallerGuard', true],
  ['candace', 1, 0, '', 'sacredRiteGuard', true],
  ['citlali', 1, 0, '', 'opalShieldActive', true],
  ['dahlia', 2, 0, '', 'sacredFavorShieldActive', true],
  ['diona', 1, 0, '.tap', 'icyPawsShieldMode', 'tap'],
  ['diona', 1, 1, '.hold', 'icyPawsShieldMode', 'hold'],
  ['ineffa', 1, 0, '', 'flowingLightBarrierActive', true],
  ['kirara', 1, 0, '', 'safeTransportShieldActive', true, true],
  ['lanyan', 1, 0, '', 'swallowWispShieldActive', true],
  ['layla', 1, 0, '', 'curtainOfSlumberActive', true],
  ['nicole', 1, 1, '', 'brillianceShieldActive', true],
  ['noelle', 1, 0, '', 'breastplateShieldActive', true],
  ['thoma', 1, 0, '.skill', 'blazingBarrierShieldSource', 'skill', true],
  ['thoma', 2, 0, '.burst', 'blazingBarrierShieldSource', 'burst', true],
  ['valeriy', 1, 0, '', 'stormShieldActive', true],
  ...[1, 2, 3].map(level => ['xinyan', 1, level - 1, '.level-' + level, 'sweepingFervorShieldLevel', 'level-' + level]),
  ['yunjin', 1, 0, '', 'openingFlourishGuard', true],
  ['zhongli', 1, 0, '', 'jadeShieldActive', true],
];

const constellationShields = [
  ['beidou', 1, 'c1-shield', 'electro', 'mixedBuffs'],
  ['kaeya', 4, 'c4.frozen-kiss', 'cryo', 'remainingShieldGrants'],
  ['kirara', 2, 'c2-shield', 'dendro', 'mixedBuffs'],
  ['layla', 1, 'c1.curtain-of-slumber-coop', 'cryo', 'partyDefense'],
  ['yanfei', 4, 'c4-shield', 'pyro', 'mixedBuffs'],
  ...['aether-hydro', 'lumine-hydro'].map(entity => [entity, 4, 'c4.torrent-surge-shield', 'hydro', 'mixedBuffs']),
];

function talentSettings(row) {
  return { constellation: row.constellation, ascension: row.constellation === 0 ? 0 : 6,
    level: row.constellation === 0 ? 1 : 90, skill: row.baseTalentLevel, burst: row.baseTalentLevel };
}

function talentInput(row, entity, key) {
  const { recipient, onField, input } = row;
  const facts = [[actor(owner), 'onField', bool(recipient === owner && onField)],
    [actor(peer), 'onField', bool(recipient === peer && onField)]];
  if (input === null) facts.push([actor(owner), key, fact(null)]);
  if (entity === 'kirara') facts.push([actor(peer), 'kirara.criticalTransportShieldActive', bool(false)]);
  if (entity === 'layla') {
    facts.push([actor(owner), 'layla.curtainOfSlumberCoopShield', bool(false)],
      [actor(peer), 'layla.curtainOfSlumberCoopShield', bool(false)],
      [actor(recipient), key, flag(input)]);
    if (recipient === peer) facts.push([actor(owner), key, bool(false)]);
  }
  return { recipient, facts, gates: input === null ? {} : { [key]: input } };
}

function incomingInput(audit, probe) {
  const { recipient, query = {}, category, values = [], facts = [], ownerOnField = recipient === owner,
    peerOnField = recipient === peer, eventFacts = {}, actorFacts = {} } = probe.input;
  if (audit === 'mixedBuffs') return { recipient, query, facts: values };
  return {
    recipient, category, query: { ...query, ...eventFacts },
    facts: [[actor(owner), 'onField', flag(ownerOnField)], [actor(peer), 'onField', flag(peerOnField)],
      [actor(peer), 'hpRatio', number('scalar', 1)],
      ...facts.map(([id, key, value]) => [actor(id), key, value]),
      ...Object.entries(actorFacts).flatMap(([id, fields]) => Object.entries(fields).map(([key, value]) => [actor(id), key, value]))],
  };
}

/** Associate known shield readings with the exact contributions of the listed calculator modifiers. */
export function shieldModifierEvidence(entities, results, engine) {
  const output = [];
  const existing = new Set(results.registeredModifierEvidence?.map(row => row.key));
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const starter = character => weapons.get(novice[character?.identity.weaponType]);
  const partner = characters.get('kaeya');
  if (!starter(partner)) return output;
  const teams = new Map();

  function build(character, { ascension = 0, level = minLevel[ascension], constellation = 0, skill = 1, burst = 1 } = {}) {
    return { ...auditBuild(character, starter(character)), ascension, level, constellation, talents: { normal: 1, skill, burst } };
  }

  function replay(character, settings, { recipient, category, facts, gates = {}, query = {} }, target) {
    const teamKey = JSON.stringify([character.id, settings]);
    if (!teams.has(teamKey)) {
      const prepared = engine.prepareStructuredBuilds([{ id: owner, build: build(character, settings) },
        { id: peer, build: build(partner) }]);
      teams.set(teamKey, prepared.ok ? prepared.team : null);
    }
    const team = teams.get(teamKey);
    const dealer = recipient === owner ? character : partner;
    const talent = dealer.talents[0], hit = talent.hits.find(row => !category || row.category === category);
    if (!team || !hit) return;
    const { setup, request } = auditHit(dealer, talent, hit);
    setup.events.find(event => event.id === 'hit').actorId = recipient;
    const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
      hit: { skillId: talent.id, hitId: hit.id, category: hit.category, family: 'ordinary', origin: hit.origin,
        element: hit.element, reactionId: null } };
    setAuditDefaults(character, frame);
    setGateFacts(character, frame, gates);
    Object.assign(frame.facts, query);
    for (const [subject, key, value] of facts) {
      let override = frame.factOverrides.find(row => row.subject.kind === subject.kind && row.subject.id === subject.id);
      if (!override) frame.factOverrides.push(override = { subject, facts: {} });
      override.facts[key] = value;
    }
    const context = engine.createStructuredCombatContext(team, setup);
    const reading = engine.evaluateCombatBindings(team.program, context, { shield: { kind: 'attribute',
      actor: { role: 'recipient' }, key: { namespace: 'builtin', id: target, revision: '1' }, at: { kind: 'current', phase: 'same' } } }, frame);
    return reading;
  }

  function check(entity, field, id, target, audit, modifiers, probes, scope) {
    const character = characters.get(entity);
    const buff = field.slice(1).split('/').reduce((value, part) => value?.[part], character?.metadata);
    if (!starter(character) || buff?.id !== id || probes.some(probe => !probe.sources?.length)) return;
    const candidates = modifiers.flatMap(modifier => {
      const pointer = field + '/modifiers/' + modifier;
      const key = entity + pointer;
      if (existing.has(key) || buff.modifiers[modifier]?.target !== target) return [];
      const choices = (results.calculator?.buffs ?? []).filter(row => row.entity === entity && row.field === pointer && row.listed && !row.issue);
      const ruleId = modifier ? id + '.' + modifier : id;
      const role = buff.modifiers[modifier].recipient ?? buff.recipient ?? 'owner';
      const definitions = character.calculation.bundle.effects.filter(effect => effect.identity.id === ruleId
        && (effect.buff ?? effect.identity).id === id && effect.target.kind === 'attribute' && effect.target.attribute.id === target
        && effect.recipient.role === role);
      if (choices.length !== 1 || choices[0].id !== id || choices[0].target !== target
        || choices[0].role !== role || definitions.length !== 1) return [];
      return [{ key, field: pointer, modifier, identity: definitions[0].identity, cases: [] }];
    });
    if (!candidates.length) return;
    for (const { settings, input, total, contribution } of probes) {
      const reading = replay(character, settings, input, target);
      const value = reading?.outputs.shield;
      if (value?.state !== 'known' || value.value.kind !== 'quantity' || value.value.unit !== 'hp' || !close(value.value.value, total)) return;
      for (const candidate of candidates) {
        const { identity } = candidate;
        const traces = reading.trace.filter(node => node.kind === 'effect' && node.definition.id === identity.id
          && node.definition.namespace === identity.namespace && node.definition.revision === identity.revision
          && node.context?.actorId === owner && node.context.recipientId === input.recipient);
        const [trace] = traces;
        const actual = !trace ? 0 : traces.length === 1 && trace.state === 'known'
          && trace.value?.kind === 'quantity' && trace.value.unit === 'hp' ? trace.value.value : NaN;
        const expected = contribution(candidate.modifier);
        candidate.cases.push({ actual, expected, settings: { supplier: entity, ...settings, ...input } });
      }
    }
    const refs = [...new Set(probes.flatMap(probe => probe.sources))];
    for (const { key, field: pointer, modifier, cases } of candidates) {
      const active = cases.filter(row => row.expected > 0);
      if (active.length < 2 || !cases.some(row => row.expected === 0) || !cases.every(row => close(row.actual, row.expected))) continue;
      const [first] = active;
      const { actual, expected } = first;
      output.push({ key, entity, field: pointer, id, modifier, target, audit, actual, expected, refs, scope,
        cases: [first, ...cases.filter(row => row !== first)] });
    }
  }

  for (const [entity, slot, index, suffix, state, mode, hasCap] of talentShields) {
    const id = entity + '.shield-absorption' + suffix;
    const field = '/talents/' + slot + '/buffs/' + index;
    const key = entity + '.' + state;
    for (const target of hasCap ? [raw, cap] : [raw]) {
      const rows = (results.shields?.rows ?? []).filter(row => row.entity === entity && row.attribute === target
        && (entity !== 'zhongli' || row.part === 'flat' && Number.isFinite(row.component)));
      if (rows.some(failed)) continue;
      const probes = rows.filter(known).map(row => ({
        settings: talentSettings(row), input: talentInput(row, entity, key), total: row.expected,
        contribution: () => row.mode === mode ? row.expected : 0,
        sources: [...row.sources, talentRef(entity, slot)],
      }));
      if (entity === 'thoma' && target === cap) {
        // An unequal talent build distinguishes the shared skill cap from the burst's own starting amount.
        const maximum = probes.find(probe => probe.settings.ascension === 6 && probe.contribution() > 0);
        if (maximum) probes.push({ ...maximum, settings: { ...maximum.settings, burst: 1 } });
      }
      check(entity, field, id, target, 'shields', [target === cap ? 1 : 0], probes,
        '按正式技能等级、施放者面板、护盾状态和受益者核验单条原始吸收量或上限。');
    }
  }

  for (const [entity, rank, suffix, favored, audit] of constellationShields) {
    const clause = '/constellations/' + (rank - 1);
    const rows = (results[audit]?.rows ?? []).filter(row => row.entity === entity && row.field === clause && row.output === effective);
    if (rows.some(failed)) continue;
    const probes = rows.filter(known).map(row => {
      const input = incomingInput(audit, row.probe);
      const incoming = input.query.incomingShieldElement?.value?.value;
      const isCoop = entity !== 'layla' || input.recipient === peer
        && row.probe.input.actorFacts[peer]['layla.curtainOfSlumberActive']?.value?.value === false;
      return { settings: row.probe.settings, input, total: row.expected, sources: row.sources,
        contribution: modifier => isCoop && (incoming === favored) === (modifier === 1) ? row.expected : 0 };
    });
    check(entity, clause + '/buffs/0', entity + '.' + suffix, effective, audit, [1, 2], probes,
      '核验明确护盾和受益者的同元素及其他来伤吸收量，区分互斥的单条贡献。');
  }

  if (characters.has('layla')) {
    const entity = 'layla', key = 'layla.curtainOfSlumberActive', path = talentRef(entity, 1);
    const source = readContentSource(new URL('../../' + path.split('#')[0], import.meta.url));
    const multiplier = Number(/对冰元素伤害有(\d+)%的吸收效果/.exec(source.combat2.description)?.[1]) / 100;
    const rows = (results.shields?.rows ?? []).filter(row => row.entity === entity && row.attribute === raw);
    if (Number.isFinite(multiplier) && multiplier > 1 && !rows.some(failed)) {
      const probes = rows.filter(known).flatMap(row => ['cryo', 'physical'].map(incoming => {
        const total = row.expected * (incoming === 'cryo' ? multiplier : 1);
        return { settings: talentSettings(row), input: { ...talentInput(row, entity, key), query: { incomingShieldElement: elementFact(incoming) } },
          total, sources: [...row.sources, path], contribution: modifier => (incoming === 'cryo') === (modifier === 1) ? total : 0 };
      }));
      check(entity, '/talents/1/buffs/0', 'layla.shield-absorption', effective, 'shields', [1, 2], probes,
        '按战技固定原文核验主护盾的冰来伤倍率及其他来伤吸收量，覆盖本人和在场队友。');
    }
  }
  return output;
}
