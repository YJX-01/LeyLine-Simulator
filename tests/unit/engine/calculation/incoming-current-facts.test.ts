import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditIncomingCurrentFacts } from '../../../../tools/lib/incoming-current-facts-audit.mjs';

it('matches fixed-source defensive and target debuff values for explicit current-hit inputs', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(['jean', 'aether-anemo', 'lumine-anemo', 'diona', 'aloy', 'xingqiu', 'kaeya', 'noelle'].map(getCharacter)),
    Promise.all(['dullblade', 'huntersbow', 'serpentspine'].map(getWeapon)),
  ]);
  const result = auditIncomingCurrentFacts({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    'jean/constellations/5', 'aether-anemo/constellations/3', 'lumine-anemo/constellations/3', 'diona/passives/1',
    'aloy/talents/1/details/2', 'xingqiu/talents/1/details/1', 'serpentspine/buffs',
  ]));
});
