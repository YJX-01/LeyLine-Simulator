import * as engine from '@leyline/engine';
import { expect, it } from 'vitest';
import { auditSceneEnvironmentAmounts } from '../../../../tools/lib/scene-environment-amounts.mjs';

it('keeps scoped observations and generic configuration distinct from current dungeon settlements', () => {
  const audit = auditSceneEnvironmentAmounts({ characters: [], weapons: [] }, engine);
  expect(audit.gaps).toEqual([]);
  expect(audit.verified.size).toBe(0);
  expect(audit.baseVerified.size).toBe(0);
  expect(audit.rows).toHaveLength(32);
  expect(new Set(audit.resolved.map(({ entity, field }) => entity + field)).size).toBe(32);
  expect(audit.rows.every(row => row.value === null)).toBe(true);

  expect(audit.rows.find(row => row.dungeonId === 5123 && row.field === '/disorder/0')).toMatchObject({
    entity: 'scene.field.domainofblessingelegiacrimeiv.0',
    sceneId: 40410,
    referenceOnly: { meterCapacity: 100, genericLoss: { flat: 150, maxHpRatio: 0.01, intervalMs: 1000 } },
  });
  expect(audit.rows.find(row => row.dungeonId === 5120 && row.field === '/disorder/2')).toMatchObject({
    sceneId: 40404,
    referenceOnly: { genericWarmPointDelta: -5, genericWarmPointIntervalMs: 200 },
  });
  expect(audit.rows.find(row => row.dungeonId === 5265)).toMatchObject({
    entity: 'scene.field.domainofmasterycircleofembersiv.0',
    sceneId: 40105,
    referenceOnly: { genericMultiplier: 0.7, genericIntervalMs: 6000, historicalFirstApplicationMs: 3000 },
  });
  expect(audit.rows.filter(row => [4403, 4413, 4423].includes(row.dungeonId)).map(row => row.sceneId)).toEqual([40953, 40953, 40953]);
  expect(audit.observations.map(({ character, characterLevel, encounterLevel, damage, schedule, targetIdentity }) =>
    [character, characterLevel, encounterLevel, damage, schedule, targetIdentity])).toEqual([
    ['凯亚', 50, 88, 74208, null, null],
    ['班尼特', 80, 88, 74208, null, null],
  ]);
});
