import { describe, expect, it } from 'vitest';
import * as engine from '@leyline/engine';
import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { auditRemainingTriggeredStrikes, remainingTriggeredStrikeIds } from '../../../../tools/lib/remaining-triggered-strikes.mjs';

describe('conditional triggered damage from current content', () => {
  it('matches the documented attack multipliers, elements, category bonuses and conditions', async () => {
    const [characters, weapons, sets] = await Promise.all([
      Promise.all(remainingTriggeredStrikeIds.map(getCharacter)),
      Promise.all(['dullblade', 'wastergreatsword', 'apprenticesnotes', 'huntersbow', 'swordofnarzissenkreuz'].map(getWeapon)),
      Promise.all(['goldentroupe', 'noblesseoblige'].map(getArtifactSet)),
    ]);
    const result = auditRemainingTriggeredStrikes({ characters, weapons, sets }, engine);
    expect(result.rows.filter(row => row.issue)).toEqual([]);
    expect(result.verified).toEqual(new Set(['manekin/passives/0', 'manekina/passives/0']));
    expect(result.resolved.map(row => row.entity)).toEqual(['kinich', 'prune', 'manekin', 'manekina', 'kaveh', 'swordofnarzissenkreuz', 'jahoda']);
    expect(result.gaps.map(row => row.entity)).toEqual(['kinich', 'prune', 'kaveh', 'swordofnarzissenkreuz', 'jahoda']);
    for (const { entity } of result.resolved) {
      const rows = result.rows.filter(row => row.entity === entity);
      expect(rows.some(row => (row.expected ?? 0) > 0)).toBe(true);
      expect(rows.some(row => row.expected === 0)).toBe(true);
    }
    const refinements = result.rows.filter(row => row.entity === 'swordofnarzissenkreuz' && (row.expected ?? 0) > 0)
      .flatMap(row => row.settings.refinement ?? []);
    expect(refinements).toEqual([1, 2, 3, 4, 5]);
  }, 20000);
});
