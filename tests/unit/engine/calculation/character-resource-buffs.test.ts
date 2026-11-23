import { expect, it } from 'vitest';
import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { auditCharacterResourceBuffs, characterResourceBuffIds } from '../../../../tools/lib/character-resource-buffs.mjs';

it('evaluates resource grants, their supported bounds and Lohen’s resulting skill and burst damage', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all([...characterResourceBuffIds, 'kaeya'].map(getCharacter)),
    Promise.all(['beginnersprotector', 'whitetassel', 'apprenticesnotes', 'wastergreatsword', 'dullblade'].map(getWeapon)),
  ]);
  const { rows, verified, gaps } = auditCharacterResourceBuffs({ characters, weapons }, engine);
  expect(rows.filter(row => row.issue)).toEqual([]);
  expect(verified).toEqual(new Set([
    'lohen/passives/0/buffs/0/modifiers/0',
    'lohen/constellations/0/buffs/0/modifiers/0',
    'lohen/constellations/0/buffs/1/modifiers/0',
    'lohen/talents/1/buffs/0/modifiers/0',
    'lohen/talents/1/buffs/1/modifiers/0',
    'lohen/talents/2/buffs/0/modifiers/0',
    'lohen/constellations/3/buffs/0/modifiers/0',
    'nefer/passives/1/buffs/0/modifiers/0',
    'kinich/passives/0/buffs/0/modifiers/0',
  ]));
  for (const [mastery, expected] of [[501, .001], [550, .05], [599, .099], [999, .499]]) {
    const row = rows.find(candidate => candidate.entity === 'nefer' && candidate.probe?.mastery === mastery);
    expect(row?.status).toBe('known');
    expect(row?.value).toBeCloseTo(expected, 12);
  }
  expect(gaps).toContainEqual(expect.objectContaining({ entity: 'nefer', status: 'needs-evidence' }));
}, 15000);
