import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numericAudit, assertNumericAudit, readAuditJson } from '../../tools/lib/numeric-audit.mjs';

test('adopted current numeric fields match actual source tables without a hash inventory',async()=>{
  const report = await numericAudit();
  assertNumericAudit(report);
  // Preserve the previously checked tables while allowing new rows from adopted sources.
  const minimum = { 'character-base': 1, 'character-curves': 1, 'character-promotion': 1, 'talent-parameters': 1,
    'weapon-base': 1, 'weapon-curves': 1, 'weapon-promotion': 1, 'artifact-affixes': 1, 'artifact-main': 722,
    'reaction-levels': 100, 'reaction-formulas': 10, 'effect-refinements': 45, 'stellar-equipment': 12, 'stellar-action-state': 14 };
  for (const [family, count] of Object.entries(minimum)) {
    assert.ok(report.comparedValues[family] >= count, `missing numeric source comparisons: ${family}`);
  }
  assert.equal(report.canonicalHashes,undefined);
  assert.equal(report.sourceHashes,undefined);
});

test('numeric derivatives of actual character, artifact and reaction tables fail without relying on a stored audit',async()=>{
  const report = await numericAudit(path=>{
    const value = readAuditJson(path);
    if(path==='src/game-data/data/characters/jean.json'){
      value.attributes.base.attack+=1;
      value.progression.promotion[0].maxLevel+=1;
      value.talents[0].parameters[0].values[0]+=1;
    }
    if(path==='src/game-data/data/weapons/dullblade.json')value.baseAttack+=1;
    if(path==='src/game-data/data/characters/vesna.json')value.calculation.bundle.formulas.find(item=>item.identity.id==='vesna.discipline').template.rate=0.11;
    if(path==='src/game-data/data/actions/vesna.json')value.calculation.bundle.stateMachines[0].states.find(state=>state.key==='vesna.disciplineStacks').duration.value.value+=1;
    if(path==='src/game-data/data/tables/artifact-main.json')value[5].elementalMastery[20]=187;
    if(path==='src/game-data/data/calculation/reactions.json') value.rules.levelMultipliers[90]+=1;
    if(path==='src/game-data/data/artifact-sets/noblesseoblige.json') value.calculation.bundle.formulas.find(item=>item.identity.id==='noblesseoblige.burst-bonus').template.value.value=0.19;
    return value;
  });
  assert.equal(report.differences.length, 10);
  for (const family of ['character-promotion', 'talent-parameters', 'weapon-base']) {
    assert.ok(report.differences.some(row => row.family === family), family);
  }
  assert.ok(report.differences.some(row=>row.field==='jean/base/attack' && row.source===18.62));
  assert.ok(report.differences.some(row=>row.field==='5/elementalMastery/20' && row.source===186.5));
  assert.ok(report.differences.some(row=>row.field==='reaction-level/90' && row.source===1446.8535));
  assert.ok(report.differences.some(row => row.family === 'reaction-level-checkpoints' && row.field === 'reaction-level-checkpoint/90'));
  assert.ok(report.differences.some(row=>row.field==='noblesse/2pc' && row.source===0.2));
  assert.ok(report.differences.some(row=>row.field==='vesna/discipline/rate' && row.source===0.1));
  assert.ok(report.differences.some(row=>row.field==='vesna/actions/discipline-duration' && row.source===20000));
  assert.throws(()=>assertNumericAudit(report),/require review/);
});
