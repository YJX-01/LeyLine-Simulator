import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numericAudit, assertNumericAudit, readAuditJson } from '../../tools/lib/numeric-audit.mjs';

test('adopted current numeric fields match actual source tables without a hash inventory',()=>{
  const report = numericAudit();
  assertNumericAudit(report);
  assert.equal(Object.values(report.comparedValues).reduce((sum,count)=>sum+count,0),167243);
  assert.equal(report.comparedValues['reaction-levels'],100);
  assert.equal(report.comparedValues['reaction-formulas'],10);
  assert.equal(report.comparedValues['artifact-main'],399);
  assert.equal(report.canonicalHashes,undefined);
  assert.equal(report.sourceHashes,undefined);
});

test('numeric derivatives of actual character, artifact and reaction tables fail without relying on a stored audit',()=>{
  const report = numericAudit(path=>{
    const value = readAuditJson(path);
    if(path==='src/game-data/data/characters/jean.json')value.attributes.base.attack+=1;
    if(path==='src/game-data/data/tables/artifact-main.json')value.elementalMastery[20]=187;
    if(path==='src/game-data/data/tables/reactions.json') { value.levelMultipliers[90]+=1; value.amplifying.emNumerator=2.79; }
    return value;
  });
  assert.equal(report.differences.length,4);
  assert.ok(report.differences.some(row=>row.field==='jean/base/attack' && row.source===18.62));
  assert.ok(report.differences.some(row=>row.field==='elementalMastery/20' && row.source===186.5));
  assert.ok(report.differences.some(row=>row.field==='reaction-level/90' && row.source===1446.8535));
  assert.ok(report.differences.some(row=>row.field==='amplifying/emNumerator' && row.source===2.78));
  assert.throws(()=>assertNumericAudit(report),/require review/);
});
