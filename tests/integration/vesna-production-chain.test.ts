import { packDocument } from '../../src/web/src/domain/content-document';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateDamage, evaluateTimeline, resolveBuild } from '@leyline/engine';
import { getCharacterActions, getReactionCalculationBundle } from '@leyline/game-data';
import type { CalculationFact, DamageRequest, Value } from '@leyline/schema';
import { createAccount } from '../../src/web/src/domain/account';
import { confirmEnkaImport, previewEnkaImport } from '../../src/web/src/domain/enka-import';
import { calculatorRequest, createDamageCalculation, parseDamageCalculator, readCalculatorSource } from '../../src/web/src/domain/damage-calculator';
import { addActorFromBuild, addSkillHit, defaultEnemy } from '../../src/web/src/domain/real-project';
import { createEmptyProject, importProject, nextRecordId } from '../../src/web/src/domain/workbench-project';
import { compareTimelineLoadouts } from '@leyline/engine';
import { applyCharacterDefinition, copyCharacterDefinition, parseCharacterDefinition } from '../../src/web/src/domain/character-definition';
import { exportCharacterSnapshot } from '../../src/web/src/domain/structured-character-import';
import { recordedVesnaDamage } from '../helpers/recorded-vesna';

const path = '.references/enka/uid-107590923.json';
const fact = (value: Value): CalculationFact => ({ value, provenance: 'explicit', sourceRefs: [] });
const request = (): DamageRequest => ({ skillId: 'vesna.skill', hitId: 'vesna.skill.param5', outputId: 'vesna.skill.param5.stellar-swirl', crit: 'expected', reaction: 'none',
  facts: { radiance: fact({ kind: 'enum', value: 'stellar-swirl' }), 'vesna.stance': fact({ kind: 'boolean', value: true }),
    'vesna.disciplineStacks': fact({ kind: 'quantity', unit: 'count', value: 6 }),
    'beyondthechrysalis.loyalWind': fact({ kind: 'boolean', value: true }), 'beyondthechrysalis.betrayalWind': fact({ kind: 'boolean', value: true }),
    'scarletproof.stellarWindow': fact({ kind: 'boolean', value: true }) } });

async function recordedBuilds() {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const preview = await previewEnkaImport(raw, String(raw.uid), createAccount());
  return new Map(preview.rows.map(row => [row.character.showcase!.build.character.id, row.character.showcase!.build]));
}

// Gear/cultivation are from the original public response. Battle conditions above are
// explicit calculator inputs, not recorded battle events, party or damage observations.
describe.skipIf(!existsSync(path))('recorded Vesna through the production calculator', () => {
  it('keeps known candidate math through coverage gaps and missing unrelated equipment', async () => {
    const builds = await recordedBuilds();
    const document = createDamageCalculation(builds.get('vesna')!, request(), defaultEnemy());
    const teammate = addActorFromBuild(document.project, builds.get('varesa')!);
    const expected = (rank: 1 | 2) => recordedVesnaDamage(rank, 1, true, 'expected', 1);
    const baseline = evaluateTimeline(document.project);
    expect(baseline.totalValue).toBeNull();
    expect(baseline.modeledTotalValue).toBeCloseTo(expected(1), 8);
    expect(baseline.diagnostics.map(diagnostic => diagnostic.message)).toEqual([expect.stringContaining('瓦雷莎 ·')]);
    delete document.project.candidate.actors.find(actor => actor.id === teammate)!.build;
    const incomplete = evaluateTimeline(document.project);
    expect(incomplete.points[0].modeledValue).toBeCloseTo(expected(1), 8);
    document.baseline = structuredClone(document.project);
    document.project.candidate.actors[0].build!.refinement = 2;
    const evaluation = calculatorRequest(document, 4);
    const comparison = compareTimelineLoadouts(evaluation.project, evaluation.candidates!);
    expect(comparison.candidates[0].delta).toBeNull();
    expect(comparison.candidates[0].modeledDelta).toBeCloseTo(expected(2) - expected(1), 8);
    expect(comparison.candidates[0].points[0].modeledDelta).toBeCloseTo(expected(2) - expected(1), 8);
    delete document.project.candidate.actors.find(actor => actor.id === teammate)!.element;
    expect(evaluateTimeline(document.project).points[0].modeledValue).toBeUndefined();
  }, 20_000);

  it('reopens pending, direct lunar and explicitly ranked reaction records', async () => {
    const builds = await recordedBuilds(), flins = builds.get('flins')!, columbina = builds.get('columbina')!;
    const project = createEmptyProject();
    const flinsId = addActorFromBuild(project, flins), columbinaId = addActorFromBuild(project, columbina);
    const skill = flins.character.talents.find(talent => talent.category === 'burst')!;
    const middle = skill.hits.findIndex(hit => hit.parameter === 'param2'), final = skill.hits.findIndex(hit => hit.parameter === 'param3');
    const pending = addSkillHit(project, flinsId, skill.id, middle, 0, { outputId: null, crit: null, reaction: null });
    const direct = addSkillHit(project, flinsId, skill.id, final, 1000, { crit: 'noncritical', reaction: 'none' });
    const reacted = nextRecordId(project);
    project.enemy = defaultEnemy();
    project.reactionRules = await getReactionCalculationBundle();
    project.timeline.push({ id: reacted, actor: flinsId, kind: 'damage', definition: flinsId + '-real-damage', timeMs: 2000, order: 2,
      reactionEvent: { family: 'lunar-charged', element: 'electro', contributors: [flinsId, columbinaId].map(actorId => ({ actorId, qualified: true, crit: 'expected' })) } });
    const reopened = importProject(JSON.stringify(packDocument('axis', project)));
    const result = evaluateTimeline(reopened);
    const points = new Map(result.points.map(point => [point.id, point]));
    expect(points.get(pending)?.modeledValue).toBeUndefined();
    expect(result.modeledTotalValue).toBeUndefined();
    const panels = [flins, columbina].map(build => resolveBuild(build).stats);
    const lunarBonus = (em: number) => 1 + 6 * em / (em + 2000);
    const upstream = JSON.parse(readFileSync('tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json', 'utf8'));
    const multiplier = upstream.flins.combat3.param3[flins.talents.burst - 1];
    expect(points.get(direct)?.modeledValue).toBeCloseTo(panels[0].attack! * multiplier * 3 * lunarBonus(panels[0].elementalMastery!) * 0.9, 8);
    const levels = JSON.parse(readFileSync('src/game-data/data/calculation/reactions.json', 'utf8')).rules.levelMultipliers;
    let expected = 0;
    for (const first of [false, true]) for (const second of [false, true]) {
      const flags = [first, second];
      const values = [flins, columbina].map((build, index) => {
        const panel = panels[index];
        return levels[build.level] * 3 * lunarBonus(panel.elementalMastery!) * (1 + (flags[index] ? panel.critDamage! : 0)) * 0.9;
      }).sort((a, b) => b - a);
      const probability = flags.reduce((product, critical, index) => product * (critical ? panels[index].critRate! : 1 - panels[index].critRate!), 1);
      expected += (values[0] * 0.6 + values[1] * 0.3) * probability;
    }
    const outcome = points.get(reacted)?.real?.structured?.outputs[0];
    expect(outcome?.actorId).toBeNull();
    expect(outcome?.aggregation?.states).toHaveLength(4);
    expect(points.get(reacted)?.modeledValue).toBeCloseTo(expected, 8);
  });

  it('reads the derived stance and stack count from explicit project actions after reopening', async () => {
    const build = (await recordedBuilds()).get('vesna')!;
    const damage = request();
    delete damage.facts!['vesna.stance'];
    delete damage.facts!['vesna.disciplineStacks'];
    const document = createDamageCalculation(build, damage, defaultEnemy());
    document.project.timeline[0].timeMs = 1000;
    expect(evaluateTimeline(document.project).points[0].value).toBeNull();
    const actions = (await getCharacterActions(build.character))!;
    const initial = Object.fromEntries(actions.calculation.bundle.stateMachines[0].states.map(state => [state.key, { value: state.inactiveValue, expiresAtMs: null }]));
    document.project.actionStates = [{ actorId: document.actorId, startMs: 0, actions, initial }];
    const enter = actions.actions.find(action => action.id === 'vesna.skill-enter')!;
    document.project.timeline.push({ id: nextRecordId(document.project), kind: 'action', actor: document.actorId,
      definition: document.project.candidate.actors[0].character, skillId: enter.skillId!, actionId: enter.id, timeMs: 0, order: 0 });
    const reopened = importProject(JSON.stringify(packDocument('axis', document.project)));
    const result = evaluateTimeline(reopened);
    expect(result.actionStateRuns?.[0].status).toBe('complete');
    expect(result.points[0].value).toBeCloseTo(recordedVesnaDamage(1), 8);
    expect(result.points).toHaveLength(1);
  });

  it('confirms the actual showcase, copies independently, evaluates and reopens current JSON', async () => {
    const raw = JSON.parse(readFileSync(path, 'utf8')), account = createAccount();
    const preview = await previewEnkaImport(raw, String(raw.uid), account);
    const row = preview.rows.find(row => row.character.build?.character.id === 'vesna');
    expect(row, JSON.stringify(preview.skipped)).toBeDefined(); if (!row) return;
    expect(account.characters).toHaveLength(0);
    expect(row.character.showcase!.build).toMatchObject({ level: 90, constellation: 2, weapon: { id: 'beyondthechrysalis' }, refinement: 1, talents: { normal: 8, skill: 10, burst: 10 } });
    confirmEnkaImport(account, preview, [row.character.id], true);
    expect(account.artifacts).toHaveLength(5);
    const before = JSON.stringify(account), source = await readCalculatorSource(account, row.character.id, 'showcase'), build = source.character.build!;
    const damage = request(), direct = evaluateDamage(build, damage, defaultEnemy());
    expect(direct.status, JSON.stringify(direct.issues)).toBe('complete');
    expect(direct.value).toBeGreaterThan(0);
    // Independent arithmetic from the pinned original growth/talent records and
    // actual artifact values. This explicit query has one actor, not twelve showcase members.
    const read = (name: string) => JSON.parse(readFileSync('tools/data/sources/' + name, 'utf8'));
    const character = read('catalog/genshin-db/characters.json').vesna.stats, weapon = read('catalog/genshin-db/weapons.json').beyondthechrysalis.stats;
    const curves = read('catalog/genshin-db/character-curves.json'), weaponCurves = read('catalog/genshin-db/weapon-curves.json');
    const params = read('genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json').vesna.combat2.param5;
    const stats: Record<string, number> = {};
    for (const artifact of build.artifacts) {
      stats[artifact.mainStat] = (stats[artifact.mainStat] ?? 0) + build.artifactMain[artifact.rarity][artifact.mainStat][artifact.level];
      for (const sub of artifact.substats) stats[sub.stat] = (stats[sub.stat] ?? 0) + sub.value;
    }
    const white = character.base.attack * curves[90][character.curve.attack] + character.promotion[6].attack
      + weapon.base.attack * weaponCurves[90][weapon.curve.attack] + weapon.promotion[6].attack;
    const attack = white * (1 + (stats.attackPercent ?? 0) + 0.18 + 0.06 + 0.4) + (stats.attack ?? 0);
    const mastery = stats.elementalMastery ?? 0;
    const critRate = Math.min(1, 0.05 + 0.192 + (stats.critRate ?? 0) + 0.16);
    const critDamage = 0.5 + weapon.base.specialized * weaponCurves[90][weapon.curve.specialized] + (stats.critDamage ?? 0) + 0.56;
    const expected = attack * params[9] * 1.6 * (1 + Math.min(attack * 0.00007, 0.14))
      * (1 + 6 * mastery / (mastery + 2000) + 0.2 + 0.36 + 0.4) * (1 + critRate * critDamage) * 0.9;
    expect(direct.value).toBeCloseTo(expected, 7);
    const document = createDamageCalculation(build, damage, defaultEnemy()), result = evaluateTimeline(calculatorRequest(document, 1).project);
    expect(result.status, JSON.stringify(result.diagnostics)).toBe('complete');
    expect(result.points[0].value).toBeCloseTo(direct.value!, 8);
    const reopened = parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', document))), recomputed = evaluateTimeline(calculatorRequest(reopened, 2).project);
    expect(recomputed.points[0].value).toBe(direct.value);
    document.baseline = structuredClone(document.project);
    document.project.candidate.actors[0].build!.refinement = 2;
    const portable = packDocument('damage-calculator', document);
    expect(Object.keys(portable.content.characters)).toHaveLength(1);
    expect(Object.keys(portable.content.weapons)).toHaveLength(1);
    expect(Object.keys(portable.content.mainStats)).toHaveLength(1);
    const wire = JSON.stringify(portable);
    expect(wire).not.toMatch(/"(?:repository|retrievedAt|invocation)"\s*:/);
    expect(() => parseDamageCalculator(JSON.stringify({ ...JSON.parse(wire), schemaVersion: 5 }))).toThrow();
    const reopenedPair = parseDamageCalculator(wire);
    expect(reopenedPair.baseline?.candidate.actors[0].build?.refinement).toBe(1);
    expect(reopenedPair.project.candidate.actors[0].build?.refinement).toBe(2);
    const comparison = compareTimelineLoadouts(calculatorRequest(document, 3).project, calculatorRequest(document, 3).candidates!);
    expect(comparison.baseline.totalValue).toBe(direct.value);
    expect(comparison.candidates[0].delta).toBeGreaterThan(0);
    delete document.baseline;
    // Edit the exported common metadata contract, then reopen it without a code change.
    const custom = copyCharacterDefinition(build.character, build.dataVersion);
    custom.talents.find(skill => skill.id === damage.skillId)!.parameters.find(parameter => parameter.id === 'param5')!.values[9] *= 1.1;
    const imported = parseCharacterDefinition(exportCharacterSnapshot(custom), [build.character]);
    document.project = applyCharacterDefinition(document.project, document.actorId, imported);
    const changed = evaluateTimeline(parseDamageCalculator(JSON.stringify(packDocument('damage-calculator', document))).project);
    expect(changed.totalValue).toBeCloseTo(comparison.candidates[0].result.totalValue! * 1.1, 7);
    const unknown = request(); delete unknown.facts!['beyondthechrysalis.betrayalWind'];
    expect(evaluateDamage(build, unknown, defaultEnemy()).value).toBeNull();
    expect(JSON.stringify(account)).toBe(before);
  }, 20_000);
});
