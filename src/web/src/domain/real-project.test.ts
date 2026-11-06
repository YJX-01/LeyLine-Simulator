import { describe, expect, it } from 'vitest';
import { getRealCharacter, getRealWeapon, getArtifactMain, REAL_DATA_VERSION } from '@leyline/game-data/real';
import { evaluateWorkbench } from '@leyline/engine';
import { workbenchProjectSchema, type RealBuild } from '@leyline/schema';
import { addRealActor, addRealHits } from './real-project';

async function build(): Promise<RealBuild> {
  return { dataVersion: REAL_DATA_VERSION, character: await getRealCharacter('jean'), weapon: await getRealWeapon('favoniussword'),
    artifactMain: await getArtifactMain(), sets: [], level: 90, ascension: 6, constellation: 0, talents: { normal: 9, skill: 9, burst: 9 },
    weaponLevel: 90, weaponAscension: 6, refinement: 1, hpRatio: 1, artifacts: [] };
}
function empty() {
  return workbenchProjectSchema.parse({ schemaVersion: 1, rulesVersion: 'workbench-v1', id: 'real-edit-test', revision: '1', definitions: [], candidate: { id: 'candidate', actors: [] }, conditions: {}, timeline: [], objective: {} });
}
describe('real axis editing and inventory identity', () => {
  it('creates a self-contained axis and detaches it from source data and candidate inputs', async () => {
    const source = await build();
    const project = empty();
    const actor = addRealActor(project, source);
    addRealHits(project, actor, 'jean.skill', 2000);
    source.character.base.attack = 99999;
    expect(evaluateWorkbench(project).totalValue).toBeCloseTo(1549.2330752985004, 8);
    expect(evaluateWorkbench(JSON.parse(JSON.stringify(project))).totalValue).toBeCloseTo(1549.2330752985004, 8);
    const before = JSON.stringify(project);
    expect(() => addRealHits(project, actor, 'jean.skill', -1)).toThrow('合法');
    expect(JSON.stringify(project)).toBe(before);
  });
  it('rejects duplicated real items from one account while preserving separate source identities', async () => {
    const source = await build();
    source.inventoryAccountId = 'one';
    source.artifacts = [{ id: 'flower', inventoryAccountId: 'one', slot: 'flower', rarity: 5, level: 20, mainStat: 'hp', setId: 'none', substats: [] }];
    const project = empty();
    addRealActor(project, source);
    addRealActor(project, source);
    expect(workbenchProjectSchema.safeParse(project).success).toBe(false);
    project.candidate.actors[1].realBuild!.inventoryAccountId = 'two';
    project.candidate.actors[1].realBuild!.artifacts[0].inventoryAccountId = 'two';
    expect(workbenchProjectSchema.safeParse(project).success).toBe(true);
    // A mixed-account build retains the individual piece namespace in its file snapshot.
    project.candidate.actors[1].realBuild!.inventoryAccountId = 'one';
    expect(workbenchProjectSchema.safeParse(project).success).toBe(true);
  });
});
