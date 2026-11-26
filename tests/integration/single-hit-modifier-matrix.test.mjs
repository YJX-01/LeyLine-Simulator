import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditSingleHitModifiers, precomputeAliasHitIds } from '../../tools/lib/single-hit-modifier-matrix.mjs';
import { auditWorkerCount, mergeSingleHitModifierResults, runAuditWorkers, shardCharacterIds } from '../../tools/lib/parallel-audit.mjs';
import { createRuntimeCatalog } from '../../tools/lib/runtime-catalog.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { auditBuild, novice } from '../../tools/lib/roster-audit-settings.mjs';

test('ordinary hits respect modifier scope, stacking, recipients, resistance and crit selection across the catalog', async t => {
  const catalog = await createRuntimeCatalog();
  const get = (group, ids) => Promise.all(ids.map(id => catalog.get(group, id)));
  const characters = await get('characters', catalog.inventory.characters);
  const weaponControls = ['rust', 'thestringless', 'theblacksword', 'wolfsgravestone', 'tomeoftheeternalflow', 'staffofhoma'];
  const weapons = await get('weapons', [...Object.values(novice), 'blackcliffslasher', ...weaponControls]);
  const workers = auditWorkerCount(12);
  let rows, unsampled;
  if (workers > 1) {
    const aliasHitIds = [...precomputeAliasHitIds(characters)];
    const shards = shardCharacterIds(catalog.inventory.characters, workers);
    const jobs = shards.map((characterIds, index) => ({
      task: 'single-hit-shard',
      payload: { characterIds, aliasHitIds, includeCrossChecks: index === 0 },
    }));
    ({ rows, unsampled } = mergeSingleHitModifierResults(await runAuditWorkers(jobs, workers)));
  } else {
    const engine = await loadContentSchema('/src/engine/src/index.ts');
    const sets = await get('sets', catalog.inventory.sets);
    ({ rows, unsampled } = auditSingleHitModifiers({ characters, weapons, sets }, engine));
  }
  const missing = unsampled.filter(row => row.required);
  const general = rows.filter(r => r.rule === 'ordinary-profiles');
  const baseline = general.filter(r => r.conditions.profile === 'baseline');
  const profiles = new Set(general.map(r => r.conditions.profile));
  await t.test('every eligible hit and input receives the same loadout comparisons', () => {
    const measured = new Map();
    for (const { hit, recipient, conditions } of general) {
      const key = JSON.stringify([recipient, hit, conditions.health, conditions.count, conditions.spirit]);
      if (!measured.has(key)) measured.set(key, new Set());
      const current = measured.get(key);
      assert.ok(!current.has(conditions.profile), key + ': duplicate ' + conditions.profile);
      current.add(conditions.profile);
    }
    assert.ok(profiles.size >= 26);
    for (const [key, seen] of measured) assert.deepEqual(seen, profiles, key);
    assert.equal(rows.filter(r => r.rule === 'ordinary-party').length, baseline.length * 4);
    assert.ok(new Set(baseline.map(r => r.hit)).size >= 1804);
    assert.equal(new Set(baseline.map(r => r.category)).size, 5);
    assert.equal(new Set(baseline.map(r => r.conditions.element)).size, 8);
    assert.deepEqual(new Set(baseline.map(r => r.conditions.scaling)), new Set(['attack', 'hp', 'defense', 'attack+defense', 'attack+hp']));
    const signature = r => [r.category, r.conditions.element, r.conditions.scaling].join('/');
    const signatures = new Set(baseline.map(signature));
    const equivalents = rows.filter(r => r.rule === 'ordinary-equivalent-sets');
    for (const profile of new Set(equivalents.map(r => r.conditions.profile))) {
      assert.deepEqual(new Set(equivalents.filter(r => r.conditions.profile === profile).map(signature)), signatures, profile);
    }
    // Every declared talent hit is either measured or named with its exclusion reason.
    const known = new Set([...baseline, ...unsampled.filter(r => r.rule === 'ordinary-profiles')].map(r => r.recipient + '/' + r.hit));
    for (const c of characters) for (const talent of c.talents) for (const h of talent.hits) assert.ok(known.has(c.id + '/' + h.id), h.id);
    const armed = rows.filter(row => row.rule === 'ordinary-weapons');
    for (const weapon of weaponControls) {
      const legal = new Set(characters.filter(c => c.identity.weaponType === weapons.find(w => w.id === weapon).weaponType).map(c => c.id));
      const equipped = armed.filter(r => r.conditions.weapon === weapon);
      assert.equal(equipped.length, 3 * baseline.filter(r => legal.has(r.recipient)).length, weapon);
      assert.equal(new Set(equipped.map(r => r.category)).size, 5, weapon);
    }
  });
  await t.test('the migrated talent checks retain every stack and both Travelers at the HP boundary', () => {
    for (const [hit, max] of [['lyney.skill.param1', 5], ['beidou.skill.param3', 2], ['shikanoinheizou.skill.param1', 4], ['mualani.skill.param1', 3]]) {
      assert.deepEqual(baseline.filter(r => r.hit === hit).map(r => r.conditions.count), Array.from({ length: max + 1 }, (_, i) => i), hit);
    }
    for (const id of ['aether-hydro', 'lumine-hydro']) for (const i of [1, 2, 3]) {
      const hit = id + '.skill.param' + i;
      assert.deepEqual(baseline.filter(r => r.hit === hit).map(r => r.conditions.health), [.49, .5, .50001, 1], hit);
    }
    for (const hit of ['noelle.skill.param6', 'yelan.skill.param1']) {
      const control = general.find(r => r.hit === hit && r.conditions.profile === 'gladiatorsfinale/2');
      assert.equal(control.actual, control.before, hit);
    }
  });
  await t.test('required reference hits are present', () => assert.equal(missing.length, 0, JSON.stringify(missing)));
  // Minimum reviewed sample sizes keep a lost category or an accidental new capture visible.
  const exclusions = rows.filter(row => row.rule === 'gladiator-exclusion');
  await t.test('all four exclusion categories retain their catalog coverage', () => {
    for (const [category, minimum] of Object.entries({ charged: 143, plunge: 147, skill: 140, burst: 131 })) {
      assert.ok(exclusions.filter(row => row.category === category).length >= minimum, category);
    }
  });
  const minimums = { 'gladiator-normal': characters.length * 3, 'gladiator-exclusion': 561, 'attack-times-bonus': 20,
    'ordinary-profiles': 1804 * 26, 'ordinary-equivalent-sets': 100, 'ordinary-weapons': 1804 * 3, 'ordinary-party': 1804 * 4,
    'crit-and-resistance': 45, 'additive-bonuses': 36,
    'crit-selection': 24, 'resistance-and-recipient': 36, 'party-attack': 16 };
  assert.deepEqual(new Set(rows.map(row => row.rule)), new Set(Object.keys(minimums)));
  for (const [rule, minimum] of Object.entries(minimums)) {
    const group = rows.filter(row => row.rule === rule);
    await t.test(rule + ' (' + group.length + ')', () => {
      const failures = group.filter(row => row.status !== 'passed');
      assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 8)));
      assert.ok(group.length >= minimum, 'Expected at least ' + minimum + ' cases');
    });
  }
});

test('timeline recorded zero targets contribute no damage, without changing omitted counts', async () => {
  const catalog = await createRuntimeCatalog({ characters: ['amber'], weapons: ['huntersbow'], sets: [], actions: [] });
  const engine = await loadContentSchema('/src/engine/src/index.ts');
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addSkillHit, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const project = createEmptyProject(); project.enemy = defaultEnemy();
  const actor = addActorFromBuild(project, auditBuild(await catalog.get('characters', 'amber'), await catalog.get('weapons', 'huntersbow')));
  const id = addSkillHit(project, actor, 'amber.normal', 0, 1000, { crit: 'noncritical', reaction: 'none' });
  project.objective.damageIds = [id];
  const fact = value => ({ value: value === null ? null : { kind: 'quantity', unit: 'count', value }, provenance: 'explicit', sourceRefs: [] });
  const evaluate = values => {
    const p = structuredClone(project);
    if (values) p.timeline.find(row => row.id === id).damage.facts = [{ subject: { kind: 'event' }, values }];
    const result = engine.evaluateTimeline(p);
    return { point: result.points.find(row => row.id === id).value, total: result.totalValue, objective: result.objectiveValue };
  };
  const original = evaluate(); assert.ok(original.point > 0);
  for (const values of [{ targetsHit: fact(0) }, { targetsDamaged: fact(0) }, { targetsHit: fact(1), targetsDamaged: fact(0) }]) {
    assert.deepEqual(evaluate(values), { point: 0, total: 0, objective: 0 });
  }
  assert.deepEqual(evaluate({ targetsHit: fact(null) }), { point: null, total: null, objective: null });
  assert.deepEqual(evaluate({ targetsHit: fact(3), targetsDamaged: fact(2) }), original);
});
