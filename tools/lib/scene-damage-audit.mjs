import { readContentSource } from './content-source.mjs';
import { auditBuild, elements } from './roster-audit-settings.mjs';

const sources = readContentSource(new URL('../data/sources/catalog/battle-scenes.json', import.meta.url));
const definitions = readContentSource(new URL('../../src/game-data/data/calculation/battle-scenes.json', import.meta.url));
const sourceHits = sources.filter(source => source.evidence?.hit);
const byId = new Map(definitions.map(definition => [definition.id, definition]));
const original = readContentSource(new URL('../data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/scene-level-coefficient-facts.json', import.meta.url)).excerpts;
const dungeons = new Map(original['ExcelBinOutput/DungeonExcelConfigData.json'].map(row => [row.id, row]));
const levelEntities = new Map(original['ExcelBinOutput/DungeonLevelEntityConfigData.json'].map(row => [row.clientId, row]));
const abilities = new Map(original['BinOutput/Ability/Temp/ConfigAbility_LevelBuff.json'].map(row => [row.abilityName, row]));
const canCalculate = hit => hit.trueDamage === true && hit.systemValue === 'ElementLevelCo' && hit.recipient === 'enemy'
  && Number.isFinite(hit.multiplier) && hit.multiplier > 0;

function readBaseHit(evidence) {
  const dungeon = dungeons.get(evidence.dungeonId);
  const levelEntity = levelEntities.get(evidence.clientId);
  if (!levelEntity || levelEntity.id !== evidence.levelConfigId || !Object.hasOwn(dungeon?.levelConfigMap ?? {}, levelEntity.id)) return;
  const ability = abilities.get(levelEntity.levelConfigName);
  if (!ability) return;

  const modifiers = Object.values(ability.modifiers);
  const attack = modifiers.find(modifier => [...(modifier.onAdded ?? []), ...(modifier.onRemoved ?? [])].some(action =>
    action.$type === 'TriggerAttackEvent' || action.$type === 'DamageByAttackValue'));
  const outgoing = attack?.onAdded?.find(action => action.$type === 'TriggerAttackEvent');
  const incoming = attack?.onRemoved?.find(action => action.$type === 'DamageByAttackValue');
  const attackProperty = (outgoing?.attackEvent.attackInfo ?? incoming?.attackInfo)?.attackProperty;
  const [multiplierKey, systemKey, operation] = attackProperty?.damageExtra ?? [];
  const addActions = [...ability.onAdded ?? [], ...modifiers.flatMap(modifier => modifier.onAdded ?? [])];
  if (operation !== 'MUL' || attackProperty.ignoreAttackerProperty !== true
    || !addActions.some(action => action.$type === 'SetSystemValueToOverrideMap' && action.key === systemKey && action.type === 'ElementLevelCo')) return;

  const cooldown = modifiers.find(modifier => modifier.onAdded?.some(action => action.$type === 'AddGlobalValue' && /_cd$/i.test(action.key)) && modifier.duration);
  const reaction = modifiers.flatMap(modifier => modifier.modifierMixins ?? []).find(mixin => mixin.$type === 'DoActionByElementReactionMixin');
  const shield = modifiers.flatMap(modifier => modifier.onBeingHit ?? []).some(event => event.predicates?.some(predicate => predicate.$type === 'ByHasShield'));
  const triggers = {
    Melt: '融化', Explode: '超载', Stream: '蒸发', Shock: '感电', 'Superconductor,StarSuperconductor': '超导或星超导',
  };
  const recipient = outgoing?.targetType === 'Enemy' ? 'enemy' :
    incoming && reaction?.actions.some(action => action.target === 'CurLocalAvatar') ? 'character' : null;
  return {
    systemValue: 'ElementLevelCo', multiplier: ability.abilitySpecials[multiplierKey], recipient,
    cooldownMs: ability.abilitySpecials[cooldown?.duration] * 1000,
    trigger: shield ? '敌人的攻击命中受护盾保护的场上角色' : triggers[reaction?.reactionTypes.join(',')],
    ...(outgoing && { radius: outgoing.attackEvent.attackPattern.radius }),
    ...(incoming && { delayMs: attack.duration * 1000 }),
  };
}

export function auditSceneDamage(entities, engine) {
  const build = auditBuild(entities.characters.find(character => character.id === 'kaeya'), entities.weapons.find(weapon => weapon.id === 'dullblade'));
  const project = {
    schemaVersion: build.schemaVersion, rulesVersion: 'timeline-v1', id: 'scene-check', revision: '1',
    candidate: { id: 'query', actors: [{ id: 'owner', character: 'character', weapon: 'weapon', inputs: {}, build }] },
    definitions: [{ id: 'scene-query', version: '1', source: { kind: 'user', reference: 'scene-damage-audit', verified: false },
      nodes: [{ id: 'result', op: 'game-damage' }], damage: 'result', effects: [] }],
    conditions: {}, objective: {},
    enemy: { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.9])), defenseReduction: 0.8, defenseIgnore: 0.5 },
  };
  const rows = [], baseRows = [], gaps = [], verified = new Set(), baseVerified = new Set();
  const sourceById = new Map(sourceHits.map(source => [source.entity, source]));
  for (const definition of definitions) {
    if (definition.hits?.length && !sourceById.has(definition.id)) gaps.push({ entity: definition.id, field: '/hits', issue: '场景冲击缺少固定来源。' });
  }
  for (const { entity, field, evidence } of sourceHits) {
    const source = { entity, field }, hit = evidence.hit;
    const definition = byId.get(entity);
    const complete = canCalculate(hit);
    const { overrideId, ...sourceHit } = hit;
    const evidenced = complete ? sourceHit : readBaseHit(evidence);
    if (!evidenced || Object.keys(evidenced).length !== Object.keys(sourceHit).length
      || Object.entries(evidenced).some(([key, value]) => sourceHit[key] !== value)) {
      gaps.push({ ...source, issue: '场景冲击的目录证据与固定原始攻击配置不符。' });
      continue;
    }
    const expectedDefinition = { ...evidenced, ...(!complete && { settlement: 'unverified' }), sourceRefs: [entity + field] };
    const adopted = definition?.hits?.[0];
    if (!adopted || definition.hits.length !== 1 || Object.keys(expectedDefinition).length !== Object.keys(adopted).length
      || Object.entries(expectedDefinition).some(([key, value]) => JSON.stringify(adopted[key]) !== JSON.stringify(value))) {
      gaps.push({ ...source, issue: '正式场景冲击的倍率、触发、受击对象或来源与证据不符。' });
      continue;
    }
    const sameDomain = sourceHits.find(row => row.evidence.clientId === evidence.clientId && row.evidence.dungeonId !== evidence.dungeonId);
    const wrongDifficulty = byId.get(sameDomain?.entity);
    const startMs = 100, endMs = 25000, firstMs = startMs + (hit.delayMs ?? 0);
    const scene = { namespace: 'builtin', id: entity, revision: definition.revision };
    const baseline = { scene, elementLevelCo: 123.25, triggered: true, targetHit: true };
    // These coefficients and explicit confirmations are software inputs, with no claimed game observation.
    const damage = evidenced.multiplier * baseline.elementLevelCo;
    const cases = [
      { id: 'first', timeMs: firstMs, expected: damage },
      { id: 'last', timeMs: endMs - 1, expected: damage },
      { id: 'too-early', timeMs: firstMs - 1, expected: 0 },
      { id: 'expired', timeMs: endMs, expected: 0 },
      { id: 'zero-coefficient', patch: { elementLevelCo: 0 }, expected: 0 },
      { id: 'missing-coefficient', patch: { elementLevelCo: null }, expected: null },
      { id: 'not-triggered', patch: { triggered: false, elementLevelCo: null }, expected: 0 },
      { id: 'unknown-trigger', patch: { triggered: null }, expected: null },
      { id: 'missed-target', patch: { targetHit: false }, expected: 0 },
      { id: 'unknown-target', patch: { targetHit: null }, expected: null },
      ...wrongDifficulty ? [{ id: 'wrong-difficulty', patch: { scene: { ...scene, id: wrongDifficulty.id, revision: wrongDifficulty.revision } }, expected: null }] : [],
    ];
    const timeline = cases.map(({ id, timeMs = firstMs, patch }, order) => ({
      id, timeMs, order, actor: 'owner', kind: 'damage', definition: 'scene-query', sceneHit: { ...baseline, ...patch },
    }));
    const result = engine.evaluateTimeline({ ...project, timeline, sceneEffects: [{ definition, startMs, endMs }] });
    const points = new Map(result.points.map(point => [point.id, point]));
    const checks = cases.map(({ id, expected }, index) => {
      const point = points.get(id);
      const expectedFinal = complete || expected === 0 && id !== 'zero-coefficient' ? expected : null;
      const status = expectedFinal === null ? 'partial' : 'complete';
      const row = { ...source, case: id, timeMs: timeline[index].timeMs, input: timeline[index].sceneHit, expected, value: point?.value,
        execution: point?.real?.status, sourceRefs: evidence.sourceRefs };
      if (!complete) Object.assign(row, { value: point?.real?.baseDamage, expectedFinal, final: point?.value, recipient: evidenced.recipient });
      if (row.value !== expected || point?.value !== expectedFinal || point?.real?.status !== status) row.issue = '场景冲击单次结果与固定来源或条件不符。';
      return row;
    });
    (complete ? rows : baseRows).push(...checks);
    gaps.push(...checks.filter(row => row.issue));
    if (checks.every(row => !row.issue)) (complete ? verified : baseVerified).add(entity + field);
  }
  return { rows, verified, baseRows, baseVerified, gaps, summary: { sceneDamageEvidenceRows: sourceHits.length, sceneDamageVerified: verified.size,
    sceneDamageChecks: rows.length, sceneDamageCheckFailures: gaps.length, sceneBaseVerified: baseVerified.size, sceneBaseChecks: baseRows.length } };
}
