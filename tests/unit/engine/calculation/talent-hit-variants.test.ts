import { describe, expect, it } from 'vitest';
import * as engine from '@leyline/engine';
import { getArtifactMain, getCharacter, getWeapon, loadCatalog } from '@leyline/game-data';
import { characterHitRef, type Build, type DamageRequest, type Enemy } from '@leyline/schema';
import { auditTalentHitVariants } from '../../../../tools/lib/talent-hit-variants.mjs';

describe('single-hit talent selectors', () => {
  it('checks the formal roster against captured talent templates and per-hit values', async () => {
    const catalog = await loadCatalog();
    const [characters, weapons] = await Promise.all([
      Promise.all(catalog.characters.map(({ id }) => getCharacter(id))),
      Promise.all(['dullblade', 'apprenticesnotes', 'wastergreatsword', 'huntersbow', 'beginnersprotector', 'ironsting'].map(id => getWeapon(id))),
    ]);
    const result = auditTalentHitVariants({ characters, weapons }, engine);
    expect(result.rows.filter(row => row.issue)).toEqual([]);
    expect(result.gaps).toEqual([]);
    expect(result.rows.find(row => row.hit === 'yanfei.normal.param8')).toMatchObject({
      classification: 'variant', repetitions: 1, constellation: 6, locked: 0,
    });
    expect(result.rows.find(row => row.hit === 'xiangling.normal.param3')).toMatchObject({ classification: 'repeat', repetitions: 2 });
    expect(result.rows.find(row => row.hit === 'xiangling.normal.param4')).toMatchObject({ classification: 'repeat', repetitions: 4 });
    expect(result.rows.find(row => row.hit === 'baizhu.normal.param3')).toMatchObject({ classification: 'repeat', repetitions: 2 });
    expect(result.rows.find(row => row.hit === 'clorinde.skill.param7')).toMatchObject({ classification: 'variant', repetitions: 3 });
    expect(result.rows.find(row => row.hit === 'zhongli.skill.param2')).toMatchObject({ classification: 'source-event', repetitions: 1 });
    expect(result.rows.filter(row => row.classification === 'excluded').length).toBeGreaterThan(100);
  }, 30000);

  it('uses the same damage for each selectable repeated hit and validates the ordinal for its hit', async () => {
    const [character, weapon, artifactMain] = await Promise.all([getCharacter('xiangling'), getWeapon('beginnersprotector'), getArtifactMain()]);
    const build: Build = { schemaVersion: character.schemaVersion, kind: 'calculation-build', dataVersion: character.dataVersion,
      character, weapon, artifactMain, artifacts: [], sets: [], level: 1, ascension: 0, weaponLevel: 1, weaponAscension: 0, refinement: 1,
      constellation: 0, talents: { normal: 1, skill: 1, burst: 1 },
      sources: [{ id: 'content.artifact-main', kind: 'definition' }], artifactMainSourceRefs: ['content.artifact-main'] };
    const damage: DamageRequest = { hit: characterHitRef(character, 'xiangling.normal.param4'), crit: 'noncritical', reaction: 'none' };
    const enemy: Enemy = { level: 1, defenseReduction: 0, defenseIgnore: 0,
      resistances: { physical: 0.1, anemo: 0.1, geo: 0.1, electro: 0.1, hydro: 0.1, pyro: 0.1, cryo: 0.1, dendro: 0.1 } };
    const baseline = engine.evaluateDamage(build, damage, enemy);
    expect(baseline.value).toBeGreaterThan(0);
    for (const hitOrdinal of [1, 2, 3, 4]) {
      expect(engine.evaluateDamage(build, { ...damage, hitOrdinal }, enemy).value).toBe(baseline.value);
    }
    const invalid = engine.evaluateDamage(build, { ...damage, hitOrdinal: 5 });
    expect(invalid.status).toBe('invalid');
    expect(engine.evaluateDamage(build, { ...damage, hit: characterHitRef(character, 'xiangling.normal.param1'), hitOrdinal: 1 }).status).toBe('invalid');
  });
});
