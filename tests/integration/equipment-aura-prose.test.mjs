import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleCalculationLibrary } from '../../tools/lib/calculation-library.mjs';
import { readCalculationData } from '../../tools/lib/catalog-data.mjs';
import { auditEquipmentAuraCases, makeEquipmentAuraProseProofs } from '../../tools/lib/equipment-aura-prose.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { rosterEquipmentEvaluation } from '../../tools/lib/roster-equipment-evaluation.mjs';
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
