import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditRemainingShieldGrants, remainingShieldGrantIds } from '../../../../tools/lib/remaining-shield-grants-audit.mjs';

it('checks current shield grants, strength, and repair against fixed sources', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(remainingShieldGrantIds.map(getCharacter)),
    Promise.all(['apprenticesnotes', 'beginnersprotector', 'dullblade', 'wastergreatsword'].map(getWeapon)),
  ]);
  const result = auditRemainingShieldGrants({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  const fields = ['kaeya/constellations/3', 'noelle/passives/0', 'dahlia/constellations/1', 'thoma/passives/0', 'lanyan/constellations/1'];
  expect(result.verified).toEqual(new Set(fields.map(field => field + '/buffs/0')));
  expect(result.resolved.map(row => row.entity + row.field)).toEqual(fields);
  expect(result.gaps.map(row => row.entity + row.field)).toEqual(fields);
});
