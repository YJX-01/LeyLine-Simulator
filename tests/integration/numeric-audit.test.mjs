import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numericAudit, assertNumericAudit, readAuditJson } from '../../tools/lib/numeric-audit.mjs';

test('adopted current numeric fields match actual source tables without a hash inventory',()=>{
  const report = numericAudit();
  assertNumericAudit(report);
  assert.equal(Object.values(report.comparedValues).reduce((sum,count)=>sum+count,0),167133);
  assert.equal(report.comparedValues['artifact-main'],399);
  assert.equal(report.canonicalHashes,undefined);
  assert.equal(report.sourceHashes,undefined);
});

test('numeric derivatives of actual Jean and artifact tables fail even when no stored audit was updated',()=>{
  const report = numericAudit(path=>{
    const value = readAuditJson(path);
    if(path==='src/game-data/data/characters/jean.json')value.attributes.base.attack+=1;
    if(path==='src/game-data/data/tables/artifact-main.json')value.elementalMastery[20]=187;
    return value;
  });
  assert.equal(report.differences.length,2);
  assert.ok(report.differences.some(row=>row.field==='jean/base/attack' && row.source===18.62));
  assert.ok(report.differences.some(row=>row.field==='elementalMastery/20' && row.source===186.5));
  assert.throws(()=>assertNumericAudit(report),/require review/);
});
