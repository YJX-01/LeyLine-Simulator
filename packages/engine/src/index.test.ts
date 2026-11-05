import { describe, expect, it } from 'vitest';
import { calculateAttack } from './index';

const input = { schemaVersion: 1, attack: 1000, multiplier: 2, damageBonus: 0.5,
  critRate: 0.5, critDamage: 1, mode: 'expected' } as const;
describe('single attack formula sandbox', () => {
  it('matches a manually calculated expectation', () => {
    const result = calculateAttack(input);
    expect(result.baseDamage).toBe(2000);
    expect(result.damage).toBe(4500);
  });
  it('handles forced critical and noncritical hits', () => {
    expect(calculateAttack({ ...input, mode: 'critical' }).damage).toBe(6000);
    expect(calculateAttack({ ...input, mode: 'noncritical' }).damage).toBe(3000);
  });
  it('does not leak state between runs', () => {
    const first = calculateAttack(input);
    calculateAttack({ ...input, attack: 0 });
    expect(calculateAttack(input)).toEqual(first);
  });
  it.each([{ critRate: 1.1 }, { attack: -1 }, { multiplier: Infinity }, { schemaVersion: 2 }])(
    'rejects invalid configuration %o', (invalid) => {
      expect(() => calculateAttack({ ...input, ...invalid })).toThrow();
    });
});
