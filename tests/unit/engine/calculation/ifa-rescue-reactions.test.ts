import * as engine from '@leyline/engine';
import { expect, it } from 'vitest';
import { auditIfaRescueReactions, ifaRescueReactionCharacterIds, ifaRescueReactionWeaponIds } from '../../../../tools/lib/ifa-rescue-reactions.mjs';
import { createRuntimeCatalog } from '../../../../tools/lib/runtime-catalog.mjs';

it('applies Rescue Essentials to the current eligible reaction with its own rate and cap', async () => {
  const catalog = await createRuntimeCatalog();
  const result = auditIfaRescueReactions({
    characters: await Promise.all(ifaRescueReactionCharacterIds.map(id => catalog.get('characters', id))),
    weapons: await Promise.all(ifaRescueReactionWeaponIds.map(id => catalog.get('weapons', id))),
  }, engine);

  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    'ifa/passives/0', 'ifa/passives/0/buffs/0', 'ifa/constellations/1', 'ifa/constellations/1/buffs/0',
  ]));
  const families = ['swirl', 'electro-charged', 'lunar-charged', 'stellar-swirl'];
  expect(families.every(family => result.rows.some(row => row.probe.family === family && row.probe.rank === 2
    && row.probe.points === 88 && row.value! > 0))).toBe(true);
  expect(result.rows.some(row => row.probe.points === null && row.status === 'unknown')).toBe(true);
}, 90_000);
