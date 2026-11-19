import { packDocument } from '../../../../src/web/src/domain/content-document';
import { selectCatalogHit } from '../../../helpers/catalog-calculation';
import { describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { findDamageCoverage, type Build, type DamageRequest } from '@leyline/schema';
import { compareTimelineLoadouts, evaluateDamage, evaluateTimeline, resolveBuild } from '@leyline/engine';
import { createDamageCalculation, calculatorRequest, parseDamageCalculator, prepareCalculatorContentUpdate } from '../../../../src/web/src/domain/damage-calculator';
import { evaluateLoadoutComparison } from '../../../../src/web/src/domain/loadout-comparison';
import { copyCharacterDefinition } from '../../../../src/web/src/domain/character-definition';
import { addAttributeCapture, defaultEnemy } from '../../../../src/web/src/domain/real-project';

// Independent legal calculation settings from pinned genshin-db and KQM. No player build/observed axis.
async function buildFor(id: string, weapon: string, constellation = 0): Promise<Build> {
  return { schemaVersion: '0.1.0', kind: 'calculation-build', ...await getBuildSources(), dataVersion: DATA_VERSION, character: await getCharacter(id), weapon: await getWeapon(weapon), artifactMain: await getArtifactMain(),
    level: 90, ascension: 6, constellation, talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 70, weaponAscension: 4, refinement: 1, artifacts: [], sets: [] };
}
const request = (build: Build): DamageRequest => ({ ...selectCatalogHit(build, `${build.character.id}.skill`, 0), crit: 'noncritical', reaction: 'none', ...(build.character.id === 'beidou' ? { inputs: { counterCharge: 2 } } : {}) });

describe('source-backed query coverage preserves all other guards', () => {
  it.each([0, 1])('calculates Kaeya C%i icicle from an independent anchor through file and candidate recomputation', async constellation => {
    const build = await buildFor('kaeya', 'dullblade', constellation);
    const document = createDamageCalculation(build, { skillId: 'kaeya.burst', hitId: 'kaeya.burst.param1', outputId: 'kaeya.burst.param1.damage', crit: 'noncritical', reaction: 'none' }, defaultEnemy());
    const hit = document.project.timeline[0];
    hit.timeMs = 1000;
    const source = addAttributeCapture(document.project, document.actorId, 'kaeya.burst', 0);
    hit.damage!.capture = { recordId: source, phase: 'before' };
    // addAttributeCapture validates atomically and replaces project arrays, so edit the accepted record.
    document.project.timeline.find(record => record.id === hit.id)!.damage = hit.damage;
    const original = JSON.stringify(document);
    const attack = 18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7;
    const expected = attack * 1.3192 * 0.45;
    const reopened = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', document)));
    const output = evaluateTimeline(reopened.project);
    expect(output.status).toBe('complete');
    expect(output.totalValue).toBeCloseTo(expected, 8);
    expect(output.points).toHaveLength(1);
    expect(output.reads?.some(read => read.recordId === source && read.timeMs === 0 && read.key === 'attack')).toBe(true);
    expect(evaluateDamage(build, hit.damage, defaultEnemy()).value).toBeNull(); // No fallback reader.
    const candidate = { ...build, weapon: await getWeapon('silversword') };
    const comparison = compareTimelineLoadouts(reopened.project, [{ id: 'silversword', replacements: [{ actorId: document.actorId, build: candidate }] }]);
    const changed = (18.6984 * 8.349 + 66.90411 + 32.93 * 5.968 + 46.7) * 1.3192 * 0.45;
    expect(comparison.candidates[0].result.totalValue).toBeCloseTo(changed, 8);
    expect(comparison.candidates[0].delta).toBeCloseTo(changed - expected, 8);
    expect(JSON.stringify(document)).toBe(original);
    const record = reopened.project.timeline.find(record => record.id === hit.id)!;
    record.damage!.capture!.phase = null;
    expect(evaluateTimeline(reopened.project).totalValue).toBeNull();
    record.damage!.capture!.phase = 'before';
    reopened.project.candidate.actors[0].build!.constellation = 2;
    expect(evaluateTimeline(reopened.project).totalValue).toBeNull();
  });

  it('prepares a reviewed content replacement without mutating the saved snapshot, baseline or custom definition', async () => {
    const build = await buildFor('kaeya', 'dullblade', 3);
    // A closed current-format snapshot with an earlier, narrower proof scope.
    build.character.revision = '4';
    for (const proof of build.character.calculation.bundle.coverage) {
      proof.entity.revision = '4';
      if (proof.scope.kind === 'hit' && proof.scope.skillId === 'kaeya.skill') proof.scope.maxConstellation = 0;
    }
    const document = createDamageCalculation(build, request(build), defaultEnemy());
    const original = JSON.stringify(document);
    expect(evaluateTimeline(document.project).totalValue).toBeNull();
    const update = await prepareCalculatorContentUpdate(document);
    expect(update.changes).toContain('角色定义（4 → 6）');
    const owner = update.document.project.candidate.actors[0];
    expect(update.document.project.definitions.find(definition => definition.id === owner.weapon)!.source.reference).toBe(`dullblade@${build.dataVersion}`);
    expect(evaluateTimeline(update.document.project).status).toBe('complete');
    expect(JSON.stringify(document)).toBe(original);
    document.baseline = structuredClone(document.project);
    await expect(prepareCalculatorContentUpdate(document)).rejects.toThrow('结束对照');
    delete document.baseline;
    document.project.candidate.actors[0].build!.character = copyCharacterDefinition(build.character, build.dataVersion);
    await expect(prepareCalculatorContentUpdate(document)).rejects.toThrow('自定义角色');
  });
  it.each([0, 1, 2, 3])('calculates Kaeya C%i E including only unlocked talent bonuses', async constellation => {
    const build = await buildFor('kaeya', 'dullblade', constellation);
    const attack = 18.6984 * 8.349 + 66.90411 + 23.245 * 5.968 + 46.7;
    const expected = attack * (constellation === 3 ? 3.824 : 3.2504) * 0.5 * 0.9;
    const direct = evaluateDamage(build, request(build), defaultEnemy());
    expect(direct.status).toBe('complete');
    expect(direct.value).toBeCloseTo(expected, 8);
    const document = createDamageCalculation(build, request(build), defaultEnemy());
    const reopened = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', document)));
    expect(evaluateTimeline(reopened.project).totalValue).toBeCloseTo(expected, 8);
    expect(reopened.project.candidate.actors[0].build!.talents.skill).toBe(9);
  });

  it('blocks absent/stale/incomplete proofs and does not extend the whole character or constellation range', async () => {
    const build = await buildFor('beidou', 'wastergreatsword');
    const original = JSON.stringify(build);
    expect(resolveBuild(build).status).toBe('partial'); // A whole panel has no path proof.
    const missing = structuredClone(build), stale = structuredClone(build), incomplete = structuredClone(build);
    missing.character.calculation.bundle.coverage = missing.character.calculation.bundle.coverage.filter(record => record.scope.kind !== 'hit' || record.scope.skillId !== 'beidou.skill');
    stale.character.revision = '4';
    const proof = incomplete.character.calculation.bundle.coverage.find(record => record.scope.kind === 'hit' && record.scope.skillId === 'beidou.skill')!;
    proof.resolution = 'unavailable';
    for (const derivative of [missing, stale, incomplete, { ...build, constellation: 1 }]) {
      expect(evaluateDamage(derivative, request(build), defaultEnemy()).value).toBeNull();
    }
    const copied = copyCharacterDefinition(build.character, build.dataVersion);
    expect(copied.calculation.bundle.coverage.every(record => record.evidence === 'declared')).toBe(true);
    expect(evaluateDamage({ ...build, character: copied }, request(build), defaultEnemy()).value).toBeGreaterThan(0);
    expect(JSON.stringify(build)).toBe(original);
  });

  it('retains missing counter, relevant unaudited weapon, unknown crit and invalid structural derivatives', async () => {
    const build = await buildFor('beidou', 'wastergreatsword');
    const missing = evaluateDamage(build, { ...request(build), inputs: undefined }, defaultEnemy());
    expect(missing.value).toBeNull();
    expect(missing.issues.some(issue => issue.code === 'unknown' && issue.message.includes('counterCharge'))).toBe(true);
    const weapon = await getWeapon('wolfsgravestone'); // Real ATK/passive dependencies are still unreviewed.
    const unsupported = evaluateDamage({ ...build, weapon }, request(build), defaultEnemy());
    expect(unsupported.value).toBeNull();
    expect(unsupported.issues.some(issue => issue.code === 'unsupported')).toBe(true);
    expect(evaluateDamage(build, { ...request(build), crit: null }, defaultEnemy()).value).toBeNull();
    expect(evaluateDamage({ ...build, weapon: await getWeapon('dullblade') }, request(build), defaultEnemy()).status).toBe('invalid');
    expect(evaluateDamage({ ...build, refinement: 2 }, request(build), defaultEnemy()).status).toBe('invalid');
  });

  it('does not reuse the Kaeya E proof for C1 normal/charged or C4 E', async () => {
    const build = await buildFor('kaeya', 'dullblade', 1);
    const normal = build.character.talents.find(talent => talent.category === 'normal')!;
    expect(findDamageCoverage(build.character, 1, { skillId: normal.id, hitId: normal.hits[0].id })).toBeUndefined();
    const output = evaluateDamage(build, { ...selectCatalogHit(build, normal.id, 0), crit: 'expected', reaction: 'none' }, defaultEnemy());
    expect(output.value).toBeNull(); // C1 target Cryo condition/effect has not been implemented.
    expect(output.issues.some(issue => issue.code === 'unsupported')).toBe(true);
    expect(evaluateDamage({ ...build, constellation: 4 }, request(build), defaultEnemy()).value).toBeNull();
  });

  it('recomputes isolated candidates through the exported service, domain request and file reopening', async () => {
    const build = await buildFor('beidou', 'wastergreatsword');
    const document = createDamageCalculation(build, request(build), defaultEnemy());
    const original = JSON.stringify(document);
    const candidate = { ...build, weapon: await getWeapon('oldmercspal') };
    const candidates = [{ id: 'oldmercspal', replacements: [{ actorId: document.actorId, build: candidate }] }];
    const comparison = compareTimelineLoadouts(document.project, [...candidates,
      { id: 'unaudited-wolfsgravestone', replacements: [{ actorId: document.actorId, build: { ...build, weapon: await getWeapon('wolfsgravestone') } }] },
      { id: 'unchanged-source', replacements: [{ actorId: document.actorId, build }] },
    ]);
    const attack = 18.87648 * 8.349 + 67.54129;
    const expectedBefore = (attack + 23.245 * 5.968 + 46.7) * 7.5072 * 1.24 * 0.45;
    const expectedAfter = (attack + 32.93 * 5.968 + 46.7) * 7.5072 * 1.24 * 0.45;
    expect(comparison.baseline.totalValue).toBeCloseTo(expectedBefore, 8);
    expect(comparison.candidates[0].result.totalValue).toBeCloseTo(expectedAfter, 8);
    expect(comparison.candidates[0].delta).toBeCloseTo(expectedAfter - expectedBefore, 8);
    expect(comparison.candidates[0].sources.builds).toEqual([{ actorId: document.actorId, fields: ['weapon'] }]);
    expect(comparison.candidates[1].result.status).toBe('partial');
    expect(comparison.candidates[1].result.totalValue).toBeNull();
    expect(comparison.candidates[1].delta).toBeNull();
    expect(comparison.candidates[2].result.totalValue).toBeCloseTo(expectedBefore, 8);
    expect(comparison.candidates[2].delta).toBe(0);
    document.baseline = JSON.parse(JSON.stringify(document.project));
    document.project.candidate.actors[0].build = candidate;
    const reopened = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', document)));
    const response = evaluateLoadoutComparison(calculatorRequest(reopened, 7));
    expect(response.taskId).toBe(7);
    expect(response.comparison!.candidates[0].result.totalValue).toBeCloseTo(expectedAfter, 8);
    expect(JSON.stringify(document.baseline)).toBe(JSON.stringify(JSON.parse(original).project));
    expect(build.weapon.id).toBe('wastergreatsword');
    const invalid = { ...candidates[0], replacements: [{ actorId: 'kaeya', build: candidate }] };
    expect(() => compareTimelineLoadouts(document.project, [invalid])).toThrow('同一角色');
    document.project.timeline[0].damage!.inputs!.counterCharge = null;
    expect(() => calculatorRequest(document, 8)).toThrow('同轴比较');
    expect(() => parseDamageCalculator(JSON.stringify({ ...reopened, schemaVersion: 0 }))).toThrow();
  });

  it.each([
    ['apprenticesnotes', 23.245], ['beginnersprotector', 23.245], ['huntersbow', 23.245], ['wastergreatsword', 23.245],
    ['ironpoint', 32.93], ['oldmercspal', 32.93], ['pocketgrimoire', 32.93], ['seasonedhuntersbow', 32.93],
  ] as const)('carries reviewed no-passive semantics and unchanged growth for %s', async (id, base) => {
    const weapon = await getWeapon(id);
    expect(weapon.calculation.bundle.coverage[0]).toMatchObject({ resolution: 'complete', mechanisms: [{ id: 'no-passive', resolution: 'irrelevant' }] });
    expect(weapon.baseAttack * weapon.attackCurve[70] + weapon.promotion[4]).toBeCloseTo(base * 5.968 + 46.7, 10);
    expect(weapon.promotion).toHaveLength(5);
    expect(weapon.calculation.ruleIds).toEqual([]);
  });
});
