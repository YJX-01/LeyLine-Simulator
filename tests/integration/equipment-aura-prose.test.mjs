import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleCalculationLibrary } from '../../tools/lib/calculation-library.mjs';
import { readCalculationData } from '../../tools/lib/catalog-data.mjs';
import { auditEquipmentAuraCases, makeEquipmentAuraProseProofs } from '../../tools/lib/equipment-aura-prose.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { rosterEquipmentEvaluation } from '../../tools/lib/roster-equipment-evaluation.mjs';
import { createRuntimeCatalog } from '../../tools/lib/runtime-catalog.mjs';
import { auditBuild, auditHit, bool, number } from '../../tools/lib/roster-audit-settings.mjs';
import { createContentLinker } from '../../src/game-data/src/link-content.mjs';

test('target-aura weapon prose requires every refinement, target branch and recipient exclusion', async () => {
  const [schemas, engine, { combatObservationUnits }] = await Promise.all([
    loadContentSchema(), loadContentSchema('/src/engine/src/index.ts'), loadContentSchema('/src/schema/src/calculation/event.ts'),
  ]);
  const read = name => readCalculationData('src/game-data/data/' + name + '.json');
  const characters = ['amber', 'kaeya', 'lisa', 'noelle', 'xiangling', 'jean'].map(id => read('characters/' + id));
  const weaponIds = ['bloodtaintedgreatsword', 'coolsteel', 'dragonsbane', 'lionsroar', 'magicguide', 'rainslasher', 'ravenbow'];
  const weapons = [...weaponIds, 'dullblade'].map(id => read('weapons/' + id));
  const compiled = engine.compileCalculation(assembleCalculationLibrary(read('calculation/common'), read('calculation/reactions'),
    [...characters, ...weapons]));
  assert.ok(compiled.ok, JSON.stringify(compiled.diagnostics));
  const linker = createContentLinker({ schemas, ...engine, library: compiled.program });
  const entities = { characters: characters.map(linker.character), weapons: weapons.map(linker.weapon), sets: [] };
  const equipment = rosterEquipmentEvaluation(entities, engine, combatObservationUnits);
  const equipmentAuraCases = auditEquipmentAuraCases(entities, engine);
  assert.deepEqual(equipmentAuraCases.rows.filter(row => row.issue).slice(0, 2), []);
  assert.equal(equipmentAuraCases.resolved.length, weaponIds.length);
  const prove = results => makeEquipmentAuraProseProofs(entities, { equipment, equipmentAuraCases, ...results });
  const proof = prove();
  for (const weapon of weaponIds) {
    const original = equipment.rows.find(row => row.entity === weapon && row.refinement === 1).description;
    const { whole, parts } = proof(weapon, '/buffs', original);
    assert.equal(whole.length, 1, weapon);
    assert.equal(whole[0].field, '/buffs/0/modifiers/0');
    assert.equal(whole[0].cases, 75);
    assert.equal(whole[0].refs.filter(ref => ref.endsWith('/description')).length, 5);
    assert.deepEqual(parts, []);
  }

  const sentence = '对处于水元素或冰元素影响下的敌人，造成的伤害提高12%';
  const missing = { whole: [], parts: [] };
  assert.deepEqual(proof('coolsteel', '/buffs', sentence.replace('冰元素', '雷元素')), missing);
  assert.deepEqual(proof('coolsteel', '/buffs/0', sentence), missing);
  const missingRefinement = { rows: equipment.rows.filter(row => row.entity !== 'coolsteel' || row.refinement !== 5) };
  assert.deepEqual(prove({ equipment: missingRefinement })('coolsteel', '/buffs', sentence), missing);

  for (const missingBranch of [
    row => row.settings.left === false && row.settings.right === true,
    row => row.settings.left === null && row.settings.right === false,
    row => row.settings.recipient === 'peer0',
  ]) {
    const equipmentAuraCasesWithoutBranch = { rows: equipmentAuraCases.rows.filter(row =>
      row.entity !== 'coolsteel' || row.rank !== 5 || !missingBranch(row)) };
    assert.deepEqual(prove({ equipmentAuraCases: equipmentAuraCasesWithoutBranch })('coolsteel', '/buffs', sentence), missing);
  }
});

test('equipment contribution probe reads trigger windows without overriding them with inactive defaults', async () => {
  const [catalog,engine,events]=await Promise.all([createRuntimeCatalog(),loadContentSchema('/src/engine/src/index.ts'),loadContentSchema('/src/schema/src/calculation/event.ts')]);
  const entities={characters:await Promise.all(['aether','lisa','kaeya'].map(id=>catalog.get('characters',id))),
    weapons:await Promise.all(['angelosheptades','athameartis','dullblade','apprenticesnotes'].map(id=>catalog.get('weapons',id))),sets:[]};
  const report=rosterEquipmentEvaluation(entities,engine,events.combatObservationUnits);
  for (const [id, expected] of [['athameartis.daybreak-owner',[.2,.4]],['athameartis.daybreak-team',[.16,.32]],
    ['athameartis.daybreak-owner-hexerei',[.15,.3]],['athameartis.daybreak-team-hexerei',[.12,.24]]]) {
    for (const [index,rank] of [1,5].entries()) {
      const entry=report.rows.find(row=>row.entity==='athameartis' && row.refinement===rank).modifiers.find(row=>row.id===id);
      assert.ok(Math.abs(entry.amount-expected[index])<1e-9,JSON.stringify(entry));
      assert.equal(entry.excluded,true);
      assert.equal(entry.expired,true);
    }
  }
  for (const rank of [1,5]) for (const id of ['angelosheptades.leading-light','angelosheptades.leading-light-backstage']) {
    const entry=report.rows.find(row=>row.entity==='angelosheptades' && row.refinement===rank).modifiers.find(row=>row.id===id);
    assert.ok(entry.amount>0,JSON.stringify(entry));
    assert.equal(entry.excluded,true);
    assert.equal(entry.expired,true);
  }
});

test('project shield observations reach both weapon windows and expire', async () => {
  const catalog = await createRuntimeCatalog(), engine = await loadContentSchema('/src/engine/src/index.ts');
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addCombatObservation, addSkillHit, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const barbara = await catalog.get('characters', 'barbara');
  for (const [weaponId, duration] of [['angelosheptades', 20000], ['jadefallssplendor', 3000]]) {
    const weapon = await catalog.get('weapons', weaponId), build = auditBuild(barbara, weapon);
    const project = createEmptyProject(); project.enemy = defaultEnemy();
    const actor = addActorFromBuild(project, build);
    addCombatObservation(project, actor, 10, 'shieldCreated', true);
    const ids = [9, 11, 10 + duration].map(time => addSkillHit(project, actor, barbara.talents[0].id, 0, time, { crit: 'noncritical', reaction: 'none',
      facts: [{ subject: { kind: 'actor', id: actor }, values: { onField: bool(true), 'angelosheptades.hexereiRecipient': bool(false) } }] }));
    const result = engine.evaluateTimeline(project);
    const values = ids.map(id => result.points.find(point => point.id === id)?.value);
    assert.ok(values.every(Number.isFinite), JSON.stringify(result.diagnostics));
    assert.ok(values[1] > values[0], `${weaponId} shield did not activate`);
    assert.ok(Math.abs(values[2] - values[0]) < 1e-8, `${weaponId} shield window did not expire`);
  }
});


test('Hymn single-layer bonus uses holder HP and leaves unconfirmed multi-layer bonus unknown', async () => {
  const catalog = await createRuntimeCatalog(), engine = await loadContentSchema('/src/engine/src/index.ts');
  const [owner, peer, weapon, sword, set] = await Promise.all([
    catalog.get('characters', 'neuvillette'), catalog.get('characters', 'kaeya'),
    catalog.get('weapons', 'hymnofthemaelstrom'), catalog.get('weapons', 'dullblade'),
    catalog.get('sets', 'gladiatorsfinale'),
  ]);
  const build = { ...auditBuild(owner, weapon, [set]), level: 90, ascension: 6, weaponLevel: 90, weaponAscension: 6,
    artifacts: ['flower', 'sands', 'goblet', 'circlet'].map((slot, i) => ({ id: 'hp-' + i, setId: set.id, slot,
      rarity: 5, level: 20, mainStat: slot === 'flower' ? 'hp' : 'hpPercent', inventory: null, sourceRefs: [], substats: [] })) };
  const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }, { id: 'peer', build: auditBuild(peer, sword) }]);
  assert.equal(prepared.ok, true, JSON.stringify(prepared.diagnostics));
  const talent = peer.talents[0], hit = talent.hits[0], { setup, request } = auditHit(peer, talent, hit, 90);
  setup.events.find(event => event.id === 'hit').actorId = 'peer';
  Object.assign(request.frame, { ownerId: 'peer', recipientId: 'peer', contributorId: null, hit: {
    skillId: talent.id, hitId: hit.id, category: hit.category, element: hit.element, origin: hit.origin, family: 'ordinary', reactionId: null } });
  const context = engine.createStructuredCombatContext(prepared.team, setup);
  const binding = key => ({ kind: 'attribute', actor: { role: 'owner' }, key: { namespace: 'builtin', id: 'attribute.' + key, revision: '1' }, at: { kind: 'current', phase: 'same' } });
  function read(layers, reaction, observed) {
    request.frame.factOverrides = [{ subject: { kind: 'actor', id: 'actor' }, facts: {
      'hymnofthemaelstrom.meadLayers': number('count', layers), 'hymnofthemaelstrom.reactionBuff': bool(reaction),
      ...(observed === undefined ? {} : { 'hymnofthemaelstrom.multilayerAttackBonus': number('scalar', observed) }), onField: bool(false) } },
    { subject: { kind: 'actor', id: 'peer' }, facts: { onField: bool(true) } }];
    const attack = engine.evaluateCombatBindings(prepared.team.program, context, { attack: binding('attackPercent') }, request.frame).outputs.attack;
    const hp = engine.evaluateCombatBindings(prepared.team.program, context, { hp: binding('hp') },
      { ...request.frame, ownerId: 'actor', recipientId: 'actor' }).outputs.hp;
    return { attack, hp };
  }
  const zero = read(0, false), single = read(1, false), reacted = read(1, true), multi = read(2, false), confirmed = read(2, false, .1);
  for (const result of [zero, single, reacted, confirmed]) assert.equal(result.attack.state, 'known');
  assert.equal(multi.attack.state, 'unknown');
  // R1 source: 0.4% per 1000 HP above 40000, capped at 8%; reaction increases this by 75%.
  const expected = hp => Math.min(.08, Math.max(0, hp - 40000) * .004 / 1000);
  assert.ok(Math.abs(single.attack.value.value - zero.attack.value.value - expected(single.hp.value.value)) < 1e-9);
  assert.ok(Math.abs(reacted.attack.value.value - zero.attack.value.value - expected(reacted.hp.value.value) * 1.75) < 1e-9);
  assert.ok(Math.abs(confirmed.attack.value.value - zero.attack.value.value - .1) < 1e-9);
});
