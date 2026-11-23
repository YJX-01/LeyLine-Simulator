import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditCurrentEnergyGrants, currentEnergyGrantAuditCharacterIds } from '../../../../tools/lib/current-energy-grants-audit.mjs';

it('checks current direct energy against source quantities, recipients and unlocks', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(currentEnergyGrantAuditCharacterIds.map(getCharacter)),
    Promise.all(['dullblade', 'beginnersprotector', 'apprenticesnotes', 'wastergreatsword', 'huntersbow'].map(getWeapon)),
  ]);
  const result = auditCurrentEnergyGrants({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified.size).toBeGreaterThan(80);
  expect(result.verified).toContain('aino/constellations/3/buffs/0');
  expect(result.verified).toContain('albedo/constellations/0/buffs/0');
  expect(result.verified).toContain('alyosha/constellations/0/buffs/0');
  expect(result.verified).toContain('ororon/passives/1/buffs/0');
  expect(result.gaps.map(row => row.entity + row.field)).toEqual(['valeriy/constellations/0/buffs/0/modifiers/0']);
}, 30000);
