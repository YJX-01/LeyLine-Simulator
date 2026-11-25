import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';
import { auditRemainingAttributeDetails } from '../../tools/lib/remaining-attribute-details.mjs';
import { createRuntimeCatalog } from '../../tools/lib/runtime-catalog.mjs';

test('talent details verify the contribution on the selected recipient or hit', async () => {
  const [catalog, engine] = await Promise.all([createRuntimeCatalog(), loadContentSchema('/src/engine/src/index.ts')]);
  const ids = ['kaeya', 'eula', 'iansan', 'furina', 'kamisatoayato', 'raidenshogun', 'aether-cryo', 'nicole', 'valeriy', 'fischl', 'sandrone'];
  const weaponIds = ['dullblade', 'wastergreatsword', 'beginnersprotector', 'apprenticesnotes', 'vortexvanquisher', 'huntersbow'];
  const [characters, weapons] = await Promise.all([
    Promise.all(ids.map(id => catalog.get('characters', id))),
    Promise.all(weaponIds.map(id => catalog.get('weapons', id))),
  ]);
  const audit = auditRemainingAttributeDetails({ characters, weapons }, engine);
  const failures = audit.rows.filter(row => row.issue);
  assert.equal(failures.length, 0, JSON.stringify(failures[0]));
  const find = (entity, field, predicate) => audit.rows.find(row => row.entity === entity && row.field === field && predicate(row));
  const close = (value, expected) => assert.ok(typeof value === 'number' && Math.abs(value - expected) < 1e-8, String(value));

  const eula = find('eula', '/talents/1/details/5', row => row.rank === 10 && row.recipient === 'peer'
    && row.probe.values['eula.grimheartShredApplied'] && !row.probe.otherTarget);
  const otherEnemy = find('eula', '/talents/1/details/5', row => row.rank === 10 && row.recipient === 'peer' && row.probe.otherTarget);
  close(eula?.value, -.15);
  close(otherEnemy?.value, .1);

  const iansan = (active, night) => find('iansan', '/talents/2/details/3', row => row.weapon === 'vortexvanquisher'
    && row.recipient === 'peer' && row.probe.values['iansan.kineticNightsoul'] === night
    && row.probe.values['iansan.kineticMarkerActive'] === active && row.probe.onField);
  close(iansan(true, 42)?.value - iansan(false, 42)?.value, 330);
  const low = iansan(true, 41)?.value - iansan(false, 41)?.value;
  assert.ok(low > 0 && low < 330);

  const fanfare = find('furina', '/talents/2/details/3', row => row.rank === 10 && row.recipient === 'peer'
    && row.probe.cast === 'burst' && row.probe.values['furina.fanfarePoints'] === 300);
  close(fanfare?.value, .75);
  const resolve = audit.rows.filter(row => row.entity === 'raidenshogun' && row.field === '/talents/2/details/1');
  assert.ok(resolve.some(row => row.parameters.length === 2 && row.probe.hit === 'burst.param1' && row.value > 0));
  assert.ok(resolve.some(row => row.parameters.length === 2 && row.probe.hit === 'burst.param5' && row.value > 0));
  assert.ok(audit.verified.has('aether-cryo/talents/2/details/3'));
  assert.ok(audit.verified.has('kamisatoayato/talents/1/details/4'));
  assert.ok(audit.verified.has('nicole/talents/1/details/3'));
  const inactiveFischl = find('valeriy', '/talents/0/details/6', row => row.probe.peerValues?.['fischl.hexereiSecretRite'] === false
    && row.probe.recipient === 'actor' && row.probe.hit === 'normal.param5' && row.probe.values['valeriy.assaultOrder']);
  assert.equal(inactiveFischl?.status, 'known');
});
