import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getCharacter, getReactionRules, getWeapon } from '@leyline/game-data';
import { damageRequestSchema, elements, projectSchema, type Build, type DamageRequest, type Enemy, type StatKey } from '@leyline/schema';
import { evaluateDamage, evaluateTimeline, resolveBuild } from '@leyline/engine';
import { evaluateHitReaction } from '../../../../src/engine/src/attributes/hit-reaction';
import { calculateDamageProduct } from '../../../../src/engine/src/attributes/damage';
import { evaluateHitBase } from '../../../../src/engine/src/attributes/hit-base';
import { addActorFromBuild, addSkillHit } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { createAccount } from '../../../../src/web/src/domain/account';
import { previewEnkaImport } from '../../../../src/web/src/domain/enka-import';

const enemy: Enemy = { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])) as Enemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
async function setting(id: string): Promise<Build> {
  return { dataVersion: DATA_VERSION, character: await getCharacter(id), weapon: await getWeapon('favoniussword'), reactionRules: await getReactionRules(),
    artifactMain: await getArtifactMain(), artifacts: [], sets: [], level: 90, ascension: 6, constellation: 0, talents: { normal: 9, skill: 9, burst: 9 },
    weaponLevel: 90, weaponAscension: 6, refinement: 1 };
}
const request = (id: string, type: 'melt' | 'vaporize'): DamageRequest => ({ skillId: `${id}.skill`, hitIndex: 0, crit: 'noncritical', reaction: { type, trigger: 'record-owner' } });

// Independent legal single-hit settings. No target aura history or observed combat is invented.
describe('annotated amplifying reactions reuse the damage pipeline', () => {
  it.each([
    ['kaeya', 'melt', 3.2504, 18.6984 * 8.349 + 66.90411, 1.5],
    ['xingqiu', 'vaporize', 2.856, (16.9176 * 8.349 + 60.53229) * 1.24, 2],
  ] as const)('calculates %s %s once in direct and timeline evaluation', async (id, type, coefficient, characterAttack, reactionMultiplier) => {
    const build = await setting(id);
    // ATK% also applies to the weapon's white ATK for Xingqiu's 24% ascension.
    const attack = id === 'xingqiu' ? characterAttack + (41.0671 * 7.275 + 155.6) * 1.24 : characterAttack + 41.0671 * 7.275 + 155.6;
    const elementBonus = id === 'xingqiu' ? 1.2 : 1;
    const expected = attack * coefficient * elementBonus * 0.5 * 0.9 * reactionMultiplier;
    const hit = request(id, type);
    const direct = evaluateDamage(build, hit, enemy);
    expect(direct.status).toBe('complete');
    expect(direct.value).toBeCloseTo(expected, 7);
    expect(direct.reaction).toMatchObject({ type, family: 'amplifying', trigger: 'record-owner', multiplier: reactionMultiplier, addedBaseDamage: 0, elementalMastery: 0, bonus: 0 });
    const project = createEmptyProject();
    project.enemy = enemy;
    const actor = addActorFromBuild(project, build);
    addSkillHit(project, actor, hit.skillId, hit.hitIndex, 0, hit);
    const original = JSON.stringify(project);
    const timeline = evaluateTimeline(project);
    expect(timeline.status).toBe('complete');
    expect(timeline.points).toHaveLength(1);
    expect(timeline.totalValue).toBeCloseTo(expected, 7);
    expect(timeline.reads?.some(read => read.key === 'elementalMastery')).toBe(true);
    expect(timeline.reads?.some(read => read.key === `${type}ReactionBonus`)).toBe(true);
    expect(JSON.stringify(project)).toBe(original);
    expect(evaluateTimeline(projectSchema.parse(JSON.parse(original))).totalValue).toBeCloseTo(expected, 7);
  });

  it('requires the carried reaction snapshot and explicit ownership without querying current data', async () => {
    const build = await setting('kaeya');
    const hit = request('kaeya', 'melt');
    delete build.reactionRules;
    const missing = evaluateDamage(build, hit, enemy);
    expect(missing.status).toBe('partial');
    expect(missing.value).toBeNull();
    expect(missing.reaction?.rulesRevision).toBeNull();
    expect(missing.issues.some(issue => issue.message.includes('不会读取最新目录'))).toBe(true);
    expect(evaluateDamage(build, { ...hit, reaction: 'none' }, enemy).status).toBe('complete');
    build.reactionRules = await getReactionRules();
    const unknown = evaluateDamage(build, { ...hit, reaction: { type: 'melt', trigger: null } }, enemy);
    expect(unknown.status).toBe('partial');
    expect(unknown.reaction?.elementalMastery).toBeNull();
    expect(unknown.issues.some(issue => issue.message.includes('触发归属'))).toBe(true);
  });

  it('rejects incompatible elements and unsupported types instead of treating them as no reaction', async () => {
    const build = await setting('kaeya');
    expect(evaluateDamage(build, request('kaeya', 'vaporize'), enemy).status).toBe('invalid');
    expect(damageRequestSchema.safeParse({ ...request('kaeya', 'melt'), reaction: { type: 'overloaded', trigger: 'record-owner' } }).success).toBe(false);
    expect(damageRequestSchema.safeParse({ ...request('kaeya', 'melt'), output: 'reaction' }).success).toBe(false);
    const physical = await setting('aether');
    expect(evaluateDamage(physical, { ...request('aether', 'melt'), skillId: 'aether.normal' }, enemy).status).toBe('invalid');
  });

  it('preserves the crit mode and avoids EM reads for none or unknown reactions', async () => {
    const build = await setting('kaeya');
    for (const crit of ['critical', 'expected'] as const) {
      const none = evaluateDamage(build, { ...request('kaeya', 'melt'), crit, reaction: 'none' }, enemy);
      const melt = evaluateDamage(build, { ...request('kaeya', 'melt'), crit }, enemy);
      expect(melt.status).toBe('complete');
      expect(melt.value).toBeCloseTo(none.value! * 1.5, 8);
    }
    const project = createEmptyProject();
    project.enemy = enemy;
    const actor = addActorFromBuild(project, build);
    const id = addSkillHit(project, actor, 'kaeya.skill', 0, 0, { crit: 'noncritical', reaction: 'none' });
    expect(evaluateTimeline(project).reads?.some(read => read.key === 'elementalMastery' || read.key === 'meltReactionBonus')).toBe(false);
    project.timeline.find(record => record.id === id)!.damage!.reaction = null;
    expect(evaluateTimeline(project).reads?.some(read => read.key === 'elementalMastery')).toBe(false);
    expect(evaluateTimeline(project).status).toBe('partial');
  });
});

describe('source-derived reaction formula components', () => {
  it.each([
    ['vaporize', 'hydro', 2], ['vaporize', 'pyro', 1.5], ['melt', 'pyro', 2], ['melt', 'cryo', 1.5],
  ] as const)('uses %s triggered by %s with the declared direction', async (type, element, multiplier) => {
    // Zero EM is the no-artifact, non-EM weapon/ascension component setting.
    const result = evaluateHitReaction({ type, trigger: 'record-owner' }, element, 90, await getReactionRules(), () => 0);
    expect(result.issues).toEqual([]);
    expect(result.details.multiplier).toBe(multiplier);
  });

  it.each([1, 80, 90, 95, 100])('uses adopted level %i with Lisa and Nahida source EM', async level => {
    const rules = await getReactionRules();
    const levels = { 1: 17.165606, 80: 1077.4437, 90: 1446.8535, 95: 1561.468, 100: 1674.8092 };
    // Fixed 96/115.2 EM are the respective six-ascension, basic-catalyst, no-artifact components.
    // Level 1 is a level-table check only, not a six-ascension equipped build.
    const aggravate = evaluateHitReaction({ type: 'aggravate', trigger: 'record-owner' }, 'electro', level, rules, key => key === 'elementalMastery' ? 96 : 0);
    const spread = evaluateHitReaction({ type: 'spread', trigger: 'record-owner' }, 'dendro', level, rules, key => key === 'elementalMastery' ? 115.2 : 0);
    expect(aggravate.issues).toEqual([]);
    expect(spread.issues).toEqual([]);
    expect(aggravate.details.addedBaseDamage).toBeCloseTo(levels[level as keyof typeof levels] * 1.15 * 37 / 27, 8);
    expect(spread.details.addedBaseDamage).toBeCloseTo(levels[level as keyof typeof levels] * 1.25 * 197 / 137, 8);
    expect(spread.details.multiplier).toBe(1);
  });

  it('applies the source Crimson Witch reaction term inside the amplification bracket', async () => {
    // This is the 15% melt/vaporize formula term only, not a claim that the full set is supported.
    const result = evaluateHitReaction({ type: 'melt', trigger: 'record-owner' }, 'cryo', 90, await getReactionRules(), key => key === 'elementalMastery' ? 0 : 0.15);
    expect(result.details.multiplier).toBeCloseTo(1.725, 12);
  });

  it('adds Nahida spread before the common bonus, crit, defense and resistance multipliers', async () => {
    const character = await getCharacter('nahida');
    const weapon = await getWeapon('apprenticesnotes');
    const skill = character.talents.find(talent => talent.id === 'nahida.skill')!;
    const attack = 23.275 * 8.739 + 95.57275 + weapon.baseAttack * weapon.attackCurve[70] + weapon.promotion[4];
    const em = 115.2;
    const base = evaluateHitBase(skill, 2, 9, key => key === 'attack' ? attack : key === 'elementalMastery' ? em : null);
    const reaction = evaluateHitReaction({ type: 'spread', trigger: 'record-owner' }, 'dendro', 90, await getReactionRules(), key => key === 'elementalMastery' ? em : 0);
    const expectedBase = attack * 1.7544 + em * 3.5088;
    const expectedSpread = 1446.8535 * 1.25 * 197 / 137;
    expect(base.value).toBeCloseTo(expectedBase, 8);
    const parts = { attack, multiplier: 1.7544, bonus: 1, crit: 1.5, defense: 0.5, resistance: 0.9 };
    expect(calculateDamageProduct(base.value, parts, reaction.details)).toBeCloseTo((expectedBase + expectedSpread) * 1.5 * 0.5 * 0.9, 7);
    expect(calculateDamageProduct(null, parts, reaction.details)).toBeNull();
    expect(character.capabilities.calculation.supported).toBe(false); // Formula components do not complete the character.
  });

  it('keeps missing levels or attributes unknown and rejects invalid component values', async () => {
    const rules = await getReactionRules();
    rules.levelMultipliers[90] = null; // A missing-field derivative of the adopted source, never a substitute table.
    expect(evaluateHitReaction({ type: 'spread', trigger: 'record-owner' }, 'dendro', 90, rules, () => 0).details.addedBaseDamage).toBeNull();
    expect(evaluateHitReaction({ type: 'melt', trigger: 'record-owner' }, 'cryo', 90, rules, () => null).details.multiplier).toBeNull();
    expect(evaluateHitReaction({ type: 'melt', trigger: 'record-owner' }, 'cryo', 90, rules, () => -1).issues.some(issue => issue.code === 'invalid-input')).toBe(true);
    expect(evaluateHitReaction({ type: 'melt', trigger: 'record-owner' }, 'cryo', 90, rules, () => Infinity).issues.some(issue => issue.code === 'invalid-input')).toBe(true);
  });
});

const recording = '.references/enka/official-example-2026-11-13.json';
describe.skipIf(!existsSync(recording))('reaction calculations with actual recorded artifact values', () => {
  it('recalculates EM from a theoretical Kaeya loadout and preserves original player data', async () => {
    const response = JSON.parse(readFileSync(recording, 'utf8'));
    const preview = await previewEnkaImport(response, '618285856', createAccount());
    const recorded = preview.rows.find(row => row.character.showcase?.build.character.id === 'bennett')!.character.showcase!.build;
    const original = JSON.stringify(recorded);
    const build = await setting('kaeya');
    // Recorded Bennett artifacts in an explicit theoretical Kaeya setting, not observed wearing.
    build.artifacts = structuredClone(recorded.artifacts);
    build.sets = structuredClone(recorded.sets);
    const stats: Partial<Record<StatKey, number>> = {};
    for (const item of recorded.artifacts) {
      stats[item.mainStat] = (stats[item.mainStat] ?? 0) + recorded.artifactMain[item.mainStat]![item.level];
      for (const sub of item.substats) stats[sub.stat] = (stats[sub.stat] ?? 0) + sub.value;
    }
    const em = stats.elementalMastery ?? 0;
    expect(em).toBeGreaterThan(0);
    const attack = (18.6984 * 8.349 + 66.90411 + 41.0671 * 7.275 + 155.6) * (1 + (stats.attackPercent ?? 0)) + (stats.attack ?? 0);
    const multiplier = 1.5 * (1 + 2.78 * em / (1400 + em));
    const expected = attack * 3.2504 * (1 + (stats.cryoBonus ?? 0)) * 0.5 * 0.9 * multiplier;
    const hit = request('kaeya', 'melt');
    const result = evaluateDamage(build, hit, enemy);
    expect(result.status).toBe('complete');
    expect(result.value).toBeCloseTo(expected, 7);
    expect(result.reaction?.elementalMastery).toBeCloseTo(em, 8);
    const bare = await setting('kaeya');
    const alternate = resolveBuild(build);
    const context = evaluateDamage(bare, hit, enemy, 0, key => Object.hasOwn(alternate.stats, key) ? alternate.stats[key as StatKey] : 0);
    expect(context.value).toBeCloseTo(expected, 7);
    expect(JSON.stringify(recorded)).toBe(original);
  });
});
