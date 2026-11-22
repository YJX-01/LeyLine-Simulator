import { officialShowcase } from '../helpers/recorded-reference';
import { packDocument } from '../../src/web/src/domain/content-document';
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { projectSchema, type Project } from '@leyline/schema';
import { evaluateDamage, evaluateTimeline } from '@leyline/engine';
import { getWeapon } from '@leyline/game-data';
import { createCombatStateReader } from '../../src/engine/src/timeline/combat-state';
import { createAccount } from '../../src/web/src/domain/account';
import { previewEnkaImport } from '../../src/web/src/domain/enka-import';
import { addActorFromBuild } from '../../src/web/src/domain/real-project';
import { importProject, removeProjectActor } from '../../src/web/src/domain/workbench-project';
import { setCombatStateInterval, setDamageStateOverride } from '../../src/web/src/domain/combat-state';
import { recordedProject } from '../helpers/recorded-project';

// Format/error derivatives of an actual showcase, not an observed team or combat axis.
// Each hit is a single query context; its time and state are explicit test annotations.
let recorded: Project;
function queryProject(timeMs = 1000): Project {
  const project = structuredClone(recorded);
  const actor = project.candidate.actors[0];
  project.timeline.push({ id: 'state-query', actor: actor.id, timeMs, order: 0, kind: 'damage',
    definition: `${actor.id}-real-damage`, damage: { hit: { definition: { group: 'characters' as const, namespace: 'builtin', id: 'xingqiu', revision: '3' }, hitId: 'xingqiu.skill.param1' }, crit: null, reaction: null } });
  project.combatStates = [{ id: 'hp-annotation', actor: actor.id, startMs: 1000, endMs: 2000, values: { hpRatio: 1, shielded: false } }];
  return project;
}

describe.skipIf(!existsSync(officialShowcase))('combat-state format derivatives of the recorded public showcase', () => {
  beforeAll(async () => { recorded = await recordedProject(officialShowcase); }, 30000);

  it.each([0, 999, 1000, 1999, 2000])('reads left-closed right-open intervals at %i ms', timeMs => {
    const project = projectSchema.parse(queryProject(timeMs));
    const state = createCombatStateReader(project)(project.candidate.actors[0].id, project.timeline[0]);
    expect(state.conditions).toEqual(timeMs >= 1000 && timeMs < 2000 ? { hpRatio: 1, shielded: false } : {});
    expect(state.reads.find(read => read.field === 'hpRatio')?.source).toBe(timeMs >= 1000 && timeMs < 2000 ? 'interval' : 'unknown');
  });

  it.each([null, 0, 0.9])('preserves explicit HP override %s without falling back or mutating intervals', hpRatio => {
    const project = queryProject();
    const actor = project.candidate.actors[0].id;
    const intervalBefore = JSON.stringify(project.combatStates);
    setDamageStateOverride(project, 'state-query', actor, { hpRatio, onField: false });
    const state = createCombatStateReader(project)(actor, project.timeline[0]);
    expect(state.conditions).toEqual({ hpRatio, onField: false, shielded: false });
    expect(state.reads.find(read => read.field === 'hpRatio')?.source).toBe('override');
    expect(JSON.stringify(project.combatStates)).toBe(intervalBefore);
    setDamageStateOverride(project, 'state-query', actor, undefined);
    expect(createCombatStateReader(project)(actor, project.timeline[0]).conditions.hpRatio).toBe(1);
  });

  it('keeps owner overrides separate from another recorded character and from source-action reads', async () => {
    const project = queryProject();
    const preview = await previewEnkaImport(JSON.parse(readFileSync(officialShowcase, 'utf8')), '618285856', createAccount());
    const bennett = preview.rows.find(row => row.character.showcase!.build.character.id === 'bennett')!.character.showcase!.build;
    const other = addActorFromBuild(project, bennett);
    const owner = project.candidate.actors[0].id;
    setCombatStateInterval(project, { id: 'other-hp', actor: other, startMs: 0, endMs: 2000, values: { hpRatio: 1 } });
    setDamageStateOverride(project, 'state-query', owner, { hpRatio: 0 });
    const read = createCombatStateReader(project);
    expect(read(owner, project.timeline[0]).conditions.hpRatio).toBe(0);
    expect(read(other, project.timeline[0]).conditions.hpRatio).toBe(1);
    setDamageStateOverride(project, 'state-query', other, { hpRatio: null });
    expect(createCombatStateReader(project)(other, project.timeline[0]).conditions.hpRatio).toBeNull();
    const standalone = evaluateDamage(project.candidate.actors[0].build, project.timeline[0].damage, undefined);
    expect(standalone.status).toBe('invalid');
    expect(standalone.issues).toContainEqual({ code: 'invalid-input', message: '状态覆盖引用已失效。' });
    expect(evaluateTimeline(project).status).toBe('partial');
    const sourceAction: Project['timeline'][number] = { ...project.timeline[0], id: 'source-action-query', kind: 'action', damage: undefined };
    expect(createCombatStateReader(project)(owner, sourceAction).conditions.hpRatio).toBe(1);
  });

  it('rejects overlaps, empty intervals, duplicate identities and missing actor references atomically', () => {
    const project = queryProject();
    const before = JSON.stringify(project);
    const interval = project.combatStates![0];
    expect(() => setCombatStateInterval(project, { ...interval, id: 'overlap', startMs: 1999, endMs: 3000 })).toThrow();
    expect(() => setCombatStateInterval(project, { ...interval, endMs: interval.startMs })).toThrow();
    expect(() => setCombatStateInterval(project, { ...interval, actor: 'missing-recorded-actor' })).toThrow();
    expect(projectSchema.safeParse({ ...project, combatStates: [interval, interval] }).success).toBe(false);
    expect(JSON.stringify(project)).toBe(before);
    setCombatStateInterval(project, { ...interval, id: 'adjacent', startMs: 2000, endMs: 3000 });
    setCombatStateInterval(project, { ...interval, id: 'another-field', values: { onField: true } });
    expect(projectSchema.safeParse(project).success).toBe(true);
  });

  it('validates field and actor conflicts after merging hit overrides with intervals', async () => {
    const project = queryProject();
    const preview = await previewEnkaImport(JSON.parse(readFileSync(officialShowcase, 'utf8')), '618285856', createAccount());
    const other = addActorFromBuild(project, preview.rows.find(row => row.character.showcase!.build.character.id === 'bennett')!.character.showcase!.build);
    const owner = project.candidate.actors[0].id;
    setCombatStateInterval(project, { id: 'on-field', actor: owner, startMs: 0, endMs: 2000, values: { onField: true } });
    expect(() => setCombatStateInterval(project, { id: 'other-field', actor: other, startMs: 0, endMs: 2000, values: { onField: true } })).toThrow();
    expect(() => setDamageStateOverride(project, 'state-query', other, { onField: true })).toThrow();
    setDamageStateOverride(project, 'state-query', owner, { onField: false });
    setDamageStateOverride(project, 'state-query', other, { onField: true });
    expect(projectSchema.safeParse(project).success).toBe(true);
    const duplicate = structuredClone(project);
    duplicate.timeline[0].damage!.facts!.push({ subject: { kind: 'actor', id: owner }, values: { onField: { value: null, provenance: 'explicit', sourceRefs: [] } } });
    expect(projectSchema.safeParse(duplicate).success).toBe(false);
  });

  it('round-trips annotations, returns state provenance and retains missing combat facts', () => {
    const project = queryProject();
    const roundTrip = importProject(JSON.stringify(packDocument('axis', project)));
    expect(roundTrip).toEqual(project);
    const result = evaluateTimeline(roundTrip);
    expect(result.status).toBe('partial'); // Recorded C6 and absent enemy/crit/reaction remain unresolved.
    expect(result.points[0].value).toBeNull();
    expect(result.stateReads).toContainEqual({ actor: project.candidate.actors[0].id, field: 'hpRatio', timeMs: 1000,
      recordId: 'state-query', value: 1, source: 'interval', intervalId: 'hp-annotation' });
    removeProjectActor(roundTrip, roundTrip.candidate.actors[0].id);
    expect(roundTrip.combatStates).toEqual([]);
    expect(projectSchema.safeParse(roundTrip).success).toBe(true);
  });

  it('applies interval HP to an explicit theoretical weapon replacement without changing the recording', async () => {
    const project = queryProject();
    const actor = project.candidate.actors[0];
    const original = JSON.stringify(actor.build);
    // This is a trial replacement, not evidence that this account owns or equipped Harbinger.
    actor.build = { ...actor.build!, weapon: await getWeapon('harbingerofdawn'), refinement: 1 };
    const before = JSON.stringify(project);
    const intervalResult = evaluateTimeline(project);
    // The original artifacts: 31.1% circlet main, 7.0% + 13.6% substats; base CR 5%.
    const baseRate = 0.05 + 0.311 + 0.07 + 0.136;
    expect(intervalResult.points[0].real?.panel.stats.critRate).toBeCloseTo(baseRate + 0.14, 12);
    expect(JSON.stringify(project)).toBe(before);
    setDamageStateOverride(project, 'state-query', actor.id, { hpRatio: 0.9 });
    expect(evaluateTimeline(project).points[0].real?.panel.stats.critRate).toBeCloseTo(baseRate, 12);
    setDamageStateOverride(project, 'state-query', actor.id, { hpRatio: null });
    project.timeline[0].damage!.crit = 'expected';
    const unknown = evaluateTimeline(project);
    expect(unknown.diagnostics).toContainEqual(expect.objectContaining({ code: 'unknown', message: expect.stringContaining('hpRatio') }));
    expect(unknown.stateReads).toContainEqual(expect.objectContaining({ actor: actor.id, field: 'hpRatio', value: null, source: 'override' }));
    expect(unknown.points[0].value).toBeNull();
    const reread = await recordedProject(officialShowcase);
    expect(JSON.stringify(reread.candidate.actors[0].build)).toBe(original);
  });

  it('does not turn an action into hits or accept hit overrides attached to an action', () => {
    const project = queryProject();
    project.timeline[0].kind = 'action';
    expect(projectSchema.safeParse(project).success).toBe(false);
    delete project.timeline[0].damage;
    const result = evaluateTimeline(project);
    expect(result.points).toEqual([]);
    expect(result.plan?.timeline).toHaveLength(1);
  });
});
