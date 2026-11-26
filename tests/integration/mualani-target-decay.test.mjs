import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readContentSource } from '../../tools/lib/content-source.mjs';
import { createRuntimeCatalog } from '../../tools/lib/runtime-catalog.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { auditBuild, auditHit, setGateFacts } from '../../tools/lib/roster-audit-settings.mjs';

test('Mualani bite applies target decay after base additions at C0 and C1', async () => {
  const source = readContentSource('tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/talents/mualani.json');
  const constellations = readContentSource('tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/constellations/mualani.json');
  assert.match(source.combat2.description, /3名敌人时造成原本72%的伤害/);
  assert.match(source.combat2.description, /向附近至多5名.*鲨鲨飞弹，造成相当于此次鲨鲨撕咬的伤害/s);
  assert.match(constellations.c1.description, /生命值上限的66%.*伤害衰减规则/s);
  // gcsim's independently implemented shockwave multiplier uses 14% per additional target, floored at 72%.
  // https://github.com/genshinsim/gcsim/blob/main/internal/characters/mualani/attack.go#L138-L160
  const catalog = await createRuntimeCatalog(), engine = await loadContentSchema('/src/engine/src/index.ts');
  const character = await catalog.get('characters', 'mualani'), weapon = await catalog.get('weapons', 'apprenticesnotes');
  const talent = character.talents.find(row => row.id === 'mualani.skill'), hit = talent.hits.find(row => row.id === 'mualani.skill.param1');
  const missile = talent.hits.find(row => row.id === 'mualani.skill.shark-missile');
  assert.ok(missile, 'the missile must be independently selectable');
  const firstHits = [];
  for (const constellation of [0, 1]) {
    const build = { ...auditBuild(character, weapon), level: 90, ascension: 6, constellation, talents: { normal: 10, skill: 10, burst: 10 } };
    const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
    assert.equal(prepared.ok, true, JSON.stringify(prepared.diagnostics));
    const values = [];
    for (const targets of [1, 2, 3]) {
      const { setup, request } = auditHit(character, talent, hit, 90);
      setGateFacts(character, request.frame, { 'mualani.waveMomentum': 3, 'mualani.biteTargets': targets,
        'mualani.firstSurgingBite': true });
      const result = engine.evaluateStructuredHit(prepared.team, setup, request);
      assert.equal(result.totals.all.state, 'known', JSON.stringify(result));
      values.push(result.totals.all.value.value);
      for (const triggered of [false, true]) {
        const other = auditHit(character, talent, missile, 90);
        setGateFacts(character, other.request.frame, { 'mualani.waveMomentum': 3, 'mualani.biteTargets': targets,
          'mualani.firstSurgingBite': true, 'mualani.sharkMissileTriggered': triggered });
        const missileResult = engine.evaluateStructuredHit(prepared.team, other.setup, other.request);
        assert.equal(missileResult.totals.all.state, 'known', JSON.stringify(missileResult));
        assert.ok(Math.abs(missileResult.totals.all.value.value - (triggered && targets >= 2 ? values.at(-1) : 0)) < 1e-8);
      }
    }
    assert.ok(values[0] > 0);
    firstHits.push(values[0]);
    assert.ok(Math.abs(values[1] / values[0] - 0.86) < 1e-9);
    assert.ok(Math.abs(values[2] / values[0] - 0.72) < 1e-9);
  }
  assert.ok(firstHits[1] > firstHits[0], 'C1 HP-based addition must be active');
});
