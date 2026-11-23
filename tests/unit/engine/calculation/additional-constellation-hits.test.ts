import { expect, it } from 'vitest';
import * as engine from '@leyline/engine';
import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { additionalConstellationHitIds, auditAdditionalConstellationHits } from '../../../../tools/lib/additional-constellation-hits.mjs';

it('verifies the additional C2 strikes and the existing C2 Sprout branch using retained sources', async () => {
  const [characters, weapons, sets] = await Promise.all([
    Promise.all(additionalConstellationHitIds.map(getCharacter)),
    Promise.all(['dullblade', 'huntersbow'].map(getWeapon)),
    Promise.all(['goldentroupe', 'noblesseoblige'].map(getArtifactSet)),
  ]);
  const result = auditAdditionalConstellationHits({ characters, weapons, sets }, engine);

  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.resolved.map(row => row.entity)).toEqual(additionalConstellationHitIds);
  expect(result.gaps.map(row => [row.entity, row.field])).toEqual([
    ['collei', '/constellations/1/description'],
  ]);
  expect(result.verified).toEqual(new Set([
    'aether-geo/constellations/1/hits/0/base',
    'aether-geo/constellations/1/hits/0/snapshot',
    'aether-geo/constellations/1',
    'lumine-geo/constellations/1/hits/0/base',
    'lumine-geo/constellations/1/hits/0/snapshot',
    'lumine-geo/constellations/1',
    'lynette/constellations/1/hits/0',
    'lynette/constellations/1',
    'collei/passives/0/hits/0',
  ]));
  expect(result.summary.additionalConstellationHitClausesVerified).toBe(3);
  for (const id of ['aether-geo', 'lumine-geo']) {
    const rows = result.rows.filter(row => row.entity === id);
    const buffAtPlacement = rows.find(row => row.settings.case === '生成时攻击加成，爆炸前到期');
    const buffAfterPlacement = rows.find(row => row.settings.case === '生成后获得攻击加成');
    expect(buffAtPlacement?.value).toBeCloseTo(buffAfterPlacement!.value! * 1.2, 9);
    expect(rows.find(row => row.required?.includes('captureOrder.panel'))?.value).toBeNull();
  }
});
