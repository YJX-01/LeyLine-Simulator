import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditCharacterInterruptionResistance, characterInterruptionResistanceIds, characterInterruptionResistancePeerIds } from '../../../../tools/lib/character-interruption-resistance.mjs';

it('evaluates each confirmed character poise multiplier in the sourced action, window, and recipient', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all([...characterInterruptionResistanceIds, ...characterInterruptionResistancePeerIds].map(getCharacter)),
    Promise.all(['dullblade', 'apprenticesnotes', 'wastergreatsword', 'beginnersprotector'].map(getWeapon)),
  ]);
  const result = auditCharacterInterruptionResistance({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified.size).toBe(17);
  expect(result.resolved).toHaveLength(14);
  expect(result.gaps).toHaveLength(14);
  expect(result.rows.filter(row => row.entity === 'yanfei' && row.contribution !== null).map(row => row.contribution)).toEqual([0.9, 0.8, 0.7, 0.6]);
  expect(result.rows.filter(row => row.probe.otherMultiplier === 0.5).map(row => row.value)).toEqual([0.35, 0.35]);
  expect(result.rows.find(row => row.probe.label === '同时拥有三层破夜明焰')?.value).toBe(0);
}, 60_000);
