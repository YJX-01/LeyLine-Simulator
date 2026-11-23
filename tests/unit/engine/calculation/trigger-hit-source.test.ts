import { describe, expect, it } from 'vitest';
import * as engine from '@leyline/engine';
import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { auditTriggerHitSources, triggerHitSourceIds } from '../../../../tools/lib/trigger-hit-source-audit.mjs';

describe('direct damage from character passives and constellations', () => {
  it('matches independently computed coefficients, triggers and attack category effects', async () => {
    const [characters, weapons, sets] = await Promise.all([
      Promise.all(triggerHitSourceIds.map(id => getCharacter(id))),
      Promise.all(['dullblade', 'beginnersprotector', 'huntersbow', 'wastergreatsword', 'apprenticesnotes'].map(id => getWeapon(id))),
      Promise.all(['goldentroupe', 'wandererstroupe', 'noblesseoblige'].map(id => getArtifactSet(id))),
    ]);
    const result = auditTriggerHitSources({ characters, weapons, sets }, engine);
    expect(result.rows).toHaveLength(110);
    expect(result.rows.filter(row => row.issue)).toEqual([]);
    expect(result.verified).toContain('mavuika/constellations/5');
    expect(result.verified).toContain('kachina/constellations/5');
    expect(result.verified).toContain('ororon/passives/0');
    expect(result.verified).toContain('yaoyao/constellations/5');
    expect(result.verified).toContain('yaoyao/talents/2');
    expect(result.verified).toContain('lohen/constellations/1');
    expect(result.verified.size).toBe(11);
    expect(result.summary.triggerHitSourceOpen).toBe(1);
  }, 15000);
});
