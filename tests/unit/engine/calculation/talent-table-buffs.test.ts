import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditTalentTableBuffs } from '../../../../tools/lib/talent-table-buff-audit.mjs';

it('binds talent detail curves to their scoped battle attributes and source limits', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(['alyosha', 'cyno', 'dehya', 'eula', 'hutao', 'kaeya', 'mika', 'razor', 'xilonen'].map(getCharacter)),
    Promise.all(['beginnersprotector', 'blacktassel', 'dullblade', 'wastergreatsword'].map(getWeapon)),
  ]);
  const result = auditTalentTableBuffs({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    'alyosha/talents/1/details/4', 'cyno/talents/2/details/9', 'dehya/talents/1/details/3',
    'eula/talents/1/details/3', 'hutao/talents/1/details/1', 'mika/talents/1/details/3',
    'razor/talents/1/details/2', 'razor/talents/2/details/2', 'razor/talents/2/details/3', 'xilonen/talents/1/details/1',
  ]));
});
