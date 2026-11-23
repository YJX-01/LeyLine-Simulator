import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditSceneRangePoise } from '../../../../tools/lib/scene-range-poise.mjs';

it('evaluates the sourced Electro-Charged range and raw endurance delta on each selected scene and actor', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(['kaeya', 'lisa'].map(getCharacter)),
    Promise.all(['dullblade', 'apprenticesnotes'].map(getWeapon)),
  ]);
  const result = auditSceneRangePoise({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue).slice(0, 2)).toEqual([]);
  expect(result.summary).toEqual({
    sceneRangePoiseEvidenceRows: 14,
    sceneRangePoiseVerified: 14,
    sceneRangePoiseChecks: 284,
    sceneRangePoiseCheckFailures: 0,
  });
  const checks = [
    ['first', 4, 2], ['other-reaction', 4, 1],
    ['layers-4', 24, 0], ['layers-5', 24, 0.3], ['unknown-layers', 24, null], ['above-cap', 24, null],
  ] as const;
  for (const [name, count, value] of checks) {
    const rows = result.rows.filter(row => row.case === name);
    expect(rows).toHaveLength(count);
    expect(rows.every(row => row.value === value)).toBe(true);
  }
});
