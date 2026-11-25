import * as engine from '@leyline/engine';
import { expect, it } from 'vitest';
import { auditConfirmedReactionElevation, confirmedReactionElevationIds, confirmedReactionElevationPeerIds,
  confirmedReactionElevationWeaponIds } from '../../../../tools/lib/confirmed-reaction-elevation.mjs';
import { createRuntimeCatalog } from '../../../../tools/lib/runtime-catalog.mjs';

it('applies the documented constellation elevations to the eligible damage output', async () => {
  const catalog = await createRuntimeCatalog();
  const result = auditConfirmedReactionElevation({
    characters: await Promise.all([...confirmedReactionElevationIds, ...confirmedReactionElevationPeerIds].map(id => catalog.get('characters', id))),
    weapons: await Promise.all(confirmedReactionElevationWeaponIds.map(id => catalog.get('weapons', id))),
  }, engine);

  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.resolved.map(row => row.entity)).toEqual(confirmedReactionElevationIds);
  const overlap = result.rows.filter(row => row.output === 'cross-owner-elevation');
  expect(overlap).toHaveLength(14);
  for (const [entity, expected] of [['flins', 1.65], ['nefer', 1.35]] as const) {
    const row = overlap.find(item => item.entity === entity && item.probe.columbinaRank === 6);
    expect(row?.status).toBe('known');
    expect(row?.factor).toBeCloseTo(expected, 10);
    expect(row?.value).toBeGreaterThan(0);
  }
  expect(result.rows.some(row => row.probe.stacking === 'attribute.reaction.stellar-conduct.elevation' && row.status === 'unknown')).toBe(true);
  expect(result.rows.find(row => row.output === 'unverified-cross-owner-elevation')?.status).toBe('unknown');
  expect(result.rows.filter(row => row.probe.hitId === 'zibai.skill.param1').map(row => row.status)).toContain('unknown');
  expect(result.rows.some(row => row.probe.hitId === 'zibai.skill.param1' && row.factor === 1.48 && (row.value ?? 0) > 0)).toBe(true);
}, 90_000);
