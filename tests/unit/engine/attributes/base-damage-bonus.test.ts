import { describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getCharacter, getReactionRules, getWeapon } from '@leyline/game-data';
import { elements, projectSchema, type Build, type DamageRequest, type Enemy, type Project, type StatKey } from '@leyline/schema';
import { evaluateDamage, evaluateTimeline, resolveBuild, type DamageAttributeReader } from '@leyline/engine';
import { addActorFromBuild, addSkillHit, setDamageEffectApplication } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';

// Legal independent single-point settings from pinned growth/weapon/talent sources.
// No player equipment, recorded sequence or game-observed damage is claimed.
const enemy: Enemy = { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])) as Enemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
async function setting(id = 'jean', weapon = 'cinnabarspindle'): Promise<Build> {
  return { dataVersion: DATA_VERSION, character: await getCharacter(id), weapon: await getWeapon(weapon), reactionRules: await getReactionRules(),
    artifactMain: await getArtifactMain(), sets: [], artifacts: [], level: 90, ascension: 6, constellation: 0,
    talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 90, weaponAscension: 6, refinement: 1 };
}
function query(build: Build, request: DamageRequest = { skillId: 'jean.skill', hitIndex: 0, crit: 'noncritical', reaction: 'none' }) {
  const project = createEmptyProject();
  project.enemy = enemy;
  const actor = addActorFromBuild(project, build);
  const hit = addSkillHit(project, actor, request.skillId, request.hitIndex, 0, request);
  const result = evaluateTimeline(project);
  const instance = result.effectInstances!.find(instance => instance.content?.entity === 'cinnabarspindle');
  return { project, actor, hit, instance };
}
const jeanAttack = 18.62 * 8.739 + 76.4582 + 41.0671 * 7.275 + 155.6;
const jeanDefense = (59.83 * 8.739 + 245.7) * (1 + 0.150133 * 4.594);

describe('hit-local flat bonuses share source dependency evaluation and recipient damage multipliers', () => {
  it.each([1, 2, 3, 4, 5])('calculates Cinnabar R%i with an explicit application and independent DEF contribution', async refinement => {
    const build = await setting();
    build.refinement = refinement;
    const { project, hit, instance } = query(build);
    expect(instance?.requiresApplication).toBe(true);
    setDamageEffectApplication(project, hit, instance!.id, true);
    const before = JSON.stringify(project);
    const result = evaluateTimeline(projectSchema.parse(JSON.parse(before)));
    const added = jeanDefense * [0.4, 0.5, 0.6, 0.7, 0.8][refinement - 1];
    expect(result.status).toBe('complete');
    expect(result.points).toHaveLength(1);
    expect(result.points[0].real?.baseDamage).toBeCloseTo(jeanAttack * 4.964, 8);
    expect(result.points[0].real?.baseDamageBonus).toBeCloseTo(added, 8);
    expect(result.totalValue).toBeCloseTo((jeanAttack * 4.964 + added) * 0.5 * 0.9, 8);
    expect(result.reads?.some(read => read.key === 'baseDamageBonus' && read.unit === 'damage')).toBe(true);
    expect(result.reads?.some(read => read.key === 'defense' && Math.abs(read.value! - jeanDefense) < 1e-8)).toBe(true);
    expect(JSON.stringify(project)).toBe(before);
    const panel = resolveBuild(build);
    expect(panel.status).toBe('complete');
    expect(Object.hasOwn(panel.stats, 'baseDamageBonus')).toBe(false);
  });

  it.each(['missing', 'unknown', 'inactive'] as const)('keeps %s Cinnabar application distinct', async mode => {
    const build = await setting();
    const { project, hit, instance } = query(build);
    if (mode !== 'missing') setDamageEffectApplication(project, hit, instance!.id, mode === 'inactive' ? false : null);
    const result = evaluateTimeline(project);
    expect(result.status).toBe(mode === 'inactive' ? 'complete' : 'partial');
    expect(result.points[0].real?.baseDamageBonus).toBe(mode === 'inactive' ? 0 : null);
    expect(result.totalValue).toBe(mode === 'inactive' ? jeanAttack * 4.964 * 0.5 * 0.9 : null);
    if (mode === 'inactive') expect(result.reads?.some(read => read.key === 'defense')).toBe(false);
    expect(evaluateDamage(build, project.timeline[0].damage, enemy).status).toBe(mode === 'missing' ? 'partial' : 'invalid');
  });

  it('applies recipient Hydro bonus, expected crit and vaporize after adding the Cinnabar base', async () => {
    const build = await setting('xingqiu');
    const { project, hit, instance } = query(build, { skillId: 'xingqiu.skill', hitIndex: 0, crit: 'expected', reaction: { type: 'vaporize', trigger: 'record-owner' } });
    setDamageEffectApplication(project, hit, instance!.id, true);
    const attack = (16.9176 * 8.349 + 60.53229 + 41.0671 * 7.275 + 155.6) * 1.24;
    const defense = (63.51975 * 8.349 + 227.2725) * (1 + 0.150133 * 4.594);
    const result = evaluateTimeline(project);
    expect(result.status).toBe('complete');
    expect(result.totalValue).toBeCloseTo((attack * 2.856 + defense * 0.4) * 1.2 * (1 + 0.05 * 0.5) * 0.5 * 0.9 * 2, 8);
    expect(result.points[0].real?.reaction?.multiplier).toBe(2);
  });

  it('ignores the skill-only source for normal attacks and rejects a mismatched application', async () => {
    const { project, hit, instance } = query(await setting(), { skillId: 'jean.normal', hitIndex: 0, crit: 'noncritical', reaction: 'none' });
    expect(evaluateTimeline(project).status).toBe('complete');
    expect(evaluateTimeline(project).totalValue).toBeCloseTo(jeanAttack * 0.88796 * 0.5 * 0.9, 8);
    const before = JSON.stringify(project);
    expect(() => setDamageEffectApplication(project, hit, instance!.id, true)).toThrow();
    expect(JSON.stringify(project)).toBe(before);
    project.timeline[0].damage!.effectApplications = [{ instanceId: instance!.id, active: true }];
    expect(evaluateTimeline(project).status).toBe('invalid');
  });

  it('recalculates refinement and level candidates, keeps originals independent, and flags removed source identities', async () => {
    const { project, hit, instance } = query(await setting());
    setDamageEffectApplication(project, hit, instance!.id, true);
    const before = JSON.stringify(project);
    const candidate = projectSchema.parse(JSON.parse(before));
    candidate.candidate.actors[0].build!.refinement = 5;
    expect(evaluateTimeline(candidate).totalValue).toBeCloseTo((jeanAttack * 4.964 + jeanDefense * 0.8) * 0.45, 8);
    candidate.candidate.actors[0].build!.weaponLevel = 1;
    candidate.candidate.actors[0].build!.weaponAscension = 0;
    const attack = 18.62 * 8.739 + 76.4582 + 41.0671;
    const defense = (59.83 * 8.739 + 245.7) * (1 + 0.150133);
    expect(evaluateTimeline(candidate).totalValue).toBeCloseTo((attack * 4.964 + defense * 0.8) * 0.45, 8);
    candidate.candidate.actors[0].build!.weapon = await getWeapon('favoniussword');
    const removed = evaluateTimeline(candidate);
    expect(removed.status).toBe('partial');
    expect(removed.diagnostics.some(diagnostic => diagnostic.code === 'stale-revision')).toBe(true);
    expect(JSON.stringify(project)).toBe(before);
  });

  it('rejects duplicate applications, wrong recipients and wrong contribution units', async () => {
    const { project, hit, instance } = query(await setting());
    setDamageEffectApplication(project, hit, instance!.id, true);
    const duplicate = structuredClone(project);
    duplicate.timeline[0].damage!.effectApplications!.push({ instanceId: instance!.id, active: false });
    expect(projectSchema.safeParse(duplicate).success).toBe(false);
    const recipient = structuredClone(project);
    addActorFromBuild(recipient, await setting('kaeya'));
    recipient.timeline[0].actor = recipient.candidate.actors[1].id;
    expect(evaluateTimeline(recipient).status).toBe('invalid');
    project.calculationProfile = 'dependency';
    project.effectRevisions = [{ instanceId: instance!.id, disabled: false, value: { value: jeanDefense * 0.4, unit: 'scalar' } }];
    expect(evaluateTimeline(project).diagnostics.some(diagnostic => diagnostic.code === 'unit')).toBe(true);
  });

  it('keeps explicit application and fixed-value revisions separate', async () => {
    const { project, hit, instance } = query(await setting());
    project.calculationProfile = 'dependency';
    project.effectRevisions = [{ instanceId: instance!.id, disabled: false, value: { value: jeanDefense * 0.4, unit: 'damage' } }];
    expect(evaluateTimeline(project).status).toBe('partial'); // A fixed value is not evidence that the effect applied.
    setDamageEffectApplication(project, hit, instance!.id, false);
    expect(evaluateTimeline(project).totalValue).toBeCloseTo(jeanAttack * 4.964 * 0.45, 8);
    setDamageEffectApplication(project, hit, instance!.id, true);
    expect(evaluateTimeline(project).totalValue).toBeCloseTo((jeanAttack * 4.964 + jeanDefense * 0.4) * 0.45, 8);
    project.effectRevisions[0].disabled = true;
    expect(evaluateTimeline(project).totalValue).toBeCloseTo(jeanAttack * 4.964 * 0.45, 8);
  });

  it('reads a real Shenhe Quill formula context dynamically while Kaeya icicle attributes are captured', async () => {
    // Formula-only context: pinned Shenhe T9 Quill rate, level-90 C0 / level-70 Beginner's Protector.
    // This does not adopt Shenhe rules or claim an observed two-character combat sequence.
    const build = await setting('kaeya', 'favoniussword');
    const attack = 18.6984 * 8.349 + 66.90411 + 41.0671 * 7.275 + 155.6;
    const shenheAttack = (23.6474 * 8.739 + 97.10191 + 23.245 * 5.968 + 46.7) * 1.288;
    const panel = resolveBuild(build);
    const current: DamageAttributeReader = key => key === 'baseDamageBonus' ? shenheAttack * 0.776152 : Object.hasOwn(panel.stats, key) ? panel.stats[key as StatKey] : 0;
    const captured: DamageAttributeReader = key => key === 'baseDamageBonus' ? 0 : Object.hasOwn(panel.stats, key) ? panel.stats[key as StatKey] : 0;
    const result = evaluateDamage(build, { skillId: 'kaeya.burst', hitIndex: 0, crit: 'noncritical', reaction: 'none', capture: { recordId: 'explicit-source-context', phase: 'before' } }, enemy,
      0, current, { read: captured, panel });
    expect(result.status).toBe('complete');
    expect(result.baseDamageBonus).toBeCloseTo(shenheAttack * 0.776152, 8);
    expect(result.value).toBeCloseTo((attack * 1.3192 + shenheAttack * 0.776152) * 0.45, 8);
  });
});

describe('Yun Jin source component and canonical unknown boundaries', () => {
  it.each([[1, 61.5741, 0.3216], [9, 61.5741 * 8.349 + 220.311, 0.54672]])
    ('checks the actual T%i base component against an independent source DEF and recipient formula', async (level, defense, rate) => {
      // Isolated Q component. The T9 case excludes A4 by scope and is not a full character/team calculation.
      const yunjin = await getCharacter('yunjin');
      const rule = yunjin.combatRules![0];
      const parameter = yunjin.talents.find(talent => talent.category === 'burst')!.parameters.find(parameter => parameter.id === 'param2')!;
      const project = createEmptyProject();
      project.calculationProfile = 'dependency'; project.enemy = enemy;
      const source = { kind: 'preset' as const, reference: 'yunjin.burst/source-component', verified: true };
      const { trigger, ...effect } = rule.effects[0];
      project.definitions.push(
        { id: 'source-empty', version: rule.revision, source, nodes: [], effects: [] },
        { id: 'source-rule', version: rule.revision, source,
          nodes: rule.nodes.map(node => node.op === 'talent-parameter' ? { id: node.id, op: 'constant' as const, quantity: { value: parameter.values[level - 1], unit: node.unit } } : node),
          effects: [{ ...effect, action: 'yunjin-cast' }] },
        { id: 'yunjin-cast', version: rule.revision, source, nodes: [], effects: [] });
      project.candidate.actors.push({ id: 'source-yunjin', character: 'source-empty', weapon: 'source-rule', inputs: { defense: { value: defense, unit: 'defense' } } });
      const recipient = addActorFromBuild(project, await setting('kaeya', 'favoniussword'));
      project.timeline.push({ id: 'component-cast', actor: 'source-yunjin', timeMs: 0, order: 0, kind: 'action', definition: 'yunjin-cast' });
      const hit = addSkillHit(project, recipient, 'kaeya.normal', 0, 1000, { crit: 'noncritical', reaction: 'none' });
      const instance = evaluateTimeline(project).effectInstances!.find(instance => instance.definition === 'source-rule')!;
      setDamageEffectApplication(project, hit, instance.id, true);
      const result = evaluateTimeline(project);
      const attack = 18.6984 * 8.349 + 66.90411 + 41.0671 * 7.275 + 155.6;
      expect(result.status).toBe('complete');
      expect(result.points[0].real?.baseDamageBonus).toBeCloseTo(defense * rate, 8);
      expect(result.totalValue).toBeCloseTo((attack * 0.9875 + defense * rate) * 0.45, 8);
      expect(result.reads?.some(read => read.actor === 'source-yunjin' && read.key === 'defense' && read.value === defense)).toBe(true);
      expect(result.reads?.some(read => read.actor === recipient && read.key === 'defense')).toBe(false);
    });

  it.each([false, null, true])('respects explicit application %s without promoting the unsupported Yun Jin source', async active => {
    const project = createEmptyProject();
    project.enemy = enemy;
    const source = await setting('yunjin', 'beginnersprotector');
    source.weaponLevel = 70; source.weaponAscension = 4;
    const owner = addActorFromBuild(project, source);
    const recipient = addActorFromBuild(project, await setting('kaeya', 'favoniussword'));
    project.definitions.push({ id: 'yunjin-cast', version: DATA_VERSION, source: { kind: 'preset', reference: 'yunjin.burst', verified: false }, nodes: [], effects: [] });
    project.timeline.push({ id: 'explicit-yunjin-burst', actor: owner, timeMs: 0, order: 0, kind: 'action', definition: 'yunjin-cast', skillId: 'yunjin.burst' });
    const hit = addSkillHit(project, recipient, 'kaeya.normal', 0, 1000, { crit: 'noncritical', reaction: 'none' });
    const instance = evaluateTimeline(project).effectInstances!.find(instance => instance.content?.entity === 'yunjin')!;
    setDamageEffectApplication(project, hit, instance.id, active);
    const result = evaluateTimeline(project);
    expect(result.status).toBe(active === false ? 'complete' : 'partial');
    expect(result.points[0].real?.baseDamageBonus).toBe(active === false ? 0 : null);
    if (active === true) expect(result.reads?.some(read => read.actor === owner && read.key === 'defense')).toBe(true);
    else expect(result.reads?.some(read => read.actor === owner && read.key === 'defense')).toBe(false);
    if (active === false) {
      project.timeline[1].timeMs = 12000;
      delete project.timeline[1].damage!.effectApplications;
      expect(evaluateTimeline(project).status).toBe('complete');
    }
    if (active === true) {
      project.calculationProfile = 'dependency';
      project.effectRevisions = [{ instanceId: instance.id, disabled: false, value: { value: (61.5741 * 8.349 + 220.311) * 0.54672, unit: 'damage' } }];
      expect(evaluateTimeline(project).status).toBe('partial'); // Fixed values cannot erase incomplete source-rule support.
      project.timeline[1].timeMs = 0; project.timeline[1].order = 0;
      expect(evaluateTimeline(project).status).toBe('invalid'); // Same-time links require distinct explicit order.
    }
    project.timeline[1].timeMs = 12000;
    expect(() => setDamageEffectApplication(project, hit, instance.id, true)).toThrow();
    project.timeline[1].damage!.effectApplications = [{ instanceId: instance.id, active: true }];
    expect(evaluateTimeline(project).status).toBe('invalid');
  });
});
