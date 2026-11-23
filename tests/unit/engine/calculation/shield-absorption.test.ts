import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditShieldAbsorption } from '../../../../tools/lib/shield-absorption-audit.mjs';

it('checks selected shields and caps against captured talent tables and independent caster stats', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(['baizhu', 'beidou', 'candace', 'citlali', 'dahlia', 'diona', 'ineffa', 'kaeya', 'kirara', 'lanyan',
      'layla', 'nicole', 'noelle', 'thoma', 'valeriy', 'xinyan', 'yunjin', 'zhongli'].map(getCharacter)),
    Promise.all(['apprenticesnotes', 'beginnersprotector', 'dullblade', 'huntersbow', 'wastergreatsword'].map(getWeapon)),
  ]);
  const result = auditShieldAbsorption({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    'baizhu/talents/2/details/0', 'beidou/talents/1/details/0', 'candace/talents/1/details/0', 'citlali/talents/1/details/1',
    'dahlia/talents/2/details/1', 'diona/talents/1/details/1', 'ineffa/talents/1/details/1', 'kirara/talents/1/details/1',
    'kirara/talents/1/details/2', 'lanyan/talents/1/details/1', 'layla/talents/1/details/2', 'nicole/talents/1/details/1',
    'noelle/talents/1/details/1', 'thoma/talents/1/details/1', 'thoma/talents/1/details/3', 'thoma/talents/2/details/2',
    'valeriy/talents/1/details/1', 'xinyan/talents/1/details/1', 'xinyan/talents/1/details/2', 'xinyan/talents/1/details/3',
    'yunjin/talents/1/details/3', 'zhongli/talents/1/details/3', 'zhongli/talents/1/details/4',
  ]));
});
