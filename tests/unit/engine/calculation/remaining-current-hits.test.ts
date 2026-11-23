import { describe, expect, it } from 'vitest';
import * as engine from '@leyline/engine';
import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { auditRemainingCurrentHits, remainingCurrentHitIds } from '../../../../tools/lib/remaining-current-hits-audit.mjs';

describe('current-hit talent and constellation clauses', () => {
  it('matches independent expectations on actual catalog loadouts', async () => {
    const [characters, weapons, emblem] = await Promise.all([
      Promise.all(remainingCurrentHitIds.map(id => getCharacter(id))),
      Promise.all(['dullblade', 'beginnersprotector', 'huntersbow', 'wastergreatsword', 'favoniussword', 'apprenticesnotes', 'engulfinglightning'].map(id => getWeapon(id))),
      getArtifactSet('emblemofseveredfate'),
    ]);
    const result = auditRemainingCurrentHits({ characters, weapons, sets: [emblem] }, engine);
    expect(result.rows).toHaveLength(95);
    expect(result.rows.filter(row => row.issue)).toEqual([]);
    expect(result.verified).toContain('emilie/constellations/5');
    expect(result.verified).toContain('jahoda/constellations/5');
    expect(result.verified).toContain('aether-electro/passives/1');
    expect(result.verified).toContain('lumine-electro/passives/1');
  }, 15000);
});
