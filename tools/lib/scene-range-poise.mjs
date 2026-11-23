import { assembleCalculationLibrary } from './calculation-library.mjs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, elements, fact, number, projectQuery } from './roster-audit-settings.mjs';

const sources = readContentSource(new URL('../data/sources/catalog/battle-scenes.json', import.meta.url))
  .filter(source => ['geometry', 'control'].includes(source.evidence?.status));
const calculationData = new URL('../../src/game-data/data/calculation/', import.meta.url);
const definitions = readContentSource(new URL('battle-scenes.json', calculationData));
const reactionRules = assembleCalculationLibrary(readContentSource(new URL('common.json', calculationData)),
  readContentSource(new URL('reactions.json', calculationData)), []);
const byId = new Map(definitions.map(definition => [definition.id, definition]));
const startMs = 100;
const endMs = 25000;

function geometryCases(source, actor) {
  const { evidence, text } = source;
  const bonus = Number(text.match(/影响范围扩大(\d+)%/)?.[1]) / 100;
  if (!Number.isFinite(bonus) || bonus !== evidence.rangeBonus || evidence.reaction !== 'electro-charged') return [];
  const electro = 'electro-charged';
  return [
    ['before', startMs - 1, electro, 1],
    ['first', startMs, electro, 1 + bonus],
    ['last', endMs - 1, electro, 1 + bonus],
    ['expired', endMs, electro, 1],
    ['other-reaction', startMs, 'overloaded', 1],
  ].map(([id, timeMs, family, expected]) => ({
    id, timeMs, family, expected,
    reactionEvent: {
      family, element: family === electro ? 'electro' : 'pyro', triggerActorId: actor,
      contributors: [{ actorId: actor, qualified: true, crit: 'noncritical' }],
    },
  }));
}

function enduranceCases(source, actor) {
  const { evidence, entity, text } = source;
  const cap = Number(text.match(/至多叠加(\d+)层/)?.[1]);
  const threshold = evidence.endurance?.atLayers;
  const delta = evidence.endurance?.value;
  if (!Number.isSafeInteger(cap) || cap !== threshold || cap !== evidence.stacking?.max
    || evidence.endurance?.modifier !== 'Actor_EndureDelta' || !Number.isFinite(delta)) return [];
  const character = actor.build.character, talent = character.talents[0];
  const { request } = auditHit(character, talent, talent.hits[0]);
  const query = projectQuery(request);
  const actorFacts = query.facts.find(entry => entry.subject.kind === 'actor');
  actorFacts.subject.id = actor.id;
  const cases = [
    { id: 'before', timeMs: startMs - 1, layers: cap, expected: 0 },
    ...Array.from({ length: cap + 1 }, (_, layers) => ({
      id: 'layers-' + layers, timeMs: startMs, layers, expected: layers === threshold ? delta : 0,
    })),
    { id: 'last', timeMs: endMs - 1, layers: cap, expected: delta },
    { id: 'expired', timeMs: endMs, layers: cap, expected: 0 },
    { id: 'unknown-layers', timeMs: startMs, layers: null, expected: null },
    { id: 'above-cap', timeMs: startMs, layers: cap + 1, expected: null },
  ];
  return cases.map(row => ({
    ...row,
    damage: { ...query, facts: [...query.facts, { subject: { kind: 'team' },
      values: { [entity + '.activeLayers']: row.layers === null ? fact(null) : number('count', row.layers) } }] },
  }));
}

export function auditSceneRangePoise(entities, engine) {
  const actors = [['actor', 'kaeya', 'dullblade'], ['peer', 'lisa', 'apprenticesnotes']].map(([id, character, weapon]) => ({
    id, character, weapon, inputs: {},
    build: auditBuild(entities.characters.find(entry => entry.id === character), entities.weapons.find(entry => entry.id === weapon)),
  }));
  const source = { kind: 'user', reference: 'scene-range-poise', verified: false };
  const project = {
    schemaVersion: actors[0].build.schemaVersion, rulesVersion: 'timeline-v1', id: 'scene-attribute-check', revision: '1',
    candidate: { id: 'query', actors },
    definitions: [
      ...actors.flatMap(actor => [actor.character, actor.weapon]).map(id => ({ id, version: '1', source, nodes: [], effects: [] })),
      { id: 'scene-query', version: '1', source, nodes: [{ id: 'result', op: 'game-damage' }], damage: 'result', effects: [] },
    ],
    conditions: {}, objective: {},
    enemy: { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])),
      defenseReduction: 0, defenseIgnore: 0 },
  };
  const rows = [], verified = new Set();
  for (const source of sources) {
    const { entity, field, evidence } = source;
    const definition = byId.get(entity);
    const geometry = evidence.status === 'geometry';
    const attribute = geometry ? 'reaction.electro-charged.rangeBonus' : 'actorEndureDelta';
    const modifier = entity + (geometry ? '.transformative.1' : '.endurance');
    // These explicit values exercise the calculator's inputs and output panel.
    const cases = actors.flatMap(actor => (geometry ? geometryCases(source, actor.id) : enduranceCases(source, actor))
      .map(row => ({ ...row, actor: actor.id })));
    if (!definition || !cases.length) {
      rows.push({ entity, field, issue: '缺少作用范围或抗打断增量的场景定义及固定来源。' });
      continue;
    }
    const timeline = cases.map((row, order) => ({
      id: row.actor + '-' + row.id, timeMs: row.timeMs, order, actor: row.actor, kind: 'damage',
      definition: 'scene-query', ...(row.reactionEvent ? { reactionEvent: row.reactionEvent } : { damage: row.damage }),
    }));
    const result = engine.evaluateTimeline({ ...project, timeline, sceneEffects: [{ definition, startMs, endMs }],
      ...(geometry ? { reactionRules } : {}) });
    const points = new Map(result.points.map(point => [point.id, point]));
    const checks = cases.map(({ id, actor, timeMs, expected, family, layers }, index) => {
      const point = points.get(timeline[index].id);
      const panel = point?.real?.panel;
      const amount = panel?.attributes?.[attribute];
      const value = geometry && typeof amount === 'number' ? 1 + amount : amount;
      const contribution = panel?.effectValues?.find(entry => entry.modifierId === modifier);
      const expectedContribution = geometry ? expected === 1 ? undefined : expected - 1 : expected === 0 ? undefined : expected;
      const row = { entity, field, case: id, actor, attribute, timeMs, ...(geometry ? { family } : { layers }),
        value, expected, contribution: contribution?.value, sourceRefs: evidence.sourceRefs };
      if (value !== expected || contribution?.value !== expectedContribution) {
        row.issue = '场景增量的面板值或增益明细与来源及输入不符。';
        if (amount === undefined) row.diagnostics = (point?.real?.diagnostics ?? result.diagnostics).slice(0, 5);
      }
      return row;
    });
    rows.push(...checks);
    if (checks.every(row => !row.issue)) verified.add(entity + field);
  }
  return { rows, verified, summary: {
    sceneRangePoiseEvidenceRows: sources.length, sceneRangePoiseVerified: verified.size,
    sceneRangePoiseChecks: rows.length, sceneRangePoiseCheckFailures: rows.filter(row => row.issue).length,
  } };
}
