import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, elements } from './roster-audit-settings.mjs';
import { auditCurrentScene } from './scene-current-facts-audit.mjs';

const sources = readContentSource(new URL('../data/sources/catalog/battle-scenes.json', import.meta.url));
const definitions = readContentSource(new URL('../../src/game-data/data/calculation/battle-scenes.json', import.meta.url));
const definitionById = new Map(definitions.map(scene => [scene.id, scene]));
const potionElements = { 火: 'pyro', 水: 'hydro', 冰: 'cryo', 风: 'anemo', 雷: 'electro', 岩: 'geo', 草: 'dendro' };

function auditPotion(source, definition, members, engine) {
  const [, label, percent, seconds] = source.text.match(/^([火水冰风雷岩草])元素伤害提升(\d+)%[，,]持续(\d+)秒$/);
  const amount = Number(percent) / 100;
  const startMs = 100;
  const endMs = startMs + Number(seconds) * 1000;
  const selected = engine.prepareStructuredBuilds(members, [], [{ definition, startMs, endMs }]);
  const tooLong = engine.prepareStructuredBuilds(members, [], [{ definition, startMs, endMs: endMs + 1 }]);
  const id = source.entity;
  if (!selected.ok || tooLong.ok) {
    return [{ entity: id, issue: '精油有效区间与来源中的时长不符。' }];
  }

  const rows = [];
  const character = members[0].build.character;
  const talent = character.talents[0];
  const { setup, request } = auditHit(character, talent, talent.hits[0]);
  const bindings = Object.fromEntries(elements.map(element => [element, {
    kind: 'attribute', key: { namespace: 'builtin', id: 'attribute.' + element + 'Bonus', revision: '1' },
    actor: { role: 'recipient' }, at: { kind: 'current', phase: 'same' },
  }]));
  for (const timeMs of [startMs - 1, startMs, endMs - 1, endMs]) {
    setup.events[0].timeMs = timeMs;
    const context = engine.createStructuredCombatContext(selected.team, setup);
    for (const { id: recipientId } of members) {
      const frame = { ...request.frame, ownerId: recipientId, recipientId, contributorId: null, hit: null };
      const { outputs } = engine.evaluateCombatBindings(selected.team.program, context, bindings, frame);
      for (const element of elements) {
        const output = outputs[element];
        const value = output?.state === 'known' ? output.value.value : null;
        const expected = element === potionElements[label] && timeMs >= startMs && timeMs < endMs ? amount : 0;
        rows.push({ entity: id, field: source.field, recipientId, timeMs, element, value, expected,
          ...(value === expected ? {} : { issue: '精油属性贡献与来源不符。' }) });
      }
    }
  }
  return rows;
}

export function auditAdditionalScenes(entities, engine) {
  const members = [
    { id: 'actor', build: auditBuild(entities.characters.find(character => character.id === 'kaeya'), entities.weapons.find(weapon => weapon.id === 'dullblade')) },
    { id: 'peer', build: auditBuild(entities.characters.find(character => character.id === 'lisa'), entities.weapons.find(weapon => weapon.id === 'apprenticesnotes')) },
  ];
  const rows = [];
  const verified = new Set();
  const statuses = {};
  for (const source of sources) {
    const status = source.evidence?.status;
    if (!status) continue;
    statuses[status] = (statuses[status] ?? 0) + 1;
    let checks;
    if (status === 'duration-verified') {
      checks = auditPotion(source, definitionById.get(source.entity), members, engine);
    } else if (status === 'duplicate-verified') {
      const activeId = source.evidence.equivalentTo;
      const activeSource = sources.find(row => row.entity === activeId);
      const activeDefinition = definitionById.get(activeId);
      checks = auditCurrentScene(activeDefinition, activeSource, entities, engine)?.rows.map(row => ({
        ...row, entity: source.entity, field: source.field, activeId,
      })) ?? [];
      if (definitionById.has(source.entity) || activeDefinition?.buffs.length !== 1) {
        checks.push({ entity: source.entity, field: source.field, issue: '七识计数助手被作为独立增益。' });
      }
    }
    if (!checks) continue;
    rows.push(...checks);
    if (checks.length && checks.every(row => !row.issue)) verified.add(source.entity + source.field);
  }
  return { rows, verified, summary: {
    additionalSceneClauses: Object.values(statuses).reduce((sum, count) => sum + count, 0),
    additionalSceneChecks: rows.length,
    additionalSceneCheckFailures: rows.filter(row => row.issue).length,
    additionalSceneClausesVerified: verified.size,
    additionalSceneEvidenceStatuses: statuses,
  } };
}
