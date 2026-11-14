import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getCharacter, getReactionRules, getWeapon } from '@leyline/game-data';
import { characterDefinitionSchema, elements, projectSchema, type Build, type Enemy, type Project, type StatKey } from '@leyline/schema';
import { evaluateDamage, evaluateTimeline, resolveBuild, type DamageAttributeReader } from '@leyline/engine';
import { addActorFromBuild, addAttributeCapture, addSkillAction, addSkillHit } from '../../../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../../../src/web/src/domain/workbench-project';
import { previewEnkaImport } from '../../../../src/web/src/domain/enka-import';
import { createAccount } from '../../../../src/web/src/domain/account';

const enemy: Enemy = { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])) as Enemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
async function setting(id = 'kaeya', weapon = 'favoniussword'): Promise<Build> {
  return { dataVersion: DATA_VERSION, character: await getCharacter(id), weapon: await getWeapon(weapon),
    artifactMain: await getArtifactMain(), reactionRules: await getReactionRules(), artifacts: [], sets: [], level: 90, ascension: 6,
    constellation: 0, talents: { normal: 1, skill: 9, burst: 9 }, weaponLevel: 90, weaponAscension: 6, refinement: 1 };
}
// Explicit single-point source/capture assertions from real skill rules, never observed casts or a combat sequence.
function query(build: Build, timeMs = 1000, hitIndex = 0, phase: 'before' | 'after' = 'before') {
  const project = createEmptyProject();
  project.enemy = enemy;
  const actor = addActorFromBuild(project, build);
  const source = addSkillAction(project, actor, `${build.character.id}.burst`, 0);
  const damage = addSkillHit(project, actor, `${build.character.id}.burst`, hitIndex, timeMs,
    { crit: 'noncritical', reaction: 'none', capture: { recordId: source, phase } });
  return { project, actor, source, record: project.timeline.find(record => record.id === damage)! };
}

describe('hit attribute captures reuse the existing event dependency graph', () => {
  it('validates independent anchor ownership, skill, time, empty definition and non-damage semantics', async () => {
    const project = createEmptyProject();
    const actor = addActorFromBuild(project, await setting());
    const source = addAttributeCapture(project, actor, 'kaeya.burst', 0);
    expect(project.timeline[0]).toMatchObject({ id: source, kind: 'capture', skillId: 'kaeya.burst' });
    const original = JSON.stringify(project);
    for (const [owner, skill, time] of [[actor, 'kaeya.burst', -1], [actor, 'unknown', 0], ['missing', 'kaeya.burst', 0]] as const) {
      expect(() => addAttributeCapture(project, owner, skill, time)).toThrow();
      expect(JSON.stringify(project)).toBe(original);
    }
    for (const derivative of ['no-skill', 'damage', 'formula', 'future'] as const) {
      const next: Project = JSON.parse(original);
      if (derivative === 'no-skill') delete next.timeline[0].skillId;
      if (derivative === 'damage') next.timeline[0].damage = { skillId: 'kaeya.burst', hitIndex: 0, crit: 'noncritical', reaction: 'none' };
      if (derivative === 'formula') next.definitions.find(definition => definition.id === next.timeline[0].definition)!.nodes = [{ id: 'real-damage', op: 'game-damage' }];
      if (derivative === 'future') {
        next.timeline[0].timeMs = 1001;
        next.timeline.push({ id: 'query', actor, kind: 'damage', definition: `${actor}-real-damage`, timeMs: 1000, order: 1,
          damage: { skillId: 'kaeya.burst', hitIndex: 0, crit: 'noncritical', reaction: 'none', capture: { recordId: source, phase: 'before' } } });
      }
      expect(projectSchema.safeParse(next).success).toBe(false);
    }
    expect(evaluateTimeline(project).points).toEqual([]);
  });
  it.each(['duplicate-attribute', 'missing-skill'] as const)('rejects the %s derivative of the actual capture definition', async variant => {
    const character = await getCharacter('kaeya');
    const capture = character.talents.find(talent => talent.category === 'burst')!.hits[0].snapshot!;
    if (variant === 'duplicate-attribute') capture.attributes.push('attack');
    else capture.sourceSkillId = 'deleted-source-skill';
    expect(characterDefinitionSchema.safeParse(character).success).toBe(false);
  });

  it.each([['jean', 1, 1.3328], ['kaeya', 0, 1.3192]] as const)
    ('calculates %s burst part %i with an explicit source and independently derived values', async (id, hitIndex, coefficient) => {
      const build = await setting(id);
      const { project, source, record } = query(build, 1000, hitIndex);
      const attack = (id === 'jean' ? 18.62 * 8.739 + 76.4582 : 18.6984 * 8.349 + 66.90411) + 41.0671 * 7.275 + 155.6;
      const expected = attack * coefficient * 0.5 * 0.9;
      const original = JSON.stringify(project);
      const result = evaluateTimeline(project);
      expect(result.status).toBe('complete');
      expect(result.points).toHaveLength(1);
      expect(result.totalValue).toBeCloseTo(expected, 8);
      expect(result.points[0].real?.capture).toMatchObject({ recordId: source, phase: 'before', attributes: expect.arrayContaining(['attack']) });
      expect(result.reads?.find(read => read.key === 'attack')?.recordId).toBe(source);
      expect(evaluateTimeline(projectSchema.parse(JSON.parse(original))).totalValue).toBeCloseTo(expected, 8);
      expect(JSON.stringify(project)).toBe(original);
      expect(evaluateDamage(build, record.damage, enemy).status).toBe('partial'); // No project source context supplied.
      const panel = resolveBuild(build);
      const read: DamageAttributeReader = stat => Object.hasOwn(panel.stats, stat) ? panel.stats[stat as StatKey] : 0;
      expect(evaluateDamage(build, record.damage, enemy, 0, read, { read, panel }).value).toBeCloseTo(expected, 8);
    });

  it('calculates Jean initial burst directly without imposing the persistent field capture', async () => {
    const build = await setting('jean');
    const result = evaluateDamage(build, { skillId: 'jean.burst', hitIndex: 0, crit: 'noncritical', reaction: 'none' }, enemy);
    const attack = 18.62 * 8.739 + 76.4582 + 41.0671 * 7.275 + 155.6;
    expect(result.status).toBe('complete');
    expect(result.value).toBeCloseTo(attack * 7.2216 * 0.5 * 0.9, 8);
    expect(result.capture).toBeUndefined();
  });

  it.each(['missing', 'unknown-source', 'unknown-phase'] as const)('keeps %s capture information partial without a current-value fallback', async mode => {
    const build = await setting();
    const { project, record } = query(build);
    if (mode === 'missing') delete record.damage!.capture;
    else if (mode === 'unknown-source') record.damage!.capture!.recordId = null;
    else record.damage!.capture!.phase = null;
    const result = evaluateTimeline(project);
    expect(result.status).toBe('partial');
    expect(result.totalValue).toBeNull();
    expect(result.points[0].real?.scaling[0].attribute).toBeNull();
    expect(result.diagnostics.some(diagnostic => diagnostic.message.includes('捕获'))).toBe(true);
  });

  it.each(['deleted', 'wrong-owner', 'wrong-skill', 'untyped', 'future', 'same-order', 'self-after', 'not-snapshotted'] as const)
    ('rejects the %s reference derivative atomically', async variant => {
      const { project, source, record } = query(await setting());
      const snapshot = project.timeline.find(entry => entry.id === source)!;
      if (variant === 'deleted') project.timeline = project.timeline.filter(entry => entry.id !== source);
      if (variant === 'wrong-owner') snapshot.actor = addActorFromBuild(project, await setting());
      if (variant === 'wrong-skill') snapshot.skillId = 'kaeya.skill';
      if (variant === 'untyped') delete snapshot.skillId;
      if (variant === 'future') snapshot.timeMs = 1001;
      if (variant === 'same-order') { snapshot.timeMs = record.timeMs; snapshot.order = record.order; }
      if (variant === 'self-after') record.damage!.capture = { recordId: record.id, phase: 'after' };
      if (variant === 'not-snapshotted') record.damage!.skillId = 'kaeya.normal';
      expect(projectSchema.safeParse(project).success).toBe(false);
      expect(evaluateTimeline(project).status).toBe('invalid');
      // Invalid new references never mutate the existing project on a domain command.
      const valid = query(await setting());
      const before = JSON.stringify(valid.project);
      expect(() => addSkillHit(valid.project, valid.actor, 'kaeya.burst', 0, 1000,
        { crit: 'noncritical', reaction: 'none', capture: { recordId: 'deleted-source', phase: 'before' } })).toThrow();
      expect(JSON.stringify(valid.project)).toBe(before);
    });

  it('reads HP-gated crit at the source without inheriting current-hit overrides', async () => {
    const { project, actor, source, record } = query(await setting('kaeya', 'harbingerofdawn'));
    project.combatStates = [{ id: 'source-hp', actor, startMs: 0, endMs: 100, values: { hpRatio: 1 } }];
    record.damage!.crit = 'expected';
    record.damage!.conditions = { hpRatio: null };
    const attack = 18.6984 * 8.349 + 66.90411 + 38.7413 * 7.346 + 116.7;
    const result = evaluateTimeline(project);
    expect(result.status).toBe('complete');
    expect(result.points[0].real?.parts.crit).toBeCloseTo(1 + 0.19 * (0.5 + 0.102 * 4.594), 10);
    expect(result.totalValue).toBeCloseTo(attack * 1.3192 * (1 + 0.19 * (0.5 + 0.102 * 4.594)) * 0.5 * 0.9, 7);
    expect(result.reads?.some(read => read.key === 'critRate' && read.recordId === source && read.value === 0.19)).toBe(true);
    project.combatStates = [];
    record.damage!.conditions = { hpRatio: 1 }; // Current hit is known; source remains unknown.
    expect(evaluateTimeline(project).status).toBe('partial');
    record.damage!.crit = 'noncritical';
    expect(evaluateTimeline(project).status).toBe('complete'); // Unused source crit does not require HP.
  });
});

const recording = '.references/enka/official-example-2026-11-13.json';
describe.skipIf(!existsSync(recording))('capture calculations using actual recorded Noblesse artifact values', () => {
  it('does not activate the real Noblesse burst trigger merely by adding an independent read anchor', async () => {
    const preview = await previewEnkaImport(JSON.parse(readFileSync(recording, 'utf8')), '618285856', createAccount());
    const recorded = preview.rows.find(row => row.character.showcase?.build.character.id === 'bennett')!.character.showcase!.build;
    const build = await setting();
    // Explicit theoretical reuse of the original equipment, never claimed as Kaeya's player build.
    build.artifacts = structuredClone(recorded.artifacts); build.sets = structuredClone(recorded.sets);
    const project = createEmptyProject(); project.enemy = enemy;
    const actor = addActorFromBuild(project, build);
    const source = addAttributeCapture(project, actor, 'kaeya.burst', 200);
    addSkillHit(project, actor, 'kaeya.burst', 0, 1000, { crit: 'noncritical', reaction: 'none', capture: { recordId: source, phase: 'after' } });
    const result = evaluateTimeline(project);
    expect(result.status).toBe('complete');
    expect(result.points).toHaveLength(1);
    expect(result.effectInstances?.some(instance => instance.content?.entity === 'noblesseoblige.4')).toBe(false);
    // Action time is a separate independent condition, not synthesized from capture time.
    addSkillAction(project, actor, 'kaeya.burst', 0);
    const triggered = evaluateTimeline(project);
    expect(triggered.effectInstances?.find(instance => instance.content?.entity === 'noblesseoblige.4')?.startMs).toBe(0);
    expect(triggered.points).toHaveLength(1);
    const white = 18.6984 * 8.349 + 66.90411 + 41.0671 * 7.275 + 155.6;
    expect(triggered.totalValue! - result.totalValue!).toBeCloseTo(white * 0.2 * 1.3192 * 1.2 * 0.45, 7);
  });
  it('captures before/after Noblesse at the source and recalculates a weapon candidate', async () => {
    const preview = await previewEnkaImport(JSON.parse(readFileSync(recording, 'utf8')), '618285856', createAccount());
    const recorded = preview.rows.find(row => row.character.showcase?.build.character.id === 'bennett')!.character.showcase!.build;
    const original = JSON.stringify(recorded);
    const build = await setting();
    // Explicit theoretical wearing of the original Bennett artifacts by Kaeya, not an account or combat observation.
    build.artifacts = structuredClone(recorded.artifacts);
    build.sets = structuredClone(recorded.sets);
    const stats: Partial<Record<StatKey, number>> = {};
    for (const item of recorded.artifacts) {
      stats[item.mainStat] = (stats[item.mainStat] ?? 0) + recorded.artifactMain[item.mainStat]![item.level];
      for (const sub of item.substats) stats[sub.stat] = (stats[sub.stat] ?? 0) + sub.value;
    }
    const { project, actor, source, record } = query(build, 1000, 0, 'after');
    const white = 18.6984 * 8.349 + 66.90411 + 41.0671 * 7.275 + 155.6;
    const base = white * (1 + (stats.attackPercent ?? 0)) + (stats.attack ?? 0);
    const capturedAttack = base + white * 0.2;
    const expected = capturedAttack * 1.3192 * (1.2 + (stats.cryoBonus ?? 0)) * 0.5 * 0.9;
    const result = evaluateTimeline(project);
    expect(result.status).toBe('complete');
    expect(result.totalValue).toBeCloseTo(expected, 7);
    expect(result.reads?.some(read => read.key === 'attack' && read.recordId === source && Math.abs(read.value! - capturedAttack) < 1e-8)).toBe(true);
    record.damage!.capture!.phase = 'before';
    expect(evaluateTimeline(project).totalValue).toBeCloseTo(base * 1.3192 * (1.2 + (stats.cryoBonus ?? 0)) * 0.5 * 0.9, 7);
    record.damage!.capture!.phase = 'after';
    const before = JSON.stringify(project);
    const candidate = structuredClone(project);
    candidate.candidate.actors.find(entry => entry.id === actor)!.build!.weapon = await getWeapon('primordialjadecutter');
    const jadeWhite = 18.6984 * 8.349 + 66.90411 + 44.3358 * 8.01 + 186.7;
    const hp = (975.6164 * 8.349 + 3490.7378) * (1.2 + (stats.hpPercent ?? 0)) + (stats.hp ?? 0);
    const jadeAttack = jadeWhite * (1.2 + (stats.attackPercent ?? 0)) + (stats.attack ?? 0) + hp * 0.012;
    expect(evaluateTimeline(candidate).totalValue).toBeCloseTo(jadeAttack * 1.3192 * (1.2 + (stats.cryoBonus ?? 0)) * 0.5 * 0.9, 7);
    expect(JSON.stringify(project)).toBe(before);
    record.damage!.reaction = { type: 'melt', trigger: 'record-owner' };
    const melt = evaluateTimeline(project);
    const em = stats.elementalMastery ?? 0;
    expect(melt.totalValue).toBeCloseTo(expected * 1.5 * (1 + 2.78 * em / (1400 + em)), 7);
    expect(melt.reads?.some(read => read.key === 'elementalMastery' && read.recordId === record.id)).toBe(true);
    expect(JSON.stringify(recorded)).toBe(original);
  });

  it('retains a captured team buff after expiry within Kaeya burst duration', async () => {
    const preview = await previewEnkaImport(JSON.parse(readFileSync(recording, 'utf8')), '618285856', createAccount());
    const recorded = preview.rows.find(row => row.character.showcase?.build.character.id === 'bennett')!.character.showcase!.build;
    const jean = await setting('jean');
    // Explicit theoretical Jean wearing of the original artifacts; Kaeya has none, avoiding duplicate physical references.
    jean.artifacts = structuredClone(recorded.artifacts);
    jean.sets = structuredClone(recorded.sets);
    const project = createEmptyProject();
    project.enemy = enemy;
    const owner = addActorFromBuild(project, jean);
    const actor = addActorFromBuild(project, await setting());
    addSkillAction(project, owner, 'jean.burst', 0); // Noblesse expires at 12000.
    const source = addSkillAction(project, actor, 'kaeya.burst', 6000);
    addSkillHit(project, actor, 'kaeya.burst', 0, 13000,
      { crit: 'noncritical', reaction: 'none', capture: { recordId: source, phase: 'before' } });
    // One query 7 s after the explicit capture point, within Kaeya's 8 s C0 duration.
    const attack = (18.6984 * 8.349 + 66.90411 + 41.0671 * 7.275 + 155.6) * 1.2;
    const result = evaluateTimeline(project);
    expect(result.status).toBe('complete');
    expect(result.points).toHaveLength(1);
    expect(result.totalValue).toBeCloseTo(attack * 1.3192 * 0.5 * 0.9, 8);
    expect(result.reads?.some(read => read.key === 'attack' && read.timeMs === 6000)).toBe(true);
    expect(result.effectInstances?.find(instance => instance.content?.entity === 'noblesseoblige.4')?.endMs).toBe(12000);
  });
});
