import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleCalculationLibrary } from '../../tools/lib/calculation-library.mjs';
import { readCalculationData } from '../../tools/lib/catalog-data.mjs';
import { characterResistanceBonusProofs } from '../../tools/lib/character-resistance-bonus-proofs.mjs';
import { makeCharacterMovementDefenseProse } from '../../tools/lib/character-movement-defense-prose.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { createContentLinker } from '../../src/game-data/src/link-content.mjs';

test('source resistance requires the audited hit and expiry for its exact clause', async () => {
  const [schemas, engine] = await Promise.all([loadContentSchema(), loadContentSchema('/src/engine/src/index.ts')]);
  const read = name => readCalculationData('src/game-data/data/' + name + '.json');
  const characters = ['ganyu', 'kaeya'].map(id => read('characters/' + id));
  const weapons = ['huntersbow', 'dullblade'].map(id => read('weapons/' + id));
  const compiled = engine.compileCalculation(assembleCalculationLibrary(read('calculation/common'), read('calculation/reactions'),
    [...characters, ...weapons]));
  assert.ok(compiled.ok, JSON.stringify(compiled.diagnostics));
  const linker = createContentLinker({ schemas, ...engine, library: compiled.program });
  const entities = { characters: characters.map(linker.character), weapons: weapons.map(linker.weapon), sets: [] };
  const listed = {
    entity: 'ganyu', field: '/constellations/0/buffs/0/modifiers/0', id: 'ganyu.c1.frostflake-shred',
    target: 'target.resistance.cryo', role: 'target', listed: true,
  };
  const evidence = characterResistanceBonusProofs(entities, { calculator: { buffs: [listed] } }, engine);
  assert.equal(evidence.length, 1);
  const statement = '二段蓄力重击的霜华矢或霜华绽发命中敌人时，会使敌人的冰元素抗性降低15%，持续6秒';
  const evaluate = records => makeCharacterMovementDefenseProse(entities, { registeredModifierEvidence: records });
  const lookup = evaluate(evidence);
  assert.equal(lookup('ganyu', '/constellations/0', statement).proofs[0].field, listed.field);
  assert.deepEqual(lookup('ganyu', '/constellations/0', statement.replace('6秒', '8秒')), { proofs: [], parts: [] });
  assert.deepEqual(lookup('ganyu', '/constellations/1', statement), { proofs: [], parts: [] });
  const withoutExpiry = evidence.map(row => ({ ...row, cases: row.cases.filter(probe => probe.settings.timeMs !== 6000) }));
  assert.deepEqual(evaluate(withoutExpiry)('ganyu', '/constellations/0', statement), { proofs: [], parts: [] });
});
