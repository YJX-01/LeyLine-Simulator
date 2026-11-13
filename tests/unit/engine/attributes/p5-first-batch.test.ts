import { describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getCharacter, getWeapon } from '@leyline/game-data';
import { evaluateDamage, resolveBuild } from '@leyline/engine';
import type { Build } from '@leyline/schema';

// Explicit legal calculation settings, not player builds or recorded combat.
// T9 skill coefficients independently cross-checked against pinned KQM character tables.
describe('P5 first-batch independent parameter and HP-condition calculations', () => {
  it.each([
    ['jean', 0, 4.964, 18.62 * 8.739 + 76.4582, 0],
    ['kaeya', 0, 3.2504, 18.6984 * 8.349 + 66.90411, 0],
    ['xingqiu', 0, 2.856, 16.9176 * 8.349 + 60.53229, 0.24],
    ['xingqiu', 1, 3.2504, 16.9176 * 8.349 + 60.53229, 0.24],
  ] as const)('binds %s skill hit %i to the sourced T9 coefficient', async (id, hitIndex, multiplier, characterAttack, attackPercent) => {
    const build: Build = { dataVersion: DATA_VERSION, character: await getCharacter(id), weapon: await getWeapon('harbingerofdawn'),
      sets: [], artifacts: [], artifactMain: await getArtifactMain(), level: 90, ascension: 6, constellation: 0,
      talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 90, weaponAscension: 6, refinement: 1 };
    const result = evaluateDamage(build, { skillId: `${id}.skill`, hitIndex, crit: null, reaction: null, conditions: { hpRatio: 1 } }, undefined);
    expect(result.parts.attack).toBeCloseTo((characterAttack + 38.7413 * 7.346 + 116.7) * (1 + attackPercent), 9);
    expect(result.parts.multiplier).toBe(multiplier);
    expect(result.value).toBeNull(); // No invented enemy or observed crit/reaction.
  });

  it('uses a strict 90% HP threshold and actual refinement values without assuming unknown HP', async () => {
    const build: Build = { dataVersion: DATA_VERSION, character: await getCharacter('jean'), weapon: await getWeapon('harbingerofdawn'),
      sets: [], artifacts: [], artifactMain: await getArtifactMain(), level: 90, ascension: 6, constellation: 0,
      talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 90, weaponAscension: 6, refinement: 1 };
    expect(resolveBuild(build, { hpRatio: 0.9 }).stats.critRate).toBeCloseTo(0.05, 12);
    expect(resolveBuild(build, { hpRatio: 1 }).stats.critRate).toBeCloseTo(0.05 + 0.14, 12);
    expect(resolveBuild({ ...build, refinement: 5 }, { hpRatio: 1 }).stats.critRate).toBeCloseTo(0.05 + 0.28, 12);
    expect(resolveBuild(build, { hpRatio: null }).issues.some(issue => issue.code === 'unknown')).toBe(true);
  });
});
