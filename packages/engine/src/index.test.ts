import { describe, expect, it } from 'vitest';
import { calculateAttack } from './index';

const input = { schemaVersion: 1, attack: 1000, multiplier: 2, damageBonus: 0.5,
  critRate: 0.5, critDamage: 1, mode: 'expected' } as const;
describe('single attack formula sandbox', () => {
  const enemy = { characterLevel: 90, enemyLevel: 90, resistance: 0.1, defenseReduction: 0, defenseIgnore: 0 };
  it('applies equal-level defense and 10% resistance', () => {
    const result = calculateAttack({ ...input, enemy });
    expect(result.defenseMultiplier).toBe(0.5);
    expect(result.resistanceMultiplier).toBe(0.9);
    expect(result.damage).toBe(2025);
  });
  it.each([[-0.2, 1.1], [0, 1], [0.75, 0.25], [1, 0.2]])('handles resistance %s', (resistance, expected) => {
    expect(calculateAttack({ ...input, enemy: { ...enemy, resistance } }).resistanceMultiplier).toBeCloseTo(expected);
  });
  it('combines defense reduction and ignore multiplicatively', () => {
    const result = calculateAttack({ ...input, enemy: { ...enemy, defenseReduction: 0.5, defenseIgnore: 0.5 } });
    expect(result.defenseMultiplier).toBeCloseTo(0.8);
    expect(calculateAttack({ ...input, enemy: { ...enemy, defenseIgnore: 1 } }).defenseMultiplier).toBe(1);
  });
  it.each([{ characterLevel: 0 }, { enemyLevel: 1.5 }, { defenseReduction: 1.01 }, { resistance: NaN }])('rejects invalid enemy %o', (invalid) => {
    expect(() => calculateAttack({ ...input, enemy: { ...enemy, ...invalid } })).toThrow();
  });
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
