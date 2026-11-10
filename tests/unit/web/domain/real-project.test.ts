import { describe, expect, it } from 'vitest';
import { getCharacter, getWeapon, getArtifactMain, DATA_VERSION } from '@leyline/game-data';
import { evaluateTimeline } from '@leyline/engine';
import { projectSchema, type Build } from '@leyline/schema';
import { addActorFromBuild, addSkillHits } from '../../../../src/web/src/domain/real-project';

async function build(): Promise<Build> {
  return { dataVersion: DATA_VERSION, character: await getCharacter('jean'), weapon: await getWeapon('favoniussword'),
    artifactMain: await getArtifactMain(), sets: [], level: 90, ascension: 6, constellation: 0, talents: { normal: 9, skill: 9, burst: 9 },
    weaponLevel: 90, weaponAscension: 6, refinement: 1, hpRatio: 1, artifacts: [] };
}
function empty() {
  return projectSchema.parse({ schemaVersion: 2, rulesVersion: 'timeline-v1', calculationProfile: 'direct', id: 'real-edit-test', revision: '1', definitions: [], candidate: { id: 'candidate', actors: [] }, conditions: {}, timeline: [], objective: {} });
}
describe('real axis editing and inventory identity', () => {
  it('creates a self-contained axis and detaches it from source data and candidate inputs', async () => {
    const source = await build();
    const project = empty();
    const actor = addActorFromBuild(project, source);
    addSkillHits(project, actor, 'jean.skill', 2000);
    source.character.attributes.base.attack = 99999;
    expect(evaluateTimeline(project).totalValue).toBeCloseTo(1549.2330752985004, 8);
    expect(evaluateTimeline(JSON.parse(JSON.stringify(project))).totalValue).toBeCloseTo(1549.2330752985004, 8);
    const before = JSON.stringify(project);
    expect(() => addSkillHits(project, actor, 'jean.skill', -1)).toThrow('合法');
    expect(JSON.stringify(project)).toBe(before);
  });
  it('rejects duplicated real items from one account while preserving separate source identities', async () => {
    const source = await build();
    source.inventoryAccountId = 'one';
    source.artifacts = [{ id: 'flower', inventoryAccountId: 'one', slot: 'flower', rarity: 5, level: 20, mainStat: 'hp', setId: 'none', substats: [] }];
    const project = empty();
    addActorFromBuild(project, source);
    addActorFromBuild(project, source);
    expect(projectSchema.safeParse(project).success).toBe(false);
    project.candidate.actors[1].build!.inventoryAccountId = 'two';
    project.candidate.actors[1].build!.artifacts[0].inventoryAccountId = 'two';
    expect(projectSchema.safeParse(project).success).toBe(true);
    // A mixed-account build retains the individual piece namespace in its file snapshot.
    project.candidate.actors[1].build!.inventoryAccountId = 'one';
    expect(projectSchema.safeParse(project).success).toBe(true);
  });
});
