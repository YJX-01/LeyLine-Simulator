import { eventCounts } from '../../../helpers/catalog-calculation';
import { selectCatalogHit } from '../../../helpers/catalog-calculation';
import { describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { elements, projectSchema, characterDefinitionSchema, type Build, type DamageRequest, type Enemy } from '@leyline/schema';
import { evaluateDamage, evaluateTimeline } from '@leyline/engine';
import { evaluateCatalogBase, catalogBaseValue } from '../../../helpers/catalog-calculation';
import { addActorFromBuild, addSkillHit } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';

// Pinned genshin-db growth/parameters and KQM counter/Namisen/Resolve/Lightfall facts.
// These are legal independent single-point calculation settings, not player builds or observed timelines.
const enemy: Enemy = { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])) as Enemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
async function calculation(id: string, weapon: string): Promise<Build> {
  return { schemaVersion: '0.2.0', kind: 'calculation-build', ...await getBuildSources(), dataVersion: DATA_VERSION, character: await getCharacter(id), weapon: await getWeapon(weapon),
    artifactMain: await getArtifactMain(), sets: [], artifacts: [], level: 90, ascension: 6, constellation: 0,
    talents: { normal: 1, skill: 9, burst: 9 }, weaponLevel: 70, weaponAscension: 4, refinement: 1 };
}

describe('explicit skill counts multiply additional base scaling through the common attribute reader', () => {
  it.each([0, 1, 2])('adds Beidou counter charge %i before the damage bonus multiplier', async counterCharge => {
    const build = await calculation('beidou', 'wastergreatsword');
    const request: DamageRequest = { hit: { definition: { group: 'characters' as const, namespace: 'builtin', id: 'beidou', revision: '5' }, hitId: 'beidou.skill.param3' }, crit: 'noncritical', reaction: 'none', facts: eventCounts({ counterCharge }) };
    const attack = 18.87648 * 8.349 + 67.54129 + 23.245 * 5.968 + 46.7;
    const expectedBase = attack * (2.0672 + 2.72 * counterCharge);
    // R1 now proves this exact C0 path from the formal snapshot, without an external reader.
    const direct = evaluateDamage(build, request, enemy);
    expect(direct.baseDamage).toBeCloseTo(expectedBase, 8);
    expect(direct.parts.bonus).toBeCloseTo(1.24, 12);
    expect(direct.scaling[1]).toMatchObject({ multiplier: counterCharge ? 2.72 : null, count: { input: 'counterCharge', value: counterCharge } });
    expect(direct.status).toBe('complete');
    expect(direct.value).toBeCloseTo(expectedBase * 1.24 * 0.5 * 0.9, 8);
    expect(build.character.calculation.bundle.coverage.some(record => record.scope.kind === 'context' && record.resolution === 'unavailable')).toBe(true);
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
    const talent = build.character.talents.find(talent => talent.id === 'kamisatoayato.skill')!;
    const component = evaluateCatalogBase(build.character, talent.id, hitIndex, 9, stat => stat === 'attack' ? attack : stat === 'hp' ? hp : null, { namisen: 4 });
    expect(catalogBaseValue(component)).toBeCloseTo(attack * coefficient + hp * 0.010308 * 4, 8);
    expect(talent.hits[hitIndex].category).toBe('normal');
    expect(talent.hits[hitIndex].base.captures).toEqual([]);
    const unused = evaluateCatalogBase(build.character, talent.id, 3, 9, stat => stat === 'attack' ? attack : null, { namisen: null });
    expect(catalogBaseValue(unused)).toBeCloseTo(attack * 1.8644, 8);
    expect(unused.requiredInputs).toEqual([]);
    const zero = evaluateCatalogBase(build.character, talent.id, hitIndex, 9, stat => stat === 'attack' ? attack : null, { namisen: 0 });
    expect(catalogBaseValue(zero)).toBeCloseTo(attack * coefficient, 8);
    expect(zero.trace.some(node => node.nodeId === 'attribute.hp')).toBe(false);
  });

  it.each([[0, 6.8136, 0.066096], [4, 0.51948, 0.012345], [5, 0.52096, 0.012345], [11, 2.933586, 0.012345]])
    ('preserves fractional Raiden Resolve for burst component %i', async (hitIndex, coefficient, added) => {
      const build = await calculation('raidenshogun', 'beginnersprotector');
      const attack = 26.2542 * 8.739 + 107.80606 + 23.245 * 5.968 + 46.7;
      // Fractional cast-time value from her actual T9 per-energy rate, not rounded stacks.
      const resolve = 80 * 0.19;
      const result = evaluateCatalogBase(build.character, 'raidenshogun.burst', hitIndex, 9, stat => stat === 'attack' ? attack : null, { resolve });
      expect(catalogBaseValue(result)).toBeCloseTo(attack * (coefficient + added * resolve), 8);
      expect(result.trace.some(node => node.nodeId === 'resolve' && node.value?.value === 15.2)).toBe(true);
      expect(Object.keys(build.character.talents.find(talent => talent.id === 'raidenshogun.burst')!.hits[hitIndex].damage)).toEqual(['ordinary']);
    });

  it('adds Eula energy to the physical explosion and leaves the initial Cryo slash independent', async () => {
    const build = await calculation('eula', 'wastergreatsword');
    const attack = 26.6266 * 8.739 + 109.33523 + 23.245 * 5.968 + 46.7;
    const talent = build.character.talents.find(talent => talent.category === 'burst')!;
    // Zero and one are legal local count assertions; no fabricated attack sequence or C0 max-stack claim.
    for (const energy of [0, 1]) {
      const result = evaluateCatalogBase(build.character, talent.id, 1, 9, () => attack, { lightfallEnergy: energy });
      expect(catalogBaseValue(result)).toBeCloseTo(attack * (6.74344 + 1.37776 * energy), 8);
    }
    expect(catalogBaseValue(evaluateCatalogBase(build.character, talent.id, 0, 9, () => attack))).toBeCloseTo(attack * 4.1752, 8);
    expect(talent.hits[1].element).toBe('physical');
    expect(talent.hits[1].snapshot).toBeUndefined();
    for (const inputs of [undefined, { lightfallEnergy: null }]) {
      const result = evaluateCatalogBase(build.character, talent.id, 1, 9, () => attack, inputs);
      expect(catalogBaseValue(result)).toBeNull();
      expect(result.requiredInputs.some(input => input.key === 'lightfallEnergy')).toBe(true);
    }
  });

  it('retains Ayato base bindings across a candidate equipment change', async () => {
    const original = await calculation('kamisatoayato', 'favoniussword');
    const candidate = { ...original, weapon: await getWeapon('primordialjadecutter') };
    const before = JSON.stringify(original), hp = 1067.7184 * 8.739 + 4384.629;
    const attack = 23.275 * 8.739 + 95.57275;
    for (const [build, a, h] of [[original, attack + 41.0671 * 7.275 + 155.6, hp], [candidate, attack + 44.3358 * 8.458 + 155.6 + hp * 1.2 * 0.012, hp * 1.2]] as const) {
      const result = evaluateCatalogBase(build.character, 'kamisatoayato.skill', 0, 9, stat => stat === 'attack' ? a : stat === 'hp' ? h : null, { namisen: 4 });
      expect(catalogBaseValue(result)).toBeCloseTo(a * 0.9717 + h * 4 * 0.010308, 8);
    }
    expect(JSON.stringify(original)).toBe(before);
  });

  it.each([{ counterCharge: -1 }, { counterCharge: 3 }, { counterCharge: 0.5 }, { resolve: 1 }] as Record<string, number | null>[])
    ('rejects the invalid Beidou count derivative %j through direct and project schemas', async inputs => {
      const build = await calculation('beidou', 'wastergreatsword');
      const request: DamageRequest = { hit: { definition: { group: 'characters' as const, namespace: 'builtin', id: 'beidou', revision: '5' }, hitId: 'beidou.skill.param3' }, crit: 'noncritical', reaction: 'none', facts: eventCounts(inputs) };
      expect(evaluateDamage(build, request, enemy).status).toBe('invalid');
      const project = createEmptyProject();
      const actor = addActorFromBuild(project, build);
      project.timeline.push({ id: 'invalid-counter-derivative', actor, timeMs: 0, order: 0, kind: 'damage', definition: `${actor}-real-damage`, damage: request });
      expect(projectSchema.safeParse(project).success).toBe(false);
    });

  it('rejects undeclared count references and duplicate input definitions without changing canonical content', async () => {
    const character = await getCharacter('beidou');
    const talent = character.talents.find(talent => talent.category === 'skill')!;
    const missing = structuredClone(character);
    delete missing.talents.find(talent => talent.category === 'skill')!.inputs;
    expect(characterDefinitionSchema.safeParse(missing).success).toBe(false);
    const duplicate = structuredClone(character);
    const inputs = duplicate.talents.find(talent => talent.category === 'skill')!.inputs!;
    inputs.push(structuredClone(inputs[0]));
    expect(characterDefinitionSchema.safeParse(duplicate).success).toBe(false);
    expect(talent.inputs).toHaveLength(1);
  });

  it('does not borrow a missing hit count from actor inputs or default it to zero', async () => {
    const build = await calculation('beidou', 'wastergreatsword');
    const project = createEmptyProject();
    const actor = addActorFromBuild(project, build);
    project.candidate.actors[0].inputs.counterCharge = { value: 2, unit: 'scalar' };
    project.timeline.push({ id: 'unknown-counter-query', actor, timeMs: 0, order: 0, kind: 'damage', definition: `${actor}-real-damage`,
      damage: { hit: { definition: { group: 'characters' as const, namespace: 'builtin', id: 'beidou', revision: '5' }, hitId: 'beidou.skill.param3' }, crit: 'noncritical', reaction: 'none' } });
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
      { crit: 'noncritical', reaction: 'none', facts: eventCounts({ counterCharge: 2 }) })).toThrow();
    expect(JSON.stringify(project)).toBe(before);
  });

  it('uses Ayato’s C2 maximum HP at three stacks and applies C1 only against targets at or below half health', async () => {
    const build = await calculation('kamisatoayato', 'dullblade');
    const request: DamageRequest = { hit: { definition: { group: 'characters' as const, namespace: 'builtin', id: 'kamisatoayato', revision: '5' }, hitId: 'kamisatoayato.skill.param1' }, crit: 'noncritical', reaction: 'none', facts: eventCounts({ namisen: 5 }) };
    expect(evaluateDamage(build, request, enemy).status).toBe('invalid');
    build.constellation = 1;
    expect(evaluateDamage(build, request, enemy).status).toBe('invalid');
    build.constellation = 2;
    expect(evaluateDamage(build, request, enemy).value).toBeNull();
    const attack = 23.275 * 8.739 + 95.57275 + 23.245 * 5.968 + 46.7;
    const hp = 1067.7184 * 8.739 + 4384.629;
    for (const stacks of [2,3,5]) for (const health of [.5,.5001]) {
      request.facts=[...eventCounts({namisen:stacks}),{subject:{kind:'target',id:'target'},values:{targetHpRatio:{value:{kind:'quantity',unit:'scalar',value:health},provenance:'explicit',sourceRefs:[]}}}];
      const accepted=evaluateDamage(build,request,enemy);
      expect(accepted.issues.some(issue=>issue.code==='invalid-input')).toBe(false);
      expect(accepted.value).toBeCloseTo((attack*.9717+hp*(stacks>=3?1.5:1)*.010308*stacks)*.45*(health<=.5?1.4:1),7);
    }
    request.facts = eventCounts({ namisen: 6 });
    expect(evaluateDamage(build, request, enemy).status).toBe('invalid');
  });
});
