import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { getCharacter, getWeapon, getArtifactMain, getBuildSources, DATA_VERSION } from '@leyline/game-data';
import { evaluateTimeline } from '@leyline/engine';
import { projectSchema, type Build } from '@leyline/schema';
import { addActorFromBuild, addSkillAction, addSkillHit, defaultEnemy } from '../../../../src/web/src/domain/real-project';
import { recordedProject } from '../../../helpers/recorded-project';

const recordedSource = '.references/enka/official-example-2026-11-13.json';

async function build(): Promise<Build> {
  return { schemaVersion: 3, kind: 'calculation-build', ...await getBuildSources(), dataVersion: DATA_VERSION, character: await getCharacter('jean'), weapon: await getWeapon('favoniussword'),
    artifactMain: await getArtifactMain(), sets: [], level: 90, ascension: 6, constellation: 0, talents: { normal: 9, skill: 9, burst: 9 },
    weaponLevel: 90, weaponAscension: 6, refinement: 1, artifacts: [] };
}
function empty() {
  return projectSchema.parse({ schemaVersion: 5, rulesVersion: 'timeline-v1', calculationProfile: 'direct', id: 'real-edit-test', revision: '1', definitions: [], candidate: { id: 'candidate', actors: [] }, conditions: {}, timeline: [], objective: {} });
}
describe('real axis editing and inventory identity', () => {
  it('creates a self-contained axis and detaches it from source data and candidate inputs', async () => {
    const source = await build();
    const project = empty();
    const actor = addActorFromBuild(project, source);
    expect(project.enemy).toBeUndefined();
    project.enemy=defaultEnemy(); // Explicit calculation assumptions for this existing reference case.
    addSkillHit(project, actor, 'jean.skill', 0, 2000, {crit:'noncritical',reaction:'none'});
    source.character.attributes.base.attack = 99999;
    expect(evaluateTimeline(project).totalValue).toBeCloseTo(1549.2330752985004, 8);
    expect(evaluateTimeline(JSON.parse(JSON.stringify(project))).totalValue).toBeCloseTo(1549.2330752985004, 8);
    const before = JSON.stringify(project);
    expect(() => addSkillHit(project, actor, 'jean.skill', 0, -1)).toThrow('合法');
    expect(JSON.stringify(project)).toBe(before);
  });
  it('records an explicit canonical skill action atomically without expanding hits', async () => {
    const project = empty();
    const actor = addActorFromBuild(project, await build());
    const id = addSkillAction(project, actor, 'jean.burst', 1000);
    expect(project.timeline).toHaveLength(1);
    expect(project.timeline[0]).toMatchObject({ id, actor, kind: 'action', skillId: 'jean.burst', timeMs: 1000 });
    expect(project.timeline[0].damage).toBeUndefined();
    const snapshot = JSON.stringify(project);
    expect(() => addSkillAction(project, actor, 'xingqiu.burst', 1000)).toThrow();
    expect(JSON.stringify(project)).toBe(snapshot);
    expect(() => addSkillAction(project, actor, 'jean.burst', -1)).toThrow();
    expect(JSON.stringify(project)).toBe(snapshot);
  });
  it.skipIf(!existsSync(recordedSource))('reports duplicate inventory occupancy separately using the recorded showcase as a format derivative', async () => {
    const source = (await recordedProject(recordedSource)).candidate.actors[0].build!;
    // Software namespace/error edits only; neither a second player account nor observed wearing.
    source.artifacts.forEach(item => { item.inventory = { accountId: 'namespace-a', itemId: item.id }; });
    const project = empty();
    addActorFromBuild(project, source);
    addActorFromBuild(project, source);
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(evaluateTimeline(project).feasibility?.[0].status).toBe('conflict');
    project.candidate.actors[1].build!.artifacts.forEach(item => { item.inventory!.accountId = 'namespace-b'; });
    expect(evaluateTimeline(project).feasibility?.[0].status).toBe('pass');

  });
});
