import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';

const sourcePath = 'tools/data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/variable-weapon-conditions.json';
const evidence = readContentSource(new URL('../../' + sourcePath, import.meta.url));
const output = 'attribute.attackPercent';
const target = { namespace: 'builtin', id: output, revision: '1' };
const binding = { kind: 'attribute', key: target, actor: { role: 'recipient' }, at: { kind: 'current', phase: 'same' } };
const tolerance = 1e-8;
const close = (actual, expected) => expected === null ? actual === null
  : Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;

const configurations = [
  {
    entity: 'ultimateoverlordsmegamagicsword',
    holder: 'noelle',
    state: 'melusineSupportState',
    mode: '按任务进度',
    input: 'melusineTaskCount',
    unit: 'count',
    buff: 'melusine-task-support',
    legacy: { 无声援: null, 满额声援: 'melusine-support' },
    resolved: '原始武器配置核验了12个声援任务检查项。按当前已完成项数与当前精炼计算，额外攻击力最多按六项计。',
    probes({ addProps, paramList: [, perTask, cap] }, source) {
      const base = addProps.find(prop => prop.propType === 'FIGHT_PROP_ATTACK_PERCENT').value;
      const checks = source.quests.records.length;
      const boundary = Math.round(cap / perTask);
      const states = Array.from({ length: checks + 1 }, (_, input) => ({ input, contribution: Math.min(input * perTask, cap) }));
      return { base, probes: [
        ...states,
        { input: checks + 1, contribution: null },
        { input: null, contribution: null },
        { state: null, input: 3, contribution: null },
        { state: '无声援', input: boundary - 1, contribution: 0 },
        { state: '满额声援', input: boundary - 1, contribution: cap },
        { input: 3, onField: false, contribution: 3 * perTask },
        { input: 3, recipient: 'peer', contribution: 0 },
        { input: 3, repeat: true, contribution: 3 * perTask },
      ] };
    },
  },
  {
    entity: 'hereticsmoltenblade',
    holder: 'kaeya',
    state: 'firstLightState',
    mode: '按上一秒移动距离',
    input: 'firstLightPreviousSecondDistance',
    unit: 'scalar',
    buff: 'first-light-distance',
    legacy: { 无效果: null, 最低加成: 'first-light-minimum', 最高加成: 'first-light-maximum' },
    resolved: '原始武器配置核验了初光按上一秒移动距离换算攻击力的公式、7米上限及退场移除。',
    probes({ paramList: [, , min, max, distance] }) {
      const probes = [0, 0.01, 1, distance / 2, distance - 0.01, distance, distance + 0.01, 2 * distance]
        .map(input => ({ input, contribution: min + (max - min) * Math.min(input, distance) / distance }));
      return { base: 0, probes: [
        ...probes,
        { input: -0.01, contribution: null },
        { input: null, contribution: null },
        { state: null, input: distance / 2, contribution: null },
        { state: '无效果', input: distance / 2, contribution: 0 },
        { state: '最低加成', input: distance / 2, contribution: min },
        { state: '最高加成', input: distance / 2, contribution: max },
        { input: distance / 2, onField: false, contribution: 0 },
        { input: null, onField: false, contribution: 0 },
        { input: distance / 2, recipient: 'peer', contribution: 0 },
        { input: distance / 2, repeat: true, contribution: (min + max) / 2 },
      ] };
    },
  },
];

function relevantEffects(reading) {
  const needed = new Set([reading.outputs.value?.traceId]);
  const effects = [];
  for (const node of reading.trace.toReversed()) {
    if (!needed.has(node.id)) continue;
    for (const dependency of node.dependencies) needed.add(dependency);
    if (node.kind === 'effect' && node.state === 'known' && node.value?.kind === 'quantity') effects.push(node.definition.id);
  }
  return effects;
}

/** Compare current weapon outputs with the pinned game ability and affix extracts. */
export function auditVariableWeaponConditions(entities, engine) {
  const rows = [], resolved = [], gaps = [], verified = new Set();
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  for (const config of configurations) {
    const { entity, holder: holderId, state: stateName, mode, input: inputName, unit, buff } = config;
    const weapon = weapons.get(entity);
    if (!weapon) continue;
    const id = entity + '.' + buff;
    const modifierIndex = weapon.metadata.buffs?.findIndex(buff => buff.id === id) ?? -1;
    const clause = '/buffs';
    const field = modifierIndex === -1 ? clause : clause + '/' + modifierIndex + '/modifiers/0';
    const source = evidence[entity], sources = [sourcePath + '#/' + entity + '/affixes', sourcePath + '#/' + entity + '/ability'];
    if (source.quests) sources.push(sourcePath + '#/' + entity + '/quests');
    const pointer = { entity, field, clause, id, output, sources };
    const holder = characters.get(holderId);
    const peer = characters.get(holderId === 'kaeya' ? 'noelle' : 'kaeya');
    const starter = peer && weapons.get(novice[peer.identity.weaponType]);
    if (!holder || !peer || !starter || modifierIndex === -1 || weapon.maxRefinement !== source.affixes.records.length) {
      gaps.push({ ...pointer, reason: '缺少武器增益、合法精炼档或独立核验配装。' });
      continue;
    }
    const start = rows.length;
    for (const [index, affix] of source.affixes.records.entries()) {
      const rank = index + 1;
      const prepared = engine.prepareStructuredBuilds([
        { id: 'actor', build: { ...auditBuild(holder, weapon), refinement: rank } },
        { id: 'peer', build: auditBuild(peer, starter) },
      ]);
      if (!prepared.ok) throw new Error(entity + ' ' + JSON.stringify(prepared.diagnostics));
      const { team } = prepared;
      const { base, probes } = config.probes(affix, source);
      for (const { state = mode, input, recipient = 'actor', onField = true, repeat = false, contribution } of probes) {
        const actor = recipient === 'actor' ? holder : peer;
        const talent = actor.talents[0], hit = talent.hits[0];
        const { setup, request } = auditHit(actor, talent, hit);
        setAuditDefaults(holder, request.frame);
        const facts = request.frame.factOverrides[0].facts;
        facts.onField = bool(onField);
        if (state !== null) facts[entity + '.' + stateName] = fact({ kind: 'enum', value: state });
        if (input !== null) facts[entity + '.' + inputName] = number(unit, input);
        request.frame.factOverrides.push({ subject: { kind: 'actor', id: 'peer' }, facts: { onField: bool(!onField) } });
        const event = setup.events.find(event => event.id === request.frame.eventId);
        event.actorId = recipient;
        if (repeat) setup.events.push({ ...event, id: 'next-hit', timeMs: event.timeMs + 1, order: event.order + 1 });
        const context = engine.createStructuredCombatContext(team, setup);
        const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
          hit: { category: hit.category, element: hit.element, family: 'ordinary', origin: 'talent', reactionId: null,
            skillId: talent.id, hitId: hit.id } };
        const readings = [engine.evaluateCombatBindings(team.program, context, { value: binding }, frame)];
        if (repeat) readings.push(engine.evaluateCombatBindings(team.program, context, { value: binding }, { ...frame, eventId: 'next-hit' }));
        const expectedActive = contribution > 0 || (unit === 'count' && state === mode && input === 0)
          ? [entity + '.' + (state === mode ? buff : config.legacy[state])] : [];
        for (const [readingIndex, reading] of readings.entries()) {
          const value = reading.outputs.value;
          const total = value?.state === 'known' ? value.value.value : null;
          const expectedTotal = contribution === null ? null : (recipient === 'actor' ? base : 0) + contribution;
          const effects = relevantEffects(reading).filter(effect => effect.startsWith(entity + '.') && effect !== entity + '.attackPercent');
          const actual = total === null ? null : effects.includes(id) ? total - (recipient === 'actor' ? base : 0) : 0;
          const expected = contribution === null ? null : state === mode ? contribution : 0;
          const matches = close(total, expectedTotal) && close(actual, expected)
            && (expectedTotal === null || JSON.stringify(effects) === JSON.stringify(expectedActive));
          rows.push({ ...pointer, rank, holder: holderId, recipient, state, input, onField, repeat: readingIndex > 0,
            value: actual, actual, expected, total, expectedTotal, effects,
            ...(matches ? {} : { issue: '武器当次攻击力加成、条件或授予次数与原始配置不符。' }) });
        }
      }
    }
    if (rows.slice(start).every(row => !row.issue)) {
      verified.add(entity + field);
      resolved.push({ ...pointer, resolved: config.resolved });
    } else {
      gaps.push({ ...pointer, reason: '尚有武器当次攻击力输出与原始配置不符。' });
    }
  }
  return { rows, verified, resolved, gaps, summary: {
    variableWeaponConditionCases: rows.length,
    variableWeaponConditionMismatches: rows.filter(row => row.issue).length,
    verifiedVariableWeaponConditions: verified.size,
    variableWeaponConditionGaps: gaps.length,
  } };
}
