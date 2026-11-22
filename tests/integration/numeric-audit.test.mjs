import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numericAudit, assertNumericAudit, readAuditJson } from '../../tools/lib/numeric-audit.mjs';

test('adopted current numeric fields match actual source tables without a hash inventory',async()=>{
  const report = await numericAudit();
  assertNumericAudit(report);
  assert.equal(Object.values(report.comparedValues).reduce((sum,count)=>sum+count,0),168324);
  assert.equal(report.comparedValues['effect-refinements'],45);
  assert.equal(report.comparedValues['stellar-equipment'],12);
  assert.equal(report.comparedValues['stellar-action-state'],14);
  assert.equal(report.comparedValues['reaction-levels'],100);
  assert.equal(report.comparedValues['reaction-formulas'],10);
  assert.equal(report.comparedValues['artifact-main'],722);
  assert.equal(report.canonicalHashes,undefined);
  assert.equal(report.sourceHashes,undefined);
});

test('numeric derivatives of actual character, artifact and reaction tables fail without relying on a stored audit',async()=>{
  const report = await numericAudit(path=>{
    const value = readAuditJson(path);
    if(path==='src/game-data/data/characters/jean.json')value.attributes.base.attack+=1;
    if(path==='src/game-data/data/characters/vesna.json')value.calculation.bundle.formulas.find(item=>item.identity.id==='vesna.discipline').template.rate=0.11;
    if(path==='src/game-data/data/actions/vesna.json')value.calculation.bundle.stateMachines[0].states.find(state=>state.key==='vesna.disciplineStacks').duration.value.value+=1;
    if(path==='src/game-data/data/tables/artifact-main.json')value[5].elementalMastery[20]=187;
    if(path==='src/game-data/data/calculation/reactions.json') value.rules.levelMultipliers[90]+=1;
    if(path==='src/game-data/data/artifact-sets/noblesseoblige.json') value.calculation.bundle.formulas.find(item=>item.identity.id==='noblesseoblige.burst-bonus').template.value.value=0.19;
    return value;
  });
  assert.equal(report.differences.length,6);
  assert.ok(report.differences.some(row=>row.field==='jean/base/attack' && row.source===18.62));
  assert.ok(report.differences.some(row=>row.field==='5/elementalMastery/20' && row.source===186.5));
  assert.ok(report.differences.some(row=>row.field==='reaction-level/90' && row.source===1446.8535));
  assert.ok(report.differences.some(row=>row.field==='noblesse/2pc' && row.source===0.2));
  assert.ok(report.differences.some(row=>row.field==='vesna/discipline/rate' && row.source===0.1));
  assert.ok(report.differences.some(row=>row.field==='vesna/actions/discipline-duration' && row.source===20000));
  assert.throws(()=>assertNumericAudit(report),/require review/);
});
