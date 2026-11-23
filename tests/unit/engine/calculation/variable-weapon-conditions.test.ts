import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditVariableWeaponConditions } from '../../../../tools/lib/variable-weapon-conditions.mjs';

it('checks the original quest and movement formulas and their current equipment scopes', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(['kaeya', 'noelle'].map(getCharacter)),
    Promise.all(['dullblade', 'wastergreatsword', 'hereticsmoltenblade', 'ultimateoverlordsmegamagicsword'].map(getWeapon)),
  ]);
  const result = auditVariableWeaponConditions({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.gaps).toEqual([]);
  expect(result.verified).toEqual(new Set(result.resolved.map(({ entity, field }) => entity + field)));
  expect(result.resolved).toHaveLength(2);
  for (const { entity, field, output } of result.resolved) {
    const rows = result.rows.filter(row => row.entity === entity);
    expect(field).toBe('/buffs/2/modifiers/0');
    expect(output).toBe('attribute.attackPercent');
    expect(new Set(rows.map(row => row.rank))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(rows.some(row => row.total === null)).toBe(true);
    expect(rows.filter(row => row.recipient === 'peer').map(row => row.total)).toEqual([0, 0, 0, 0, 0]);
    expect(rows.filter(row => row.repeat).map(row => row.effects.length)).toEqual([1, 1, 1, 1, 1]);
  }
  const sword = result.rows.filter(row => row.entity === 'hereticsmoltenblade' && row.state === '按上一秒移动距离');
  expect(sword.find(row => row.rank === 1 && row.input === 3.5)?.value).toBeCloseTo(0.27, 10);
  expect(sword.find(row => row.rank === 5 && row.input === 7)?.value).toBeCloseTo(0.72, 10);
  expect(sword.find(row => row.rank === 5 && !row.onField)?.value).toBe(0);
  const claymore = result.rows.filter(row => row.entity === 'ultimateoverlordsmegamagicsword' && row.state === '按任务进度');
  expect(claymore.find(row => row.rank === 1 && row.input === 3)?.total).toBeCloseTo(0.18, 10);
  expect(claymore.find(row => row.rank === 5 && row.input === 12)?.total).toBeCloseTo(0.48, 10);
  expect(claymore.find(row => row.rank === 5 && !row.onField)?.value).toBeCloseTo(0.12, 10);
});
