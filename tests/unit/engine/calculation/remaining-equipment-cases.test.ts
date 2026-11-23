import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditRemainingEquipmentCases } from '../../../../tools/lib/remaining-equipment-cases.mjs';

it('checks current equipment inputs and separate weapon hits against fixed source values', async () => {
  const buffs = ['absolution', 'crimsonmoonssemblance', 'vividnotions', 'wolffang', 'hereticsmoltenblade',
    'ultimateoverlordsmegamagicsword', 'prizedisshinblade', 'prizedisshinblade-01', 'prizedisshinblade-02', 'swordofdescension'];
  const hits = ['prizedisshinblade.curse', 'prizedisshinblade-01.curse', 'prizedisshinblade-02.curse', 'swordofdescension.descent'];
  const [characters, weapons] = await Promise.all([
    Promise.all(['kaeya', 'xiangling', 'lisa', 'noelle', 'kaedeharakazuha', 'aether-anemo'].map(getCharacter)),
    Promise.all(['dullblade', ...buffs].map(getWeapon)),
  ]);
  const result = auditRemainingEquipmentCases({ characters, weapons, sets: [] }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    ...buffs.map(id => id + '/buffs'),
    ...hits.map(id => id.split('.')[0] + '/hits/' + id),
  ]));
  for (const hit of hits) {
    const rows = result.rows.filter(row => row.field === '/hits/' + hit);
    expect(rows.some(row => row.value !== null && row.value > 0)).toBe(true);
    expect(rows.some(row => row.value === 0)).toBe(true);
    expect(rows.some(row => row.value === null)).toBe(true);
  }
  expect(result.gaps).toEqual([]);
});
