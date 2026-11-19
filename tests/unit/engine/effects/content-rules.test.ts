import { selectCatalogHit } from '../../../helpers/catalog-calculation';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { elements, type Build, type Enemy, type Project, type StatKey } from '@leyline/schema';
import { compileStructuredCharacter, evaluateDamage, evaluateTimeline, resolveBuild } from '@leyline/engine';
import { addActorFromBuild } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { createAccount } from '../../../../src/web/src/domain/account';
import { previewEnkaImport } from '../../../../src/web/src/domain/enka-import';

const hilichurl: Enemy = { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])) as Enemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
async function setting(id: string, weapon: string): Promise<Build> {
  return { schemaVersion: '0.1.0', kind: 'calculation-build', ...await getBuildSources(), dataVersion: DATA_VERSION, character: await getCharacter(id), weapon: await getWeapon(weapon), sets: [], artifacts: [],
    artifactMain: await getArtifactMain(), level: 90, ascension: 6, constellation: 0, talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 90, weaponAscension: 6, refinement: 1 };
}
function query(build: Build, skillId = `${build.character.id}.skill`, hitIndex = 0, timeMs = 0) {
  const project = createEmptyProject();
  const actor = addActorFromBuild(project, build);
  project.enemy = hilichurl;
  const record: Project['timeline'][number] = { id: 'calculation-query', actor, timeMs, order: 1, kind: 'damage', definition: `${actor}-real-damage`,
    damage: { ...selectCatalogHit(build, skillId, hitIndex), crit: 'noncritical', reaction: 'none' } };
  project.timeline.push(record);
  return { project, actor, record };
}

// These are explicit single-point, legal calculation settings. No observed combat is claimed.
describe('canonical content rules share panel, direct damage and timeline evaluation', () => {
  it.each([1, 2, 3, 4, 5])('evaluates Jade Cutter R%i HP-to-ATK independently', async refinement => {
    const build = await setting('jean', 'primordialjadecutter');
    build.refinement = refinement;
    const hp = (1143.984 * 8.739 + 4697.817) * [1.2, 1.25, 1.3, 1.35, 1.4][refinement - 1];
    const attack = 18.62 * 8.739 + 76.4582 + 44.3358 * 8.01 + 186.7 + hp * [0.012, 0.015, 0.018, 0.021, 0.024][refinement - 1];
    const expected = attack * 4.964 * 0.5 * 0.9;
    const panel = resolveBuild(build);
    expect(panel.status).toBe('complete');
    expect(panel.stats.hp).toBeCloseTo(hp, 8);
    expect(panel.stats.attack).toBeCloseTo(attack, 8);
    const { project, record } = query(build);
    const original = JSON.stringify(project);
    const direct = evaluateDamage(build, record.damage, hilichurl);
    expect(direct.status).toBe('complete');
    expect(direct.value).toBeCloseTo(expected, 7);
    expect(direct.panel.stats.attack).toBeCloseTo(attack, 8);
    const timeline = evaluateTimeline(project);
    expect(timeline.status).toBe('complete');
    expect(timeline.totalValue).toBeCloseTo(expected, 7);
    expect(timeline.effectInstances?.some(instance => instance.content?.entity === 'primordialjadecutter')).toBe(true);
    expect(timeline.reads?.some(read => read.key === 'hp' && read.unit === 'hp')).toBe(true);
    expect(JSON.stringify(project)).toBe(original);
    expect(evaluateTimeline(project).effectInstances).toEqual(timeline.effectInstances);
  });

  it('rebuilds after weapon swaps and preserves disabled or stale revision identities', async () => {
    const build = await setting('jean', 'primordialjadecutter');
    const { project, actor } = query(build);
    project.calculationProfile = 'dependency';
    const before = evaluateTimeline(project);
    const instance = before.effectInstances!.find(instance => instance.content?.entity === 'primordialjadecutter')!;
    project.effectRevisions = [{ instanceId: instance.id, disabled: true }];
    const disabled = evaluateTimeline(project);
    expect(disabled.status).toBe('complete');
    expect(disabled.totalValue).toBeLessThan(before.totalValue!);
    project.candidate.actors.find(entry => entry.id === actor)!.build!.weapon = await getWeapon('favoniussword');
    const swapped = evaluateTimeline(project);
    expect(swapped.status).toBe('partial');
    expect(swapped.diagnostics.some(diagnostic => diagnostic.code === 'stale-revision')).toBe(true);
    expect(swapped.effectInstances?.some(instance => instance.content?.entity === 'primordialjadecutter')).toBe(false);
  });

  it('keeps permanent effects at the last legal query millisecond', async () => {
    const { project } = query(await setting('jean', 'primordialjadecutter'), 'jean.skill', 0, 3600000);
    expect(evaluateTimeline(project).totalValue).toBeCloseTo(evaluateDamage(project.candidate.actors[0].build, project.timeline[0].damage, hilichurl).value!, 8);
  });
});

describe('existing passive effects through the current panel', () => {
  it.each([[0.3, 0], [0.5, 0.12], [0.8, 0.3], [1, 0.3]])('uses Neuvillette A4 HP ratio %s', async (hpRatio, bonus) => {
    const build = await setting('neuvillette', 'apprenticesnotes');
    build.weaponLevel = 70; build.weaponAscension = 4;
    expect(resolveBuild(build, { hpRatio }).stats.hydroBonus).toBeCloseTo(bonus, 12);
  });

  it('unlocks the adopted A4 effect and rejects a missing formula dependency', async () => {
    const build = await setting('neuvillette', 'apprenticesnotes');
    build.weaponLevel = 70; build.weaponAscension = 4;
    build.level = 60; build.ascension = 3; build.talents = { normal: 1, skill: 1, burst: 1 };
    expect(resolveBuild(build, { hpRatio: 1 }).stats.hydroBonus).toBe(0);
    build.ascension = 4;
    expect(resolveBuild(build, { hpRatio: 1 }).stats.hydroBonus).toBeCloseTo(0.3, 12);
    const effect = build.character.calculation.bundle.effects.find(effect => effect.identity.id === 'neuvillette.ascension-four.hydro-bonus')!;
    if (effect.value.kind !== 'formula') throw new Error('Expected adopted A4 formula');
    effect.value.formula.revision = 'missing';
    expect(compileStructuredCharacter(build.character).ok).toBe(false);
  });

  it('keeps unknown HP-dependent hydro bonus separate from unrelated physical attributes', async () => {
    const build = await setting('neuvillette', 'apprenticesnotes');
    build.weaponLevel = 70; build.weaponAscension = 4;
    const panel = resolveBuild(build);
    expect(panel.stats.hydroBonus).toBeNull();
    expect(panel.stats.physicalBonus).toBe(0);
  });
});

const recording = '.references/enka/official-example-2026-11-13.json';
describe.skipIf(!existsSync(recording))('Noblesse format queries derived from the recorded Bennett build', () => {
  it('independently calculates the 20% base-ATK increase with recorded artifacts in a theoretical Jean configuration', async () => {
    const preview = await previewEnkaImport(JSON.parse(readFileSync(recording, 'utf8')), '618285856', createAccount());
    const recorded = preview.rows.find(row => row.character.showcase?.build.character.id === 'bennett')!.character.showcase!.build;
    const build = await setting('jean', 'primordialjadecutter');
    // Legal theoretical equipment using original observed artifact values; never claimed as player wearing.
    build.artifacts = recorded.artifacts;
    build.sets = recorded.sets;
    build.sources = recorded.sources;
    const values: Partial<Record<StatKey, number>> = {};
    for (const item of recorded.artifacts) {
      values[item.mainStat] = (values[item.mainStat] ?? 0) + recorded.artifactMain[item.rarity][item.mainStat]![item.level];
      for (const sub of item.substats) values[sub.stat] = (values[sub.stat] ?? 0) + sub.value;
    }
    const hp = (1143.984 * 8.739 + 4697.817) * (1.2 + (values.hpPercent ?? 0)) + (values.hp ?? 0);
    const white = 18.62 * 8.739 + 76.4582 + 44.3358 * 8.01 + 186.7;
    const attack = white * (1.2 + (values.attackPercent ?? 0)) + (values.attack ?? 0) + hp * 0.012;
    const { project, actor } = query(build, 'jean.skill', 0, 11999);
    project.timeline.unshift({ id: 'specified-cast', timeMs: 0, order: 0, actor, kind: 'action', definition: `${actor}-character`, skillId: 'jean.burst' });
    const result = evaluateTimeline(project);
    expect(result.status).toBe('complete');
    expect(result.points[0].real?.parts.attack).toBeCloseTo(attack, 8);
    expect(result.totalValue).toBeCloseTo(attack * 4.964 * (1 + (values.anemoBonus ?? 0)) * 0.5 * 0.9, 7);
    expect(result.points[0].formula.effects.filter(effect => effect.effect === 'noblesseoblige.burst-team-attack.team-attack')).toHaveLength(1);
  });

  it.each([0, 11999, 12000])('applies only after an explicit burst action and before 12s at %i ms', async timeMs => {
    const preview = await previewEnkaImport(JSON.parse(readFileSync(recording, 'utf8')), '618285856', createAccount());
    const build = preview.rows.find(row => row.character.showcase?.build.character.id === 'bennett')!.character.showcase!.build;
    expect(build.artifacts.filter(item => item.setId === 'noblesseoblige')).toHaveLength(5);
    // Derive a single legal Jean query with the original recorded artifacts.
    const recipient = await setting('jean', 'primordialjadecutter');
    recipient.artifacts = build.artifacts; recipient.sets = build.sets; recipient.sources = build.sources;
    const { project, actor } = query(recipient, 'jean.skill', 0, timeMs);
    // Action and hit are explicit query inputs. No observed battle sequence is claimed.
    project.timeline.unshift({ id: 'explicit-burst', actor, timeMs: 0, order: 0, kind: 'action', definition: actor + '-character', skillId: 'jean.burst' });
    const evaluate = () => evaluateTimeline(project);
    const instance = evaluate().effectInstances!.find(instance => instance.effect === 'noblesseoblige.burst-team-attack.team-attack');
    expect(instance?.content?.entity).toBe('noblesseoblige');
    const applied = () => evaluate().points[0].formula.effects.some(effect => effect.effect === instance!.effect);
    expect(applied()).toBe(timeMs < 12000);
    project.timeline[0].order = 2;
    if (timeMs === 0) expect(applied()).toBe(false);
    project.timeline[0].order = 0;
    delete project.timeline[0].skillId;
    expect(evaluate().effectInstances?.some(instance => instance.effect === 'noblesseoblige.burst-team-attack.team-attack' && instance.unconfirmed)).toBe(true);
    if (timeMs < 12000) expect(evaluate().status).toBe('partial');
  });
});
