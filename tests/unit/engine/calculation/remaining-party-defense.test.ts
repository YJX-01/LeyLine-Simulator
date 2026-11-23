import * as engine from '@leyline/engine';
import { expect, it } from 'vitest';
import { auditRemainingPartyDefense, remainingPartyDefenseIds } from '../../../../tools/lib/remaining-party-defense.mjs';
import { createRuntimeCatalog } from '../../../../tools/lib/runtime-catalog.mjs';

it('evaluates confirmed incoming, shielding and recovery clauses for the actual recipient', async () => {
  const catalog = await createRuntimeCatalog();
  const result = await auditRemainingPartyDefense({
    characters: await Promise.all([...remainingPartyDefenseIds, 'kaeya'].map(id => catalog.get('characters', id))),
    weapons: await Promise.all(['dullblade', 'beginnersprotector', 'apprenticesnotes', 'huntersbow', 'wastergreatsword'].map(id => catalog.get('weapons', id))),
    sets: await Promise.all(['maidenbeloved', 'travelingdoctor'].map(id => catalog.get('sets', id))),
  }, engine);

  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    'dehya/passives/0', 'emilie/passives/2', 'layla/passives/0', 'layla/constellations/0',
    'lauma/constellations/0', 'sigewinne/passives/1', 'sigewinne/passives/2',
  ]));
  for (const entity of remainingPartyDefenseIds) {
    expect(result.rows.some(row => row.entity === entity && row.status === 'unknown')).toBe(true);
    expect(result.rows.some(row => row.entity === entity && row.value !== null && row.value !== 0)).toBe(true);
  }
}, 90_000);
