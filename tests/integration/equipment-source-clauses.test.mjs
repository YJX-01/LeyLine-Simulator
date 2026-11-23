import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleCalculationLibrary } from '../../tools/lib/calculation-library.mjs';
import { readCalculationData } from '../../tools/lib/catalog-data.mjs';
import { auditAdditionalEquipment } from '../../tools/lib/additional-equipment-values.mjs';
import { auditEquipmentEnergyGrants } from '../../tools/lib/equipment-energy-grants.mjs';
import { makeEquipmentProseProofs } from '../../tools/lib/equipment-source-clauses.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { createContentLinker } from '../../src/game-data/src/link-content.mjs';

test('equipment prose requires the exact grant, legal ranks and contrasting scope from its audit', async () => {
  const [schemas, engine] = await Promise.all([loadContentSchema(), loadContentSchema('/src/engine/src/index.ts')]);
  const read = name => readCalculationData('src/game-data/data/' + name + '.json');
  const characters = ['amber', 'kaeya', 'barbara', 'lisa'].map(id => read('characters/' + id));
  const weapons = ['dullblade', 'huntersbow', 'apprenticesnotes', 'royalbow', 'everlastingmoonglow'].map(id => read('weapons/' + id));
  const sets = ['noblesseoblige', 'scholar'].map(id => read('artifact-sets/' + id));
  const compiled = engine.compileCalculation(assembleCalculationLibrary(read('calculation/common'), read('calculation/reactions'),
    [...characters, ...weapons, ...sets]));
  assert.ok(compiled.ok, JSON.stringify(compiled.diagnostics));
  const linker = createContentLinker({ schemas, ...engine, library: compiled.program });
  const entities = { characters: characters.map(linker.character), weapons: weapons.map(linker.weapon), sets: sets.map(linker.set) };
  const additionalEquipment = auditAdditionalEquipment(entities, engine);
  const equipmentEnergyGrants = auditEquipmentEnergyGrants(entities, engine);
  assert.equal(additionalEquipment.summary.additionalEquipmentMismatches, 0);
  assert.equal(equipmentEnergyGrants.summary.equipmentEnergyMismatches, 0);
  const proof = makeEquipmentProseProofs(entities, { additionalEquipment, equipmentEnergyGrants });

  const teamAttack = '施放元素爆发后，队伍中所有角色攻击力提升20%，持续12秒';
  const team = proof('noblesseoblige', '/effects/1', teamAttack);
  assert.equal(team.whole.length, 1);
  assert.equal(team.whole[0].field, '/effects/1/buffs/0/modifiers/0');
  assert.ok(team.whole[0].refs.some(ref => ref.endsWith('/noblesseoblige/effect4Pc')));
  assert.equal(proof('noblesseoblige', '/effects/0', teamAttack).whole.length, 0);
  assert.equal(proof('noblesseoblige', '/effects/1', teamAttack.replace('20%', '25%')).whole.length, 0);

  const focus = '攻击造成伤害时，暴击率提升8%，最多堆叠5次';
  assert.deepEqual(proof('royalbow', '/buffs', focus).parts.map(part => part.text), ['暴击率提升8%']);
  assert.equal(proof('royalbow', '/buffs', focus).whole.length, 0);
  assert.equal(proof('royalbow', '/buffs', '攻击造成暴击后，移除已有的专注效果').parts.length, 0);

  const energy = '在施放元素爆发后的12秒内，普通攻击命中敌人时恢复0.6点元素能量，每0.1秒至多通过这种方式恢复一次元素能量';
  assert.deepEqual(proof('everlastingmoonglow', '/buffs', energy).parts.map(part => part.text), ['恢复0.6点元素能量']);
  assert.equal(proof('everlastingmoonglow', '/buffs', energy).whole.length, 0);
  const scholar = '获得元素微粒或元素晶球时，队伍中所有弓箭和法器角色额外恢复3点元素能量';
  assert.deepEqual(proof('scholar', '/effects/1', scholar).parts.map(part => part.text), ['队伍中所有弓箭和法器角色额外恢复3点元素能量']);

  const onlyPassingCases = audit => ({ ...audit, rows: audit.rows.filter(row => row.value > 0) });
  const incomplete = makeEquipmentProseProofs(entities, {
    additionalEquipment: onlyPassingCases(additionalEquipment),
    equipmentEnergyGrants: onlyPassingCases(equipmentEnergyGrants),
  });
  assert.deepEqual(incomplete('noblesseoblige', '/effects/1', teamAttack), { whole: [], parts: [] });
  assert.deepEqual(incomplete('everlastingmoonglow', '/buffs', energy), { whole: [], parts: [] });
});
