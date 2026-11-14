import { describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getCharacter, getWeapon } from '@leyline/game-data';
import { elements, talentSchema, type Build, type Enemy, type Talent, type StatKey } from '@leyline/schema';
import { evaluateDamage, evaluateTimeline, resolveBuild } from '@leyline/engine';
import { evaluateHitBase } from '../../../../src/engine/src/attributes/hit-base';
import { addActorFromBuild } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { talentBonus } from '../../../../src/web/src/domain/character-info';

// Independent legal calculation settings, never presented as player equipment or observed combat.
// Hilichurl resistances: pinned KQM resources/compendiums/enemy-resistances.md.
const hilichurl: Enemy = { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])) as Enemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
async function setting(id: string, weapon = 'harbingerofdawn'): Promise<Build> {
  return { dataVersion: DATA_VERSION, character: await getCharacter(id), weapon: await getWeapon(weapon),
    sets: [], artifacts: [], artifactMain: await getArtifactMain(), level: 90, ascension: 6, constellation: 0,
    talents: { normal: 1, skill: 9, burst: 9 }, weaponLevel: 90, weaponAscension: 6, refinement: 1 };
}

describe('shared damage formula with source-derived calculation settings', () => {
  it.each([
    ['jean', 0, 0.88796], ['jean', 5, 2.97672], ['jean', 8, 2.933586],
    ['kaeya', 0, 0.9875], ['kaeya', 6, 1.343], ['kaeya', 9, 2.933586],
    ['xingqiu', 2, 0.52456], ['xingqiu', 8, 1.03174], ['xingqiu', 11, 2.933586],
  ] as const)('evaluates the source-bound %s normal-family hit %i at talent 9', async (id, hitIndex, coefficient) => {
    const build = await setting(id, 'favoniussword');
    build.talents.normal = 9;
    // Fixed genshin-db character growth, level-90 Favonius Sword and talent parameters.
    const white = id === 'jean' ? 18.62 * 8.739 + 76.4582
      : id === 'kaeya' ? 18.6984 * 8.349 + 66.90411 : 16.9176 * 8.349 + 60.53229;
    const attack = (white + 41.0671 * 7.275 + 155.6) * (id === 'xingqiu' ? 1.24 : 1);
    const expected = attack * coefficient * 0.5 * 0.9;
    const damage = { skillId: `${id}.normal`, hitIndex, crit: 'noncritical' as const, reaction: 'none' as const };
    const result = evaluateDamage(build, damage, hilichurl);
    expect(result.status).toBe('complete');
    expect(result.value).toBeCloseTo(expected, 8);
    const project = createEmptyProject();
    const actor = addActorFromBuild(project, build);
    project.enemy = hilichurl;
    project.timeline.push({ id: 'normal-calculation-query', actor, timeMs: 0, order: 0,
      kind: 'damage', definition: `${actor}-real-damage`, damage });
    const axis = evaluateTimeline(project);
    expect(axis.points).toHaveLength(1);
    expect(axis.totalValue).toBeCloseTo(expected, 8);
    // One part of Xingqiu's third attack stays one hit, and his Hydro passive does not boost physical damage.
    expect(axis.status).toBe('complete');
  });

  it.each([
    ['aether', 0, 0.44462], ['lumine', 0, 0.44462],
    ['aether', 6, 0.60716], ['lumine', 6, 0.7224],
    ['aether', 8, 1.278377], ['lumine', 8, 1.278377],
  ] as const)('evaluates %s normal-family hit %i through the same direct and timeline formula', async (id, hitIndex, coefficient) => {
    const build = await setting(id);
    const request = { skillId: `${id}.normal`, hitIndex, crit: 'noncritical' as const, reaction: 'none' as const };
    const attack = (17.808 * 8.349 + 63.7182 + 38.7413 * 7.346 + 116.7) * 1.24;
    const expected = attack * coefficient * 0.5 * 0.9;
    const direct = evaluateDamage(build, request, hilichurl);
    expect(direct.status).toBe('complete');
    expect(direct.value).toBeCloseTo(expected, 8);
    const project = createEmptyProject();
    const actor = addActorFromBuild(project, build);
    project.enemy = hilichurl;
    // One explicit calculation query, not an invented combat sequence.
    project.timeline.push({ id: 'calculation-query', actor, timeMs: 0, order: 0, kind: 'damage', definition: `${actor}-real-damage`, damage: request });
    const timeline = evaluateTimeline(project);
    expect(timeline.status).toBe('complete');
    expect(timeline.totalValue).toBeCloseTo(expected, 8);
    expect(timeline.reads?.some(read => read.key === 'critRate')).toBe(false);
    expect(timeline.reads?.some(read => read.key === 'attackPercent' && read.value === 0.24)).toBe(true);
  });

  it('only consumes HP-gated Harbinger crit rate when the chosen crit mode needs it', async () => {
    const build = await setting('jean');
    const request = { skillId: 'jean.skill', hitIndex: 0, crit: 'noncritical' as const, reaction: 'none' as const };
    const expectedBase = (18.62 * 8.739 + 76.4582 + 38.7413 * 7.346 + 116.7) * 4.964;
    const noncritical = evaluateDamage(build, request, hilichurl);
    expect(noncritical.panel.status).toBe('partial');
    expect(noncritical.status).toBe('complete');
    expect(noncritical.baseDamage).toBeCloseTo(expectedBase, 8);
    expect(noncritical.value).toBeCloseTo(expectedBase * 0.5 * 0.9, 8);
    expect(evaluateDamage(build, { ...request, crit: 'critical' }, hilichurl).status).toBe('complete');
    const expected = evaluateDamage(build, { ...request, crit: 'expected' }, hilichurl);
    expect(expected.status).toBe('partial');
    expect(expected.value).toBeNull();
    expect(expected.issues.some(issue => issue.message.includes('生命比例'))).toBe(true);
  });

  it('reads the whole attribute context rather than substituting attack alone', async () => {
    const build = await setting('jean');
    const alternate = await setting('jean', 'favoniussword');
    const candidate = resolveBuild(alternate);
    const request = { skillId: 'jean.skill', hitIndex: 0, crit: 'expected' as const, reaction: 'none' as const, conditions: { hpRatio: 1 } };
    const result = evaluateDamage(build, request, hilichurl, 0, stat => Object.hasOwn(candidate.stats, stat) ? candidate.stats[stat as StatKey] : 0);
    const attack = 18.62 * 8.739 + 76.4582 + 41.0671 * 7.275 + 155.6;
    expect(result.value).toBeCloseTo(attack * 4.964 * (1 + 0.05 * 0.5) * 0.5 * 0.9, 8);
    // The Favonius candidate has 5% CR; the original Harbinger setting would add 14%.
    expect(result.parts.crit).toBeCloseTo(1.025, 12);
  });

  it('reuses category modifiers without treating unrelated elemental bonuses as unsupported', async () => {
    const build = await setting('jean', 'festeringdesire');
    const result = evaluateDamage(build, { skillId: 'jean.skill', hitIndex: 0, crit: 'expected', reaction: 'none' }, hilichurl);
    const attack = 18.62 * 8.739 + 76.4582 + 42.401 * 8.349 + 155.6;
    expect(result.status).toBe('complete');
    expect(result.value).toBeCloseTo(attack * 4.964 * 1.16 * (1 + 0.11 * 0.5) * 0.5 * 0.9, 8);
  });

  it('keeps structural errors global and unsupported constellations explicit', async () => {
    const build = await setting('jean');
    const request = { skillId: 'jean.skill', hitIndex: 0, crit: 'noncritical' as const, reaction: 'none' as const };
    expect(evaluateDamage({ ...build, level: 19, ascension: 1 }, request, hilichurl).status).toBe('invalid');
    const c5 = evaluateDamage({ ...build, constellation: 5 }, request, hilichurl);
    expect(c5.status).toBe('partial');
    expect(c5.value).toBeNull();
    expect(talentBonus(build.character, 'skill', 5)).toBe(3);
    expect(c5.parts.multiplier).toBe(build.character.talents.find(talent => talent.category === 'skill')!.parameters[0].values[11]);
  });
});

describe('source-bound base-damage components, with character rules still pending', () => {
  it('binds Chiori ATK plus DEF and Dehya ATK plus HP without inventing extra damage records', async () => {
    // Legal level-90 no-artifact white attributes with Harbinger of Dawn / a level-70 Waster Greatsword.
    const chiori = await getCharacter('chiori');
    const attack = 25.137 * 8.739 + 103.21857 + 38.7413 * 7.346 + 116.7;
    const defense = 74.1892 * 8.739 + 304.668;
    const base = evaluateHitBase(chiori.talents.find(talent => talent.category === 'skill')!, 0, 9,
      stat => stat === 'attack' ? attack : stat === 'defense' ? defense : null);
    expect(base.value).toBeCloseTo(1.39536 * attack + 1.7442 * defense, 8);
    expect(base.scaling).toHaveLength(2);
    const dehya = await getCharacter('dehya');
    const dehyaAttack = 20.6682 * 8.739 + 84.8686 + 23.245 * 5.968 + 46.7;
    const hp = (1220.2496 * 8.739 + 5011.0044) * 1.288;
    const punch = evaluateHitBase(dehya.talents.find(talent => talent.category === 'burst')!, 0, 9,
      stat => stat === 'attack' ? dehyaAttack : stat === 'hp' ? hp : null);
    expect(punch.value).toBeCloseTo(1.6779 * dehyaAttack + 0.028764 * hp, 8);
    expect(chiori.capabilities.calculation.supported || dehya.capabilities.calculation.supported).toBe(false);
  });

  it.each([['cyno', 0, 'normal', 1.438227], ['raidenshogun', 1, 'burst', 0.752402]] as const)
    ('keeps %s transformed attack category and burst talent parameter distinct', async (id, hitIndex, category, coefficient) => {
      const character = await getCharacter(id);
      const talent = character.talents.find(talent => talent.category === 'burst')!;
      const white = id === 'cyno' ? 24.7646 * 8.739 + 101.68941 : 26.2542 * 8.739 + 107.80606;
      // Level-70 Beginner's Protector, no artifacts. Only the base component is checked; state rules remain pending.
      const attack = white + 23.245 * 5.968 + 46.7;
      expect(evaluateHitBase(talent, hitIndex, 9, () => attack, id === 'raidenshogun' ? { resolve: 0 } : {}).value).toBeCloseTo(attack * coefficient, 8);
      expect(talent.hits[hitIndex].category).toBe(category);
      expect(talent.support.supported).toBe(false);
    });

  it('uses Gorou DEF burst scaling and preserves Xinyan physical burst damage', async () => {
    const gorou = await getCharacter('gorou');
    const talent = gorou.talents.find(talent => talent.category === 'burst')!;
    // The growth-only DEF component, before his burst-triggered DEF passive; no complete damage claim.
    const defense = 54.36375 * 8.349 + 194.5125;
    expect(evaluateHitBase(talent, 0, 9, stat => stat === 'defense' ? defense : null).value).toBeCloseTo(defense * 1.669672, 8);
    const xinyan = await getCharacter('xinyan');
    expect(xinyan.talents.find(talent => talent.category === 'burst')!.hits[0].element).toBe('physical');
    expect((await getCharacter('kachina')).talents.find(talent => talent.category === 'skill')!.hits.every(hit => hit.category === 'skill')).toBe(true);
    expect((await getCharacter('faruzan')).talents.find(talent => talent.category === 'skill')!.hits[1].category).toBe('skill');
  });

  it.each([['nahida', 'burst'], ['barbara', 'burst'], ['xiao', 'burst'], ['yoimiya', 'skill'], ['wriothesley', 'skill']] as const)
    ('rejects a standalone damage request for %s %s instead of treating its auxiliary parameters as damage', async (id, category) => {
      const character = await getCharacter(id);
      const talent = character.talents.find(talent => talent.category === category)!;
      expect(talent.noIndependentDamage).toBe(true);
      expect(talent.hits).toEqual([]);
      const weapon = character.identity.weaponType === 'WEAPON_CATALYST' ? 'apprenticesnotes'
        : character.identity.weaponType === 'WEAPON_BOW' ? 'huntersbow' : 'beginnersprotector';
      const build = await setting(id, weapon);
      build.weaponLevel = 70;
      build.weaponAscension = 4;
      // A request/schema boundary using legal catalog equipment; no fabricated character or numerical truth.
      const result = evaluateDamage(build, { skillId: talent.id, hitIndex: 0, crit: 'noncritical', reaction: 'none' }, hilichurl);
      expect(result.status).toBe('invalid');
      expect(result.issues.some(issue => issue.message.includes('没有独立伤害'))).toBe(true);
      expect(talentSchema.safeParse({ ...talent, hits: [{ parameter: talent.parameters[0].id }] }).success).toBe(false);
      // Format capability only: auxiliary support must not require fabricated damage. Canonical runtime flags stay false.
      expect(talentSchema.safeParse({ ...talent, support: { ...talent.support, supported: true } }).success).toBe(true);
    });

  it('binds Xilonen unenhanced plunge to defense without assuming the Nightsoul Geo conversion', async () => {
    const character = await getCharacter('xilonen');
    const talent = character.talents.find(talent => talent.category === 'normal')!;
    const defense = (72.3943 * 8.739 + 297.297) * 1.36;
    const base = evaluateHitBase(talent, 5, 9, stat => {
      expect(stat).toBe('defense');
      return defense;
    });
    expect(base.value).toBeCloseTo(defense * 1.174572, 8);
    expect(talent.hits[5].element).toBe('physical');
    expect(character.capabilities.calculation.supported).toBe(false);
    expect(talent.support.supported).toBe(false);
  });

  it('adds Sethos Shadowpiercing Shot attack and EM terms once without treating them as separate hits', async () => {
    const character = await getCharacter('sethos');
    const talent = character.talents.find(talent => talent.category === 'normal')!;
    // Level-90 Sethos, level-70 Hunter's Bow (legal ascension 4), no artifacts.
    const attack = 19.05456 * 8.349 + 68.178474 + 23.245 * 5.968 + 46.7;
    const base = evaluateHitBase(talent, 6, 9, stat => stat === 'attack' ? attack : stat === 'elementalMastery' ? 96 : null);
    expect(base.value).toBeCloseTo(2.38 * attack + 2.28752 * 96, 8);
    expect(base.scaling).toHaveLength(2);
    expect(talent.hits[6].element).toBe('electro');
    expect(talent.hits[4].element).toBe('physical');
    expect(character.capabilities.calculation.supported).toBe(false);
  });

  it('keeps Ganyu arrow and bloom as separately selected Cryo hits with physical aimed shots', async () => {
    const character = await getCharacter('ganyu');
    const talent = character.talents.find(talent => talent.category === 'normal')!;
    const attack = 26.068 * 8.739 + 107.04148 + 23.245 * 5.968 + 46.7;
    expect(evaluateHitBase(talent, 8, 9, () => attack).value).toBeCloseTo(attack * 2.176, 8);
    expect(evaluateHitBase(talent, 9, 9, () => attack).value).toBeCloseTo(attack * 3.6992, 8);
    expect(talent.hits[6].element).toBe('physical');
    expect(talent.hits.slice(7, 10).every(hit => hit.element === 'cryo' && hit.category === 'charged')).toBe(true);
    expect(talent.support.supported).toBe(false);
  });

  it.each([
    ['yelan', 'huntersbow', 0, ['hp']],
    ['neuvillette', 'apprenticesnotes', 0, ['hp']],
    ['albedo', 'harbingerofdawn', 1, ['defense']],
    ['nahida', 'apprenticesnotes', 2, ['attack', 'elementalMastery']],
  ] as const)('routes %s scaling through the existing dependency graph without claiming complete support', async (id, weapon, hitIndex, stats) => {
    const build = await setting(id, weapon);
    // The basic bow/catalyst have only four ascensions; use their legal level 70 cap.
    if (weapon !== 'harbingerofdawn') { build.weaponLevel = 70; build.weaponAscension = 4; }
    const project = createEmptyProject();
    const actor = addActorFromBuild(project, build);
    project.enemy = hilichurl;
    project.timeline.push({ id: 'scaling-query', actor, timeMs: 0, order: 0, kind: 'damage', definition: `${actor}-real-damage`,
      damage: { skillId: `${id}.skill`, hitIndex, crit: 'noncritical', reaction: 'none' } });
    const result = evaluateTimeline(project);
    expect(result.status).toBe('partial');
    expect(result.totalValue).toBeNull();
    for (const stat of stats) expect(result.reads?.some(read => read.key === stat && read.unit === stat)).toBe(true);
    expect(result.reads?.some(read => read.key === 'attack')).toBe(stats.some(stat => stat === 'attack'));
    expect(result.reads?.some(read => read.key === 'critRate' || read.key === 'critDamage')).toBe(false);
  });

  it.each([
    ['yelan', 'skill', 0, 'hp', 1124.9176 * 8.739 + 4619.52, 0.384431],
    ['neuvillette', 'skill', 0, 'hp', 1143.984 * 8.739 + 4697.817, 0.218688],
    ['albedo', 'skill', 1, 'defense', 68.2062 * 8.739 + 280.098, 2.2712],
  ] as const)('uses %s %s hit %i with the declared %s scaling', async (id, category, hitIndex, stat, attribute, multiplier) => {
    const character = await getCharacter(id);
    const talent = character.talents.find(talent => talent.category === category)!;
    const base = evaluateHitBase(talent, hitIndex, 9, key => key === stat ? attribute : null);
    expect(base.invalid).toBe(false);
    expect(base.value).toBeCloseTo(attribute * multiplier, 9);
    expect(base.scaling[0].stat).toBe(stat);
    expect(talent.support.supported).toBe(false); // Scaling proof does not prove all passive/condition rules.
  });

  it('adds Nahida ATK and EM terms and propagates an unknown term instead of zero', async () => {
    const character = await getCharacter('nahida');
    const talent = character.talents.find(talent => talent.category === 'skill')!;
    const weapon = await getWeapon('apprenticesnotes');
    const attack = 23.275 * 8.739 + 95.57275 + weapon.baseAttack * weapon.attackCurve[70] + weapon.promotion[4];
    // Level 90 C0, level 70 basic catalyst, no artifacts: a base-component calculation only.
    const base = evaluateHitBase(talent, 2, 9, stat => stat === 'attack' ? attack : stat === 'elementalMastery' ? 115.2 : null);
    expect(base.value).toBeCloseTo(attack * 1.7544 + 115.2 * 3.5088, 9);
    expect(base.scaling).toHaveLength(2);
    expect(evaluateHitBase(talent, 2, 9, stat => stat === 'attack' ? attack : null).value).toBeNull();
  });

  it('preserves per-hit category and element and validates every scaling reference', async () => {
    const yelan = await getCharacter('yelan');
    const normal = yelan.talents.find(talent => talent.category === 'normal')!;
    expect(normal.hits[5]).toMatchObject({ category: 'charged', element: 'hydro', scalingStat: 'attack' });
    expect(normal.hits[6]).toMatchObject({ category: 'charged', element: 'hydro', scalingStat: 'hp' });
    const nahida = await getCharacter('nahida');
    const skill = nahida.talents.find(talent => talent.category === 'skill')!;
    const invalid: Talent = structuredClone(skill);
    invalid.hits[2].additionalScaling![0].parameter = 'missing-source-parameter';
    expect(talentSchema.safeParse(invalid).success).toBe(false);
  });
});
