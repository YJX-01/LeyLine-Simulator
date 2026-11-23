import * as engine from '@leyline/engine';
import { expect, it } from 'vitest';
import { auditFallImmunity, fallImmunityIds } from '../../../../tools/lib/fall-immunity.mjs';
import { createRuntimeCatalog } from '../../../../tools/lib/runtime-catalog.mjs';

it('limits terrain-leap fall immunity to the receiving character and the current confirmed fall', async () => {
  const catalog = await createRuntimeCatalog();
  const result = auditFallImmunity({
    characters: await Promise.all([...fallImmunityIds, 'noelle'].map(id => catalog.get('characters', id))),
    weapons: await Promise.all(['serpentspine', 'beginnersprotector', 'apprenticesnotes'].map(id => catalog.get('weapons', id))),
  }, engine);

  expect(result.rows.filter(row => row.issue).slice(0, 3)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    'iansan/passives/2/buffs/0/modifiers/0',
    'varesa/passives/2/buffs/0/modifiers/0',
  ]));
  for (const entity of fallImmunityIds) {
    const rows = result.rows.filter(row => row.entity === entity);
    const fall = rows.filter(row => row.output === 'attribute.fallDamageReduction');
    expect(fall.filter(row => row.value === 1).map(row => row.probe.recipient)).toEqual(['actor']);
    expect(fall.some(row => row.probe.recipient === 'peer' && row.value === 0)).toBe(true);
    expect(fall.some(row => row.probe.outgoingPlunge && row.value === 0)).toBe(true);
    expect(fall.some(row => row.probe.ownLeap === undefined && row.status === 'unknown')).toBe(true);
    expect(new Set(rows.filter(row => row.output === 'attribute.incomingDamageReduction').map(row => row.value))).toEqual(new Set([0, -0.03]));
    expect(new Set(rows.filter(row => row.output === 'target.ordinaryDamageReduction').map(row => row.value))).toEqual(new Set([0.15]));
  }
}, 90_000);
