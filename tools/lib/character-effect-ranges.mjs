import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, elements, novice, projectQuery, setAuditDefaults } from './roster-audit-settings.mjs';

const catalogue = 'tools/data/sources/catalog/character-effect-ranges.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const { capture, entries, qualitative } = read(catalogue);
const patterns = {
  'attribute.attackRangeBonus': /攻击范围提升(\d+)%/,
  'attribute.impactRangeBonus': /影响范围(?:提升|扩大)(\d+)%/,
  'attribute.flameReachBonus': /喷火距离提高(\d+)%/,
};
const enemy = { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])),
  defenseReduction: 0, defenseIgnore: 0 };

function pinnedEntry(entity, source, talent, labels) {
  const [path, key] = source.split('#');
  const { description } = read(capture + path)[key];
  const talentPath = capture + 'talents/' + entity + '.json';
  const talentText = read(talentPath)[talent];
  const category = talent === 'combat2' ? 'skill' : 'burst';
  const hits = labels.map(label => {
    const line = talentText.attributes.labels.find(row => row.split('|')[0] === label);
    const parameter = line?.match(/\|\{(param\d+):/)?.[1];
    if (!parameter) throw new Error(entity + ' 缺少固定技能表参数 ' + label);
    return entity + '.' + category + '.' + parameter;
  });
  return { description, hits, rank: key.startsWith('c') ? Number(key.slice(1)) : 0,
    ascension: key === 'passive1' ? 1 : 0,
    sources: [capture + source, talentPath + '#' + talent, catalogue + '#scope'] };
}

function axes(character, weapon, cases) {
  const source = { kind: 'preset', reference: character.dataVersion, verified: false };
  const actors = cases.map(({ id, ascension, constellation }) => ({
    id, character: 'character', weapon: 'weapon', inputs: {},
    build: { ...auditBuild(character, weapon), level: ascension > 0 ? 40 : 1, ascension, constellation },
  }));
  return {
    schemaVersion: character.schemaVersion, rulesVersion: 'timeline-v1', id: 'character-range-' + character.id, revision: '1',
    candidate: { id: 'query', actors },
    definitions: [
      { id: 'character', version: '1', source, nodes: [], effects: [] },
      { id: 'weapon', version: '1', source, nodes: [], effects: [] },
      { id: 'query', version: '1', source, nodes: [{ id: 'damage', op: 'game-damage' }], damage: 'damage', effects: [] },
    ],
    conditions: {}, objective: {}, enemy,
  };
}

function eventFor(character, { id, actor, hitId, onField }, order) {
  const talent = character.talents.find(talent => talent.hits.some(hit => hit.id === hitId));
  const hit = talent?.hits.find(hit => hit.id === hitId);
  if (!hit) throw new Error(character.id + ' 缺少命中 ' + hitId);
  const { request } = auditHit(character, talent, hit);
  setAuditDefaults(character, request.frame);
  request.frame.factOverrides[0].facts.onField = bool(onField);
  const damage = projectQuery(request);
  const subject = damage.facts.find(row => row.subject.kind === 'actor');
  subject.subject.id = actor;
  return { id, actor, timeMs: 1000 + order, order, kind: 'damage', definition: 'query', damage };
}

function probes(hits, exclude, normal, amount) {
  return [
    ...hits.flatMap(hitId => [
      { id: 'unlocked-' + hitId, actor: 'owner', hitId, expected: amount, onField: true },
      { id: 'off-field-' + hitId, actor: 'owner', hitId, expected: amount, onField: false },
      { id: 'locked-' + hitId, actor: 'locked', hitId, expected: 0, onField: true },
      { id: 'duplicate-' + hitId, actor: 'duplicate', hitId, expected: amount, onField: true },
    ]),
    ...[normal, ...exclude].map(hitId => ({ id: 'unrelated-' + hitId, actor: 'owner', hitId, expected: 0, onField: true })),
  ];
}

export function auditCharacterEffectRanges(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const addGap = (entity, field, sources, reason) => gaps.push({ entity, field, kind: '角色效果范围', sources, needed: reason, reason });
  for (const { entity, field, source, talent, hits, exclude, effect, output, remaining, related = [] } of entries) {
    const character = entities.characters.find(item => item.id === entity);
    if (!character) continue;
    const weapon = entities.weapons.find(item => item.id === novice[character.identity.weaponType]);
    const pinned = pinnedEntry(entity, source, talent, hits);
    const { ascension, rank, description, sources } = pinned;
    sources.push(...related.map(reference => capture + reference));
    const clause = field.split('/').slice(0, 3).join('/');
    const expected = Number(description.match(patterns[output])?.[1]) / 100;
    const declaration = field.slice(1).split('/').reduce((object, key) => object?.[key], character.metadata);
    if (!weapon || !Number.isFinite(expected) || declaration?.target !== output) {
      rows.push({ entity, field, effect, output, expected: Number.isFinite(expected) ? expected : null, value: null, sources,
        issue: '固定资料或范围贡献声明不完整。' });
      continue;
    }
    const actors = [
      { id: 'owner', ascension, constellation: rank },
      { id: 'locked', ascension: Math.max(0, ascension - 1), constellation: Math.max(0, rank - 1) },
      { id: 'duplicate', ascension, constellation: rank },
    ];
    const cases = probes(pinned.hits, exclude, character.talents[0].hits[0].id, expected);
    const project = axes(character, weapon, actors);
    project.timeline = cases.map((probe, index) => eventFor(character, probe, index));
    const result = engine.evaluateTimeline(project);
    const points = new Map(result.points.map(point => [point.id, point]));
    if (entity === 'chiori') {
      // C1's additional summon has a team condition. Its separate range increase applies with Chiori alone.
      const solo = { id: 'solo-tamoto', actor: 'owner', hitId: pinned.hits[0], expected, onField: true };
      const singleActorProject = axes(character, weapon, [actors[0]]);
      singleActorProject.timeline = [eventFor(character, solo, 0)];
      const [point] = engine.evaluateTimeline(singleActorProject).points;
      if (point) points.set(point.id, point);
      cases.push(solo);
    }
    const amberCrit = entity === 'amber' ? Number(description.match(/暴击率提高(\d+)%/)?.[1]) / 100 : null;
    const checks = cases.map(probe => {
      const point = points.get(probe.id), real = point?.real;
      const value = real?.panel.attributes?.[output.slice('attribute.'.length)] ?? null;
      const seen = real?.panel.effectValues?.filter(row => row.modifierId === effect) ?? [];
      const usedInDamage = real?.structured?.trace.some(node => node.kind === 'effect' && node.nodeId === effect);
      const qualifies = probe.expected > 0;
      const companionRows = amberCrit === null ? [] : real?.panel.effectValues?.filter(row => row.modifierId === 'amber.fiery-rain-crit') ?? [];
      const companionMatches = amberCrit === null || (qualifies ? companionRows.length === 1 && companionRows[0].value === amberCrit
        : companionRows.length === 0);
      const good = value === probe.expected && usedInDamage === false
        && companionMatches && (qualifies ? seen.length === 1 && seen[0].value === expected && seen[0].unit === 'scalar' : seen.length === 0);
      return { entity, field, effect, output, value, expected: probe.expected, probe, sources,
        ...(good ? {} : { issue: '范围贡献、当次命中或伤害用途与固定来源不符。',
          diagnostics: [...(real?.diagnostics ?? []), ...result.diagnostics].slice(0, 6) }) };
    });
    rows.push(...checks);
    if (checks.some(row => row.issue)) continue;
    verified.add(entity + field);
    if (!remaining) verified.add(entity + clause);
    resolved.push({ entity, field: clause, resolved: '指定命中显示原文的范围或距离百分比。', remaining: remaining ?? '' });
    if (remaining) addGap(entity, clause, sources, remaining);
  }
  for (const { entity, field, source, text } of qualitative) {
    const [path, key] = source.split('#');
    const description = read(capture + path)[key].description;
    if (description.includes(text)) {
      addGap(entity, field, [capture + source], '固定文案只说明范围提升，仍需范围增量和几何口径。');
    }
  }
  return { rows, verified, resolved, gaps, summary: {
    characterEffectRangeCases: rows.length,
    characterEffectRangeMismatches: rows.filter(row => row.issue).length,
    verifiedCharacterEffectRanges: resolved.length,
  } };
}
