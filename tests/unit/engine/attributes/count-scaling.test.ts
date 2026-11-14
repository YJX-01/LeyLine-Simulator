import { describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getCharacter, getWeapon } from '@leyline/game-data';
import { elements, projectSchema, talentSchema, type Build, type DamageRequest, type Enemy } from '@leyline/schema';
import { evaluateDamage, evaluateTimeline } from '@leyline/engine';
import { evaluateHitBase } from '../../../../src/engine/src/attributes/hit-base';
import { addActorFromBuild, addSkillHit } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';

// Pinned genshin-db growth/parameters and KQM counter/Namisen/Resolve/Lightfall facts.
// These are legal independent single-point calculation settings, not player builds or observed timelines.
const enemy: Enemy = { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])) as Enemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
async function calculation(id: string, weapon: string): Promise<Build> {
  return { dataVersion: DATA_VERSION, character: await getCharacter(id), weapon: await getWeapon(weapon),
    artifactMain: await getArtifactMain(), sets: [], artifacts: [], level: 90, ascension: 6, constellation: 0,
    talents: { normal: 1, skill: 9, burst: 9 }, weaponLevel: 70, weaponAscension: 4, refinement: 1 };
}

describe('explicit skill counts multiply additional base scaling through the common attribute reader', () => {
  it.each([0, 1, 2])('adds Beidou counter charge %i before the damage bonus multiplier', async counterCharge => {
    const build = await calculation('beidou', 'wastergreatsword');
    const request: DamageRequest = { skillId: 'beidou.skill', hitIndex: 0, crit: 'noncritical', reaction: 'none', inputs: { counterCharge } };
    const attack = 18.87648 * 8.349 + 67.54129 + 23.245 * 5.968 + 46.7;
    const expectedBase = attack * (2.0672 + 2.72 * counterCharge);
    // R1 now proves this exact C0 path from the formal snapshot, without an external reader.
    const direct = evaluateDamage(build, request, enemy);
    expect(direct.baseDamage).toBeCloseTo(expectedBase, 8);
    expect(direct.parts.bonus).toBeCloseTo(1.24, 12);
    expect(direct.scaling[1]).toMatchObject({ multiplier: 2.72, count: { input: 'counterCharge', value: counterCharge } });
    expect(direct.status).toBe('complete');
    expect(direct.value).toBeCloseTo(expectedBase * 1.24 * 0.5 * 0.9, 8);
    expect(build.character.capabilities.calculation.supported).toBe(false);
    const project = createEmptyProject();
    project.enemy = enemy;
    const actor = addActorFromBuild(project, build);
    project.timeline.push({ id: 'counter-calculation', actor, timeMs: 0, order: 0, kind: 'damage', definition: `${actor}-real-damage`, damage: request });
    const saved = JSON.stringify(project);
    const result = evaluateTimeline(projectSchema.parse(JSON.parse(saved)));
    expect(result.points).toHaveLength(1);
    expect(result.points[0].real?.baseDamage).toBeCloseTo(expectedBase, 8);
    expect(result.totalValue).toBeCloseTo(expectedBase * 1.24 * 0.5 * 0.9, 8);
    expect(result.points[0].real?.scaling[1].count).toEqual(direct.scaling[1].count);
    expect(JSON.stringify(project)).toBe(saved);
  });

  it.each([0, 1, 2])('adds Ayato current HP times Namisen only to Shunsuiken part %i', async hitIndex => {
    const build = await calculation('kamisatoayato', 'dullblade');
    const attack = 23.275 * 8.739 + 95.57275 + 23.245 * 5.968 + 46.7;
    const hp = 1067.7184 * 8.739 + 4384.629;
    const coefficient = [0.9717, 1.0823, 1.1929][hitIndex];
    const request: DamageRequest = { skillId: 'kamisatoayato.skill', hitIndex, crit: 'noncritical', reaction: 'none', inputs: { namisen: 4 } };
    const direct = evaluateDamage(build, request, enemy, 0, stat => stat === 'attack' ? attack : stat === 'hp' ? hp : null);
    expect(direct.baseDamage).toBeCloseTo(attack * coefficient + hp * 0.010308 * 4, 8);
    const talent = build.character.talents.find(talent => talent.id === request.skillId)!;
    expect(talent.hits[hitIndex].category).toBe('normal');
    expect(talent.hits[hitIndex].snapshot).toBeUndefined(); // Current stats, unlike water illusion.
    const unused = evaluateHitBase(talent, 3, 9, stat => stat === 'attack' ? attack : null, { namisen: null });
    expect(unused.value).toBeCloseTo(attack * 1.8644, 8);
    expect(unused.unknownInputs).toEqual([]);
    const zero = evaluateHitBase(talent, hitIndex, 9, stat => stat === 'attack' ? attack : null, { namisen: 0 });
    expect(zero.value).toBeCloseTo(attack * coefficient, 8);
    expect(zero.scaling[1]).toMatchObject({ attribute: null, contribution: 0, count: { value: 0 } });
  });

  it.each([[0, 6.8136, 0.066096], [4, 0.51948, 0.012345], [5, 0.52096, 0.012345], [11, 2.933586, 0.012345]])
    ('preserves fractional Raiden Resolve for burst component %i', async (hitIndex, coefficient, added) => {
      const build = await calculation('raidenshogun', 'beginnersprotector');
      const attack = 26.2542 * 8.739 + 107.80606 + 23.245 * 5.968 + 46.7;
      // Fractional cast-time value from her actual T9 per-energy rate, not rounded stacks.
      const resolve = 80 * 0.19;
      const result = evaluateDamage(build, { skillId: 'raidenshogun.burst', hitIndex, crit: 'noncritical', reaction: 'none', inputs: { resolve } }, enemy,
        0, stat => stat === 'attack' ? attack : null);
      expect(result.baseDamage).toBeCloseTo(attack * (coefficient + added * resolve), 8);
      expect(result.scaling[1].count).toEqual({ input: 'resolve', value: 15.2 });
      expect(result.status).toBe('partial'); // E damage bonus, A4 and other character rules remain pending.
    });

  it('adds Eula energy to the physical explosion and leaves the initial Cryo slash independent', async () => {
    const build = await calculation('eula', 'wastergreatsword');
    const attack = 26.6266 * 8.739 + 109.33523 + 23.245 * 5.968 + 46.7;
    const talent = build.character.talents.find(talent => talent.category === 'burst')!;
    // Zero and one are legal local count assertions; no fabricated attack sequence or C0 max-stack claim.
    for (const energy of [0, 1]) {
      const result = evaluateHitBase(talent, 1, 9, () => attack, { lightfallEnergy: energy });
      expect(result.value).toBeCloseTo(attack * (6.74344 + 1.37776 * energy), 8);
    }
    expect(evaluateHitBase(talent, 0, 9, () => attack).value).toBeCloseTo(attack * 4.1752, 8);
    expect(talent.hits[1].element).toBe('physical');
    expect(talent.hits[1].snapshot).toBeUndefined();
    for (const inputs of [undefined, { lightfallEnergy: null }]) {
      const result = evaluateDamage(build, { skillId: talent.id, hitIndex: 1, crit: 'noncritical', reaction: 'none', inputs }, enemy);
      expect(result.baseDamage).toBeNull();
      expect(result.issues).toContainEqual({ code: 'unknown', message: '命中所需的技能输入尚未确认：lightfallEnergy' });
    }
  });

  it('recalculates Ayato scaling from independently supplied candidate contexts and keeps snapshots independent', async () => {
    const original = await calculation('kamisatoayato', 'favoniussword');
    original.weaponLevel = 90; original.weaponAscension = 6;
    const project = createEmptyProject();
    project.enemy = enemy;
    const actor = addActorFromBuild(project, original);
    project.timeline.push({ id: 'namisen-calculation', actor, timeMs: 0, order: 0, kind: 'damage', definition: `${actor}-real-damage`,
      damage: { skillId: 'kamisatoayato.skill', hitIndex: 0, crit: 'noncritical', reaction: 'none', inputs: { namisen: 4 } } });
    const before = JSON.stringify(project);
    const candidate = projectSchema.parse(JSON.parse(before));
    candidate.candidate.actors[0].build!.weapon = await getWeapon('primordialjadecutter');
    const hp = 1067.7184 * 8.739 + 4384.629;
    const attack = 23.275 * 8.739 + 95.57275;
    const request = project.timeline[0].damage!;
    const base = evaluateDamage(original, request, enemy, 0,
      stat => stat === 'attack' ? attack + 41.0671 * 7.275 + 155.6 : stat === 'hp' ? hp : null);
    // Source-derived R1 Jade Cutter context. This checks common formula consumption, not complete graph support.
    const alternate = evaluateDamage(candidate.candidate.actors[0].build, request, enemy, 0,
      stat => stat === 'attack' ? attack + 44.3358 * 8.458 + 155.6 + hp * 1.2 * 0.012 : stat === 'hp' ? hp * 1.2 : null);
    expect(base.baseDamage).toBeCloseTo((attack + 41.0671 * 7.275 + 155.6) * 0.9717 + hp * 4 * 0.010308, 8);
    expect(alternate.baseDamage).toBeCloseTo((attack + 44.3358 * 8.458 + 155.6 + hp * 1.2 * 0.012) * 0.9717 + hp * 1.2 * 4 * 0.010308, 8);
    expect(evaluateTimeline(candidate).reads?.some(read => read.key === 'hp')).toBe(true);
    expect(evaluateTimeline(candidate).points[0].real?.baseDamage).toBeNull();
    expect(JSON.stringify(project)).toBe(before);
    expect(original.weapon.id).toBe('favoniussword');
  });

  it.each([{ counterCharge: -1 }, { counterCharge: 3 }, { counterCharge: 0.5 }, { resolve: 1 }] as Record<string, number | null>[])
    ('rejects the invalid Beidou count derivative %j through direct and project schemas', async inputs => {
      const build = await calculation('beidou', 'wastergreatsword');
      const request: DamageRequest = { skillId: 'beidou.skill', hitIndex: 0, crit: 'noncritical', reaction: 'none', inputs };
      expect(evaluateDamage(build, request, enemy).status).toBe('invalid');
      const project = createEmptyProject();
      const actor = addActorFromBuild(project, build);
      project.timeline.push({ id: 'invalid-counter-derivative', actor, timeMs: 0, order: 0, kind: 'damage', definition: `${actor}-real-damage`, damage: request });
      expect(projectSchema.safeParse(project).success).toBe(false);
    });

  it('rejects undeclared count references and duplicate input definitions without changing canonical content', async () => {
    const character = await getCharacter('beidou');
    const talent = character.talents.find(talent => talent.category === 'skill')!;
    const missing = structuredClone(talent);
    missing.hits[0].additionalScaling![0].count = 'missing';
    expect(talentSchema.safeParse(missing).success).toBe(false);
    const duplicate = structuredClone(talent);
    duplicate.inputs!.push(structuredClone(duplicate.inputs![0]));
    expect(talentSchema.safeParse(duplicate).success).toBe(false);
    expect(talent.inputs).toHaveLength(1);
  });

  it('does not borrow a missing hit count from actor inputs or default it to zero', async () => {
    const build = await calculation('beidou', 'wastergreatsword');
    const project = createEmptyProject();
    const actor = addActorFromBuild(project, build);
    project.candidate.actors[0].inputs.counterCharge = { value: 2, unit: 'scalar' };
    project.timeline.push({ id: 'unknown-counter-query', actor, timeMs: 0, order: 0, kind: 'damage', definition: `${actor}-real-damage`,
      damage: { skillId: 'beidou.skill', hitIndex: 0, crit: 'noncritical', reaction: 'none' } });
    const result = evaluateTimeline(project);
    expect(result.points[0].real?.scaling[1].count).toEqual({ input: 'counterCharge', value: null });
    expect(result.diagnostics.some(issue => issue.code === 'unknown' && issue.message.includes('counterCharge'))).toBe(true);
  });

  it('rejects a stray counter input atomically on the actual supported Kaeya hit contract', async () => {
    const build = await calculation('kaeya', 'dullblade');
    const project = createEmptyProject();
    const actor = addActorFromBuild(project, build);
    const before = JSON.stringify(project);
    expect(() => addSkillHit(project, actor, 'kaeya.skill', 0, 0,
      { crit: 'noncritical', reaction: 'none', inputs: { counterCharge: 2 } })).toThrow();
    expect(JSON.stringify(project)).toBe(before);
  });

  it('validates Ayato C2 five-stack range while retaining unsupported conditional HP and constellation damage', async () => {
    const build = await calculation('kamisatoayato', 'dullblade');
    const request: DamageRequest = { skillId: 'kamisatoayato.skill', hitIndex: 0, crit: 'noncritical', reaction: 'none', inputs: { namisen: 5 } };
    expect(evaluateDamage(build, request, enemy).status).toBe('invalid');
    build.constellation = 1;
    expect(evaluateDamage(build, request, enemy).status).toBe('invalid');
    build.constellation = 2;
    const accepted = evaluateDamage(build, request, enemy);
    expect(accepted.status).toBe('partial');
    expect(accepted.issues.some(issue => issue.code === 'invalid-input')).toBe(false);
    expect(accepted.value).toBeNull();
    const project = createEmptyProject();
    const actor = addActorFromBuild(project, build);
    project.timeline.push({ id: 'c2-namisen-input-check', actor, timeMs: 0, order: 0, kind: 'damage', definition: `${actor}-real-damage`, damage: request });
    expect(projectSchema.safeParse(project).success).toBe(true);
    request.inputs!.namisen = 6;
    expect(evaluateDamage(build, request, enemy).status).toBe('invalid');
    expect(projectSchema.safeParse(project).success).toBe(false);
  });
});
