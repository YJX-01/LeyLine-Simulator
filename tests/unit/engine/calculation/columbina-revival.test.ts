import * as engine from '@leyline/engine';
import { DATA_VERSION, getArtifactMain, getCharacter, getWeapon } from '@leyline/game-data';
import { characterHitRef, type CalculationFact, type CalculationUnit, type StructuredBuild, type StructuredCombatSetup, type StructuredHitRequest } from '@leyline/schema';
import { expect, it } from 'vitest';
import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { auditColumbinaRevival, columbinaRevivalCharacterIds, columbinaRevivalSetIds, columbinaRevivalWeaponIds } from '../../../../tools/lib/columbina-revival.mjs';
import { createRuntimeCatalog } from '../../../../tools/lib/runtime-catalog.mjs';

it('evaluates Lunar Vigil against the fixed recipient-HP ratio, friendship floor and eligibility predicates', async () => {
  const catalog = await createRuntimeCatalog();
  const result = await auditColumbinaRevival({
    characters: await Promise.all(columbinaRevivalCharacterIds.map(id => catalog.get('characters', id))),
    weapons: await Promise.all(columbinaRevivalWeaponIds.map(id => catalog.get('weapons', id))),
    sets: await Promise.all(columbinaRevivalSetIds.map(id => catalog.get('sets', id))),
  }, engine);

  expect(result.rows.filter(row => row.issue).map(row => [row.probe?.title, row.status, row.value, row.base, row.missing, row.issue])).toEqual([]);
  expect(result.summary).toEqual({ columbinaRevivalCases: 20, columbinaRevivalFailures: 0, columbinaRevivalClauses: 1 });
  expect(result.resolved.map(row => row.field)).toEqual(['/passives/3']);
  const observed = (title: string) => result.rows.find(row => row.probe?.title === title);
  const full = observed('好感等级 10')!.value!;
  expect(observed('好感等级 5')?.value).toBeCloseTo(full / 2, 8);
  expect(observed('好感等级 1')?.value).toBeCloseTo(full / 10, 8);
  expect(observed('采样值为零时回填一级')?.value).toBeCloseTo(full / 10, 8);
  const bonus = observed('治疗加成交互缺观测');
  expect(bonus).toMatchObject({ status: 'unknown', value: null });
  expect(bonus?.base).toBeCloseTo(full / 2, 8);
  const incoming = observed('受治疗加成交互缺观测');
  expect(incoming).toMatchObject({ status: 'unknown', value: null });
  expect(incoming?.base).toBeCloseTo(full / 2, 8);
  expect(observed('明确在范围外且缺好感采样')).toMatchObject({ status: 'excluded', value: 0 });
}, 90_000);

it('calculates Eternal Tides without a revival friendship sample', async () => {
  const [character, weapon, artifactMain] = await Promise.all([getCharacter('columbina'), getWeapon('apprenticesnotes'), getArtifactMain()]);
  const build: StructuredBuild = { schemaVersion: character.schemaVersion, kind: 'calculation-build', dataVersion: DATA_VERSION,
    character, weapon, artifactMain, artifactMainSourceRefs: ['content.artifact-main'], sources: [{ id: 'content.artifact-main', kind: 'definition' }],
    level: 1, ascension: 0, constellation: 0, talents: { normal: 1, skill: 1, burst: 1 }, weaponLevel: 1, weaponAscension: 0, refinement: 1,
    sets: [], artifacts: [] };
  const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) return;

  const quantity = (unit: CalculationUnit, value: number): CalculationFact => ({ value: { kind: 'quantity', unit, value }, provenance: 'explicit', sourceRefs: [] });
  const skillId = 'columbina.skill', hitId = 'columbina.skill.param1';
  const setup: StructuredCombatSetup = {
    targets: [{ id: 'enemy', inputs: { level: quantity('count', 1), defenseReduction: quantity('scalar', 0),
      ordinaryDamageReduction: quantity('scalar', 0), 'resistance.hydro': quantity('scalar', 0.1) }, facts: {} }],
    team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [],
    events: [{ id: 'hit', kind: 'hit', actorId: 'actor', targetIds: ['enemy'], timeMs: 1, order: 1, skillId, hitId, category: 'skill', sourceEventIds: [], facts: {} }],
  };
  const request: StructuredHitRequest = { actorId: 'actor', hit: characterHitRef(character, hitId), critMode: 'noncritical', reactionMode: 'none',
    frame: { targetId: 'enemy', eventId: 'hit', sourceEventId: null, phase: 'before', facts: {}, actorFacts: {}, captures: {}, applications: [], factOverrides: [] } };
  const result = engine.evaluateStructuredHit(prepared.team, setup, request);
  const origin = readCalculationData('tools/data/sources/catalog/genshin-db/characters.json').columbina;
  const expected = origin.stats.base.hp * origin.talents.combat2.param1[0] * 0.5 * 0.9;
  expect(result.requiredInputs.map(input => input.key)).not.toContain('columbina.revival.friendship');
  expect(result.totals.all).toMatchObject({ state: 'known', value: { kind: 'quantity', unit: 'damage', value: expect.closeTo(expected, 8) } });
});
