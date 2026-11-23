import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditYanfeiSealStamina } from '../../../../tools/lib/yanfei-seal-stamina.mjs';

it('calculates the selected Yanfei charged stamina cost and keeps held seals separate', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(['yanfei', 'sucrose', 'xianyun', 'mona'].map(getCharacter)),
    Promise.all(['apprenticesnotes'].map(getWeapon)),
  ]);
  const result = auditYanfeiSealStamina({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified.size).toBe(12);
  expect(result.resolved).toHaveLength(3);
  expect(result.gaps).toHaveLength(1);

  const costs = result.rows.filter(row => row.output === 'attribute.chargedAttackStaminaCost');
  for (const [constellation, expected] of [[0, [50, 42.5, 35, 27.5]], [1, [50, 37.5, 25, 12.5]], [6, [50, 37.5, 25, 12.5, 0]]] as const) {
    expected.forEach((cost, index) => expect(costs.find(row => row.probe.label === `${constellation}命、${index}枚印`)?.value).toBeCloseTo(cost, 10));
  }
  expect(costs.find(row => row.probe.resonance)?.value).toBeCloseTo(17.5, 10);
}, 60_000);
