import { officialShowcase } from '../../../helpers/recorded-reference';
import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { catalogBaseValue, evaluateCatalogBase } from '../../../helpers/catalog-calculation';
import { selectCatalogHit } from '../../../helpers/catalog-calculation';
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { damageRequestSchema, elements, projectSchema, type Build, type DamageRequest, type Enemy, type Element, type StatKey, type Value, type EvaluatedValue } from '@leyline/schema';
import { compileCalculation, evaluateDamage, evaluateFormula, evaluateTimeline, type CompiledCalculation } from '@leyline/engine';
import { addActorFromBuild, addSkillHit } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { createAccount } from '../../../../src/web/src/domain/account';
import { previewEnkaImport } from '../../../../src/web/src/domain/enka-import';

const enemy: Enemy = { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])) as Enemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
async function setting(id: string): Promise<Build> {
  return { schemaVersion: '0.1.0', kind: 'calculation-build', ...await getBuildSources(), dataVersion: DATA_VERSION, character: await getCharacter(id), weapon: await getWeapon('favoniussword'),
    artifactMain: await getArtifactMain(), artifacts: [], sets: [], level: 90, ascension: 6, constellation: 0, talents: { normal: 9, skill: 9, burst: 9 },
    weaponLevel: 90, weaponAscension: 6, refinement: 1 };
}
const request = (build: Build, type: 'melt' | 'vaporize'): DamageRequest => ({ ...selectCatalogHit(build, `${build.character.id}.skill`, 0), crit: 'noncritical', reaction: { type, trigger: 'record-owner' } });

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
    const hit = request(build, type);
    const direct = evaluateDamage(build, hit, enemy);
    expect(direct.status).toBe('complete');
    expect(direct.value).toBeCloseTo(expected, 7);
    expect(direct.reaction).toMatchObject({ type, family: 'amplifying', trigger: 'record-owner', multiplier: reactionMultiplier, addedBaseDamage: 0, elementalMastery: 0, bonus: 0 });
    const project = createEmptyProject();
    project.enemy = enemy;
    const actor = addActorFromBuild(project, build);
    addSkillHit(project, actor, hit.skillId, 0, 0, hit);
    const original = JSON.stringify(project);
    const timeline = evaluateTimeline(project);
    expect(timeline.status).toBe('complete');
    expect(timeline.points).toHaveLength(1);
    expect(timeline.totalValue).toBeCloseTo(expected, 7);
    expect(timeline.reads?.some(read => read.key === 'elementalMastery')).toBe(true);
    expect(timeline.reads?.some(read => read.key === 'amplifyingReactionBonus')).toBe(true);
    expect(JSON.stringify(project)).toBe(original);
    expect(evaluateTimeline(projectSchema.parse(JSON.parse(original))).totalValue).toBeCloseTo(expected, 7);
  });

  it('requires the carried reaction snapshot and explicit ownership without querying current data', async () => {
    const build = await setting('kaeya');
    const hit = request(build, 'melt');
    const incomplete = structuredClone(build);
    incomplete.character.calculation.bundle.formulas = incomplete.character.calculation.bundle.formulas.filter(formula => formula.identity.id !== 'cryo-ordinary-reaction');
    const missing = evaluateDamage(incomplete, hit, enemy);
    expect(missing.status).toBe('invalid');
    expect(missing.value).toBeNull();
    expect(evaluateDamage(build, { ...hit, reaction: 'none' }, enemy).status).toBe('complete');
    const unknown = evaluateDamage(build, { ...hit, reaction: { type: 'melt', trigger: null } }, enemy);
    expect(unknown.status).toBe('partial');
    expect(unknown.reaction?.elementalMastery).toBeNull();
    expect(unknown.issues.some(issue => issue.message.includes('触发归属'))).toBe(true);
  });

  it('rejects incompatible elements and unsupported types instead of treating them as no reaction', async () => {
    const build = await setting('kaeya');
    expect(evaluateDamage(build, request(build, 'vaporize'), enemy).status).toBe('invalid');
    expect(damageRequestSchema.safeParse({ ...request(build, 'melt'), reaction: { type: 'overloaded', trigger: 'record-owner' } }).success).toBe(false);
    expect(damageRequestSchema.safeParse({ ...request(build, 'melt'), output: 'reaction' }).success).toBe(false);
    const physical = await setting('aether');
    expect(evaluateDamage(physical, { ...request(build, 'melt'), ...selectCatalogHit(physical, 'aether.normal', 0) }, enemy).status).toBe('invalid');
  });

  it('preserves the crit mode and avoids EM reads for none or unknown reactions', async () => {
    const build = await setting('kaeya');
    for (const crit of ['critical', 'expected'] as const) {
      const none = evaluateDamage(build, { ...request(build, 'melt'), crit, reaction: 'none' }, enemy);
      const melt = evaluateDamage(build, { ...request(build, 'melt'), crit }, enemy);
      expect(melt.status).toBe('complete');
      expect(melt.value).toBeCloseTo(none.value! * 1.5, 8);
    }
    const project = createEmptyProject();
    project.enemy = enemy;
    const actor = addActorFromBuild(project, build);
    const id = addSkillHit(project, actor, 'kaeya.skill', 0, 0, { crit: 'noncritical', reaction: 'none' });
    expect(evaluateTimeline(project).reads?.some(read => read.key === 'elementalMastery' || read.key === 'amplifyingReactionBonus')).toBe(false);
    project.timeline.find(record => record.id === id)!.damage!.reaction = null;
    expect(evaluateTimeline(project).reads?.some(read => read.key === 'elementalMastery')).toBe(false);
    expect(evaluateTimeline(project).status).toBe('partial');
  });
});

describe('source-derived reaction formula components', () => {
  let program: CompiledCalculation;
  beforeAll(async () => {
    const compiled = compileCalculation(readCalculationLibrary());
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
    program = compiled.program;
  });
  const ref = (id: string) => ({ namespace: 'builtin', id, revision: '1' });
  const quantity = (unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): Value => ({ kind: 'quantity', unit, value });
  const numeric = (value: EvaluatedValue): number | null => value.state === 'known' && value.value.kind === 'quantity' ? value.value.value : null;
  function reaction(element: Element, mode: string, em: number | null, level: number, bonus = 0) {
    const table = evaluateFormula(program, ref('reaction-level-multiplier'), { level: quantity('count', level) }).outputs.value;
    return evaluateFormula(program, ref(element + '-ordinary-reaction'), {
      mode: { kind: 'enum', value: mode }, em: em === null ? null : quantity('elementalMastery', em),
      levelMultiplier: table.state === 'known' ? table.value : null, amplifyingBonus: quantity('scalar', bonus), additiveBonus: quantity('scalar', 0),
    });
  }
  it.each([['vaporize', 'hydro', 2], ['vaporize', 'pyro', 1.5], ['melt', 'pyro', 2], ['melt', 'cryo', 1.5]] as const)
    ('uses %s triggered by %s with the adopted direction', (type, element, multiplier) => {
      expect(numeric(reaction(element, type, 0, 90).outputs.multiplier)).toBe(multiplier);
    });

  it.each([1, 80, 90, 95, 100] as const)('uses adopted level %i with Lisa and Nahida source EM', level => {
    const levels = { 1: 17.165606, 80: 1077.4437, 90: 1446.8535, 95: 1561.468, 100: 1674.8092 };
    expect(numeric(reaction('electro', 'aggravate', 96, level).outputs.added)).toBeCloseTo(levels[level] * 1.15 * 37 / 27, 8);
    expect(numeric(reaction('dendro', 'spread', 115.2, level).outputs.added)).toBeCloseTo(levels[level] * 1.25 * 197 / 137, 8);
  });

  it('applies Crimson Witch’s source bonus inside the amplification bracket', () => {
    expect(numeric(reaction('cryo', 'melt', 0, 90, 0.15).outputs.multiplier)).toBeCloseTo(1.725, 12);
  });

  it('adds Nahida spread before crit, defense and resistance', async () => {
    const character = await getCharacter('nahida'), weapon = await getWeapon('apprenticesnotes');
    const attack = 23.275 * 8.739 + 95.57275 + weapon.baseAttack * weapon.attackCurve[70] + weapon.promotion[4], em = 115.2;
    const base = catalogBaseValue(evaluateCatalogBase(character, 'nahida.skill', 2, 9, stat => stat === 'attack' ? attack : stat === 'elementalMastery' ? em : null));
    const expectedBase = attack * 1.7544 + em * 3.5088, expectedSpread = 1446.8535 * 1.25 * 197 / 137;
    expect(base).toBeCloseTo(expectedBase, 8);
    const added = reaction('dendro', 'spread', em, 90).outputs.added;
    const result = evaluateFormula(program, ref('ordinary-hit'), {
      skillBase: quantity('damage', base!), additiveReactionBase: added.state === 'known' ? added.value : null,
      ordinaryBonusMinusReduction: quantity('scalar', 0), critFactor: quantity('scalar', 1.5), defenseFactor: quantity('scalar', 0.5), resistanceFactor: quantity('scalar', 0.9),
    });
    expect(numeric(result.outputs.value)).toBeCloseTo((expectedBase + expectedSpread) * 1.5 * 0.5 * 0.9, 7);
  });

  it('preserves unknown attributes and rejects invalid component values', () => {
    expect(reaction('cryo', 'melt', null, 90).outputs.multiplier.state).toBe('unknown');
    expect(reaction('cryo', 'melt', -1, 90).outputs.multiplier.state).toBe('invalid');
  });
});

describe.skipIf(!existsSync(officialShowcase))('reaction calculations with actual recorded artifact values', () => {
  it('recalculates EM from a theoretical Kaeya loadout and preserves original player data', async () => {
    const response = JSON.parse(readFileSync(officialShowcase, 'utf8'));
    const preview = await previewEnkaImport(response, '618285856', createAccount());
    const recorded = preview.rows.find(row => row.character.showcase?.build.character.id === 'bennett')!.character.showcase!.build;
    const original = JSON.stringify(recorded);
    const build = await setting('kaeya');
    // Recorded Bennett artifacts in an explicit theoretical Kaeya setting, not observed wearing.
    build.artifacts = structuredClone(recorded.artifacts);
    build.sets = structuredClone(recorded.sets);
    build.sources = recorded.sources;
    const stats: Partial<Record<StatKey, number>> = {};
    for (const item of recorded.artifacts) {
      stats[item.mainStat] = (stats[item.mainStat] ?? 0) + recorded.artifactMain[item.rarity][item.mainStat]![item.level];
      for (const sub of item.substats) stats[sub.stat] = (stats[sub.stat] ?? 0) + sub.value;
    }
    const em = stats.elementalMastery ?? 0;
    expect(em).toBeGreaterThan(0);
    const attack = (18.6984 * 8.349 + 66.90411 + 41.0671 * 7.275 + 155.6) * (1 + (stats.attackPercent ?? 0)) + (stats.attack ?? 0);
    const multiplier = 1.5 * (1 + 2.78 * em / (1400 + em));
    const expected = attack * 3.2504 * (1 + (stats.cryoBonus ?? 0)) * 0.5 * 0.9 * multiplier;
    const hit = request(build, 'melt');
    const result = evaluateDamage(build, hit, enemy);
    expect(result.status).toBe('complete');
    expect(result.value).toBeCloseTo(expected, 7);
    expect(result.reaction?.elementalMastery).toBeCloseTo(em, 8);
    expect(JSON.stringify(recorded)).toBe(original);
  });
});
