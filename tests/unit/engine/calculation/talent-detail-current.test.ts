import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditTalentDetailCurrent } from '../../../../tools/lib/talent-detail-current-audit.mjs';

it('verifies confirmed summon durability, healing chance, and conversion quantities against captured talent details', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(['kaeya', 'amber', 'aratakiitto', 'ganyu', 'lyney', 'ningguang', 'noelle', 'lauma', 'clorinde'].map(getCharacter)),
    Promise.all(['dullblade', 'huntersbow', 'wastergreatsword', 'apprenticesnotes', 'recurvebow', 'thebell', 'prototypeamber'].map(getWeapon)),
  ]);
  const result = auditTalentDetailCurrent({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    'amber/talents/1/details/0', 'aratakiitto/talents/1/details/1', 'ganyu/talents/1/details/0',
    'lyney/talents/0/details/10', 'ningguang/talents/1/details/0', 'noelle/talents/1/details/3',
    'lauma/talents/2/details/1', 'clorinde/talents/1/details/4',
  ]));
});
