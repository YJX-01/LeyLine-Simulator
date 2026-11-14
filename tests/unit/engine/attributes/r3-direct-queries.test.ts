import { describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getCharacter, getReactionRules, getWeapon } from '@leyline/game-data';
import { type Build, type DamageRequest } from '@leyline/schema';
import { compareTimelineLoadouts, evaluateDamage, evaluateTimeline, resolveBuild } from '@leyline/engine';
import { addActorFromBuild, addSkillHit, defaultEnemy } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { calculatorRequest, parseDamageCalculator } from '../../../../src/web/src/domain/damage-calculator';
import { evaluateLoadoutComparison } from '../../../../src/web/src/domain/loadout-comparison';

// Pinned genshin-db/KQM, independent legal single-query settings. No player export or constructed combat sequence.
const cases = [
  { id: 'noelle', skill: 'skill', weapon: 'wastergreatsword', candidate: 'oldmercspal', max: 3, coefficients: [2.04],
    attribute: (_base: number) => (66.95325 * 8.349 + 239.5575) * 1.3, promoted: [2.4] },
  { id: 'xinyan', skill: 'skill', weapon: 'wastergreatsword', candidate: 'oldmercspal', max: 3, coefficients: [2.8832],
    attribute: (base: number) => (20.83536 * 8.349 + 74.55029 + base * 5.968 + 46.7) * 1.24, promoted: [3.392] },
  { id: 'razor', skill: 'skill', weapon: 'wastergreatsword', candidate: 'oldmercspal', max: 0, coefficients: [3.3864, 5.0184],
    attribute: (base: number) => 19.5888 * 8.349 + 70.09002 + base * 5.968 + 46.7 },
  { id: 'barbara', skill: 'normal', weapon: 'apprenticesnotes', candidate: 'pocketgrimoire', max: 1,
    coefficients: [0.64328, 0.60384, 0.69768, 0.9384, 2.82608, 1.044064, 2.087686, 2.607632],
    attribute: (base: number) => 13.356 * 8.349 + 47.78865 + base * 5.968 + 46.7 },
];
async function setting(id: string, weapon: string, constellation: number): Promise<Build> {
  return { dataVersion: DATA_VERSION, character: await getCharacter(id), weapon: await getWeapon(weapon), artifactMain: await getArtifactMain(), reactionRules: await getReactionRules(),
    level: 90, ascension: 6, constellation, talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 70, weaponAscension: 4, refinement: 1, artifacts: [], sets: [] };
}

describe('R3 reviewed direct queries, without broad support flag changes', () => {
  for (const entry of cases) for (let constellation = 0; constellation <= entry.max; constellation++) {
    it(`${entry.id} C${constellation}: every reviewed hit uses formal graph, file, domain candidate and independent expectation`, async () => {
      const build = await setting(entry.id, entry.weapon, constellation);
      expect(build.character.capabilities.calculation.supported).toBe(false);
      expect(resolveBuild(build).status).toBe('partial');
      const coefficients = constellation === 3 && entry.promoted ? entry.promoted : entry.coefficients;
      for (const [hitIndex, coefficient] of coefficients.entries()) {
        const damage: DamageRequest = { skillId: `${entry.id}.${entry.skill}`, hitIndex, crit: 'noncritical', reaction: 'none' };
        const expected = entry.attribute(23.245) * coefficient * 0.45;
        expect(evaluateDamage(build, damage, defaultEnemy()).value).toBeCloseTo(expected, 7);
        const project = createEmptyProject(); project.enemy = defaultEnemy();
        const actorId = addActorFromBuild(project, build);
        const recordId = addSkillHit(project, actorId, damage.skillId, hitIndex, 0, { crit: damage.crit, reaction: damage.reaction });
        const document = parseDamageCalculator(JSON.stringify({ schemaVersion: 1, kind: 'damage-calculator', project, actorId, recordId }));
        const original = JSON.stringify(document);
        expect(evaluateTimeline(document.project).status).toBe('complete');
        expect(evaluateTimeline(document.project).totalValue).toBeCloseTo(expected, 7);
        const candidate = { ...build, weapon: await getWeapon(entry.candidate) };
        const changed = entry.attribute(32.93) * coefficient * 0.45;
        const compared = compareTimelineLoadouts(document.project, [{ id: entry.candidate, replacements: [{ actorId, build: candidate }] }]);
        expect(compared.candidates[0].result.status).toBe('complete');
        expect(compared.candidates[0].delta).toBeCloseTo(changed - expected, 7);
        document.baseline = structuredClone(document.project);
        document.project.candidate.actors[0].build = candidate;
        const response = evaluateLoadoutComparison(calculatorRequest(parseDamageCalculator(JSON.stringify(document)), 1));
        expect(response.comparison!.candidates[0].result.totalValue).toBeCloseTo(changed, 7);
        expect(JSON.stringify(document.baseline)).toBe(JSON.stringify(JSON.parse(original).project));
        const uncovered = { ...build, constellation: entry.max + 1 };
        expect(evaluateDamage(uncovered, damage, defaultEnemy()).value).toBeNull();
        expect(evaluateDamage({ ...build, weapon: await getWeapon(entry.id === 'barbara' ? 'thrillingtalesofdragonslayers' : 'wolfsgravestone') }, damage, defaultEnemy()).value).toBeNull();
      }
    });
  }

  it('keeps Xinyan pulses, Noelle burst and Barbara E outside the reviewed initial/single-hit paths', async () => {
    for (const [id, skillId, hitIndex] of [['xinyan', 'xinyan.skill', 1], ['noelle', 'noelle.burst', 0], ['barbara', 'barbara.skill', 0]] as const) {
      const build = await setting(id, id === 'barbara' ? 'apprenticesnotes' : 'wastergreatsword', 0);
      expect(evaluateDamage(build, { skillId, hitIndex, crit: 'noncritical', reaction: 'none' }, defaultEnemy()).value).toBeNull();
    }
  });
});
