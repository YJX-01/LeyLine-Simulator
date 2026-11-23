import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { auditNicoleCap } from '../../tools/lib/nicole-cap.mjs';
import { createRuntimeCatalog } from '../../tools/lib/runtime-catalog.mjs';

test('Nicole snapshots the capped non-extra attack bonus and adds C2 after applying the cap', async () => {
  const [catalog, engine] = await Promise.all([createRuntimeCatalog(), loadContentSchema('/src/engine/src/index.ts')]);
  const ids = {
    characters: ['nicole', 'sucrose', 'bennett', 'zhongli'],
    weapons: ['memoryofdust', 'thrillingtalesofdragonslayers', 'dullblade', 'beginnersprotector'],
    sets: ['gladiatorsfinale', 'shimenawasreminiscence', 'noblesseoblige'],
  };
  const entities = Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([group, entries]) =>
    [group, await Promise.all(entries.map(id => catalog.get(group, id)))])));
  const audit = auditNicoleCap(entities, engine);
  const issues = audit.rows.filter(row => row.issue);
  assert.equal(issues.length, 0, JSON.stringify(issues[0]));
  assert.ok(audit.verified.has('nicole/talents/1/details/4'));
  for (const [rank, cap] of [[1, 330], [10, 600]]) for (const constellation of [0, 2]) {
    const flat = constellation === 2 ? 300 : 0;
    const rows = audit.rows.filter(row => row.rank === rank && row.constellation === constellation && row.recipient === 'peer');
    const first = layers => rows.find(row => row.check === 'first-cast' && row.layers === layers);
    const refreshed = rows.find(row => row.check === 'refresh' && row.layers === 5);
    assert.ok(Math.abs(first(5).value - cap - flat) < 1e-8);
    assert.ok(first(4).basis < 4000 && first(5).basis > 4000);
    assert.ok(refreshed.value < first(4).value && first(4).value < first(5).value);
  }
});
