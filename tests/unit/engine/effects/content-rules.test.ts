import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getCharacter, getWeapon } from '@leyline/game-data';
import { combatRuleSchema, characterDefinitionSchema, elements, projectSchema, type Build, type CombatConditions, type CombatRule, type Enemy, type Project, type StatKey } from '@leyline/schema';
import { evaluateDamage, evaluateTimeline, resolveBuild } from '@leyline/engine';
import { evaluateDependencyGraph, type AttributeKey } from '../../../../src/engine/src/effects/graph';
import { statUnit } from '../../../../src/engine/src/attributes/stat-dependencies';
import { contentRuleSources } from '../../../../src/engine/src/effects/content-rules';
import { addActorFromBuild } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { createAccount } from '../../../../src/web/src/domain/account';
import { previewEnkaImport } from '../../../../src/web/src/domain/enka-import';

const hilichurl: Enemy = { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])) as Enemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
async function setting(id: string, weapon: string): Promise<Build> {
  return { dataVersion: DATA_VERSION, character: await getCharacter(id), weapon: await getWeapon(weapon), sets: [], artifacts: [],
    artifactMain: await getArtifactMain(), level: 90, ascension: 6, constellation: 0, talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 90, weaponAscension: 6, refinement: 1 };
}
function query(build: Build, skillId = `${build.character.id}.skill`, hitIndex = 0, timeMs = 0) {
  const project = createEmptyProject();
  const actor = addActorFromBuild(project, build);
  project.enemy = hilichurl;
  const record: Project['timeline'][number] = { id: 'calculation-query', actor, timeMs, order: 1, kind: 'damage', definition: `${actor}-real-damage`,
    damage: { skillId, hitIndex, crit: 'noncritical', reaction: 'none' } };
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

/** Evaluate an adopted formula component with explicitly supplied quantities, not a player export.
 * Homa HP/ATK are derived below from a legal Hu Tao configuration. EM boundaries come from
 * Nahida's documented 200-point threshold and 800-point excess cap; they are not equipped builds.
 */
function component(rule: CombatRule, inputs: Partial<Record<StatKey, number>>, stats: AttributeKey[], conditions: CombatConditions = {}, refinement = 1, skillId?: string, hitIndex = 0) {
  const project: Project = { schemaVersion: 2, rulesVersion: 'timeline-v1', calculationProfile: 'dependency', id: 'formula-component', revision: '1',
    definitions: [{ id: 'source', version: rule.revision, source: { kind: 'preset', reference: rule.source.commit, verified: true }, nodes: rule.nodes, effects: rule.effects },
      { id: 'character', version: '1', source: { kind: 'preset', reference: rule.source.commit, verified: true }, nodes: [], effects: [] }],
    candidate: { id: 'query', actors: [{ id: 'owner', character: 'character', weapon: 'source', inputs: Object.fromEntries(Object.entries(inputs).map(([stat, value]) => [stat, { value: value!, unit: statUnit(stat as StatKey) }])) }] },
    conditions: {}, timeline: [], objective: {} };
  // Refinement values are selected before the component query; no alternate formula is implemented.
  project.definitions[0].nodes = rule.nodes.map(node => node.op === 'refinement' ? { id: node.id, op: 'constant', quantity: { value: node.values[refinement - 1], unit: node.unit } } : node);
  const record: Project['timeline'][number] = { id: 'component-query', actor: 'owner', timeMs: 0, order: 0, kind: 'damage', definition: 'source',
    damage: { skillId: skillId ?? 'unselected', hitIndex, crit: null, reaction: null, conditions } };
  return evaluateDependencyGraph(projectSchema.parse(project), { attributeQuery: { actor: 'owner', record, stats } });
}

describe('adopted source formula components and validation boundaries', () => {
  it.each([1, 5])('uses Homa R%i strict low-HP threshold and preserves unknown state', async refinement => {
    const weapon = await getWeapon('staffofhoma');
    const rule = weapon.combatRules![0];
    const hp = (1210.7164 * 8.739 + 4971.856) * (refinement === 1 ? 1.2 : 1.4);
    const attack = 8.2859 * 8.739 + 34.0239 + 45.9364 * 9.173 + 186.7;
    const rate = refinement === 1 ? 0.008 : 0.016;
    const low = refinement === 1 ? 0.01 : 0.018;
    expect(component(rule, { hp, attack }, ['attack'], { hpRatio: 0.5 }, refinement).attributes?.attack).toBeCloseTo(attack + hp * rate, 8);
    expect(component(rule, { hp, attack }, ['attack'], { hpRatio: 0.49 }, refinement).attributes?.attack).toBeCloseTo(attack + hp * (rate + low), 8);
    const unknown = component(rule, { hp, attack }, ['attack'], {}, refinement);
    expect(unknown.attributes?.attack).toBeNull();
    expect(unknown.diagnostics.some(diagnostic => diagnostic.message.includes('hpRatio'))).toBe(true);
  });

  it.each([[0, 0, 0.05], [200, 0, 0.05], [600, 0.4, 0.17], [1000, 0.8, 0.29], [1100, 0.8, 0.29]])('applies Nahida A4 at source-defined EM %i with independent caps', async (em, bonus, crit) => {
    const nahida = await getCharacter('nahida');
    const rule = nahida.passives[1].combatRules![0];
    const result = component(rule, { elementalMastery: em, critRate: 0.05 }, ['damageBonus', 'critRate'], {}, 1, 'nahida.skill', 2);
    expect(result.attributes?.damageBonus).toBeCloseTo(bonus, 12);
    expect(result.attributes?.critRate).toBeCloseTo(crit, 12);
    const other = component(rule, { elementalMastery: em, critRate: 0.05 }, ['damageBonus', 'critRate'], {}, 1, 'nahida.skill', 0);
    expect(other.attributes?.damageBonus).toBe(0);
    expect(other.attributes?.critRate).toBe(0.05);
    expect(nahida.capabilities.calculation.supported).toBe(false);
  });

  it.each([[0.3, 0, 0.33], [0.5, 0.12, 0.33], [0.8, 0.3, 0], [1, 0.3, 0]])('uses Neuvillette A4 HP ratio %s and Hu Tao inclusive 50%%', async (hpRatio, hydro, pyro) => {
    const neuvillette = await getCharacter('neuvillette');
    expect(component(neuvillette.passives[1].combatRules![0], { hydroBonus: 0 }, ['hydroBonus'], { hpRatio }).attributes?.hydroBonus)
      .toBeCloseTo(hydro, 12);
    const hutao = await getCharacter('hutao');
    expect(component(hutao.passives[1].combatRules![0], { pyroBonus: 0 }, ['pyroBonus'], { hpRatio }).attributes?.pyroBonus).toBe(pyro);
  });

  it('unlocks passive rules at their declared ascension and rejects broken source derivatives', async () => {
    const build = await setting('nahida', 'apprenticesnotes');
    const actor = { id: 'nahida', character: 'character', weapon: 'weapon', inputs: {}, build };
    build.ascension = 3;
    expect(contentRuleSources(actor).some(source => source.slot === 'passive')).toBe(false);
    build.ascension = 4;
    expect(contentRuleSources(actor).some(source => source.entity === 'nahida.passive2')).toBe(true);
    const rule = structuredClone(build.character.passives[1].combatRules![0]);
    const subtraction = rule.nodes.find(node => node.op === 'subtract')!;
    if ('left' in subtraction) subtraction.left = 'missing';
    expect(combatRuleSchema.safeParse(rule).success).toBe(false);
    const cycle = structuredClone(build.character.passives[1].combatRules![0]);
    const cyclicSubtraction = cycle.nodes.find(node => node.op === 'subtract')!;
    if ('left' in cyclicSubtraction) cyclicSubtraction.left = 'above';
    expect(combatRuleSchema.safeParse(cycle).success).toBe(false);
    const broken = structuredClone(build.character);
    broken.combatRules = [structuredClone(build.character.passives[1].combatRules![0])];
    broken.combatRules[0].nodes.push({ id: 'missing-parameter', op: 'talent-parameter', skillId: 'nahida.skill', parameter: 'absent', unit: 'scalar' });
    expect(characterDefinitionSchema.safeParse(broken).success).toBe(false);
  });
  it('keeps an unknown HP-dependent hydro bonus separate from unrelated physical attributes', async () => {
    const character = await getCharacter('neuvillette');
    const rule = character.passives[1].combatRules![0];
    expect(component(rule, { hydroBonus: 0 }, ['hydroBonus']).attributes?.hydroBonus).toBeNull();
    const unrelated = component(rule, { physicalBonus: 0 }, ['physicalBonus']);
    expect(unrelated.attributes?.physicalBonus).toBe(0);
    expect(unrelated.diagnostics).toEqual([]);
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
    const values: Partial<Record<StatKey, number>> = {};
    for (const item of recorded.artifacts) {
      values[item.mainStat] = (values[item.mainStat] ?? 0) + recorded.artifactMain[item.mainStat]![item.level];
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
    expect(result.points[0].formula.effects.filter(effect => effect.effect === 'team-attack')).toHaveLength(1);
  });

  it.each([0, 11999, 12000])('applies only after an explicit burst action and before 12s at %i ms', async timeMs => {
    const preview = await previewEnkaImport(JSON.parse(readFileSync(recording, 'utf8')), '618285856', createAccount());
    const build = preview.rows.find(row => row.character.showcase?.build.character.id === 'bennett')!.character.showcase!.build;
    expect(build.artifacts.filter(item => item.setId === 'noblesseoblige')).toHaveLength(5);
    // Original build retained. Added action/query times are format annotations, not combat observations.
    const { project, actor, record } = query(build, 'bennett.skill', 0, timeMs);
    project.timeline.unshift({ id: 'explicit-burst', actor, timeMs: 0, order: 0, kind: 'action', definition: `${actor}-character`, skillId: 'bennett.burst' });
    const result = evaluateTimeline(project);
    expect(result.status).toBe('partial');
    expect(result.totalValue).toBeNull();
    expect(result.effectInstances?.filter(instance => instance.content?.entity === 'noblesseoblige.4')).toHaveLength(1);
    const applied = () => evaluateDependencyGraph(project, { attributeQuery: { actor, record, stats: ['attack'] } }).reads?.some(read =>
      read.key === 'attackPercent' && read.dependencies.some(id => result.effectInstances?.some(instance => instance.id === id && instance.content?.entity === 'noblesseoblige.4')));
    expect(applied()).toBe(timeMs < 12000);
    project.timeline[0].order = 2;
    if (timeMs === 0) expect(applied()).toBe(false);
    project.timeline[0].order = 0;
    delete project.timeline[0].skillId;
    const unconfirmed = evaluateTimeline(project);
    expect(unconfirmed.effectInstances?.some(instance => instance.content?.entity === 'noblesseoblige.4' && instance.unconfirmed)).toBe(true);
    if (timeMs < 12000) {
      const probe = evaluateDependencyGraph(project, { attributeQuery: { actor, record, stats: ['attack'] } });
      expect(probe.diagnostics.some(diagnostic => diagnostic.code === 'unknown' && diagnostic.message.includes('技能归属'))).toBe(true);
    }
    expect(record.damage?.crit).toBe('noncritical');
  });
});
