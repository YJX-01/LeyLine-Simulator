import { describe, expect, it } from 'vitest';
import { ApplicationCooldown } from './icd';
import { ElementalGauge, amplification } from './elements';
import { EnergyPool } from './energy';
import { createRandom } from './random';

describe('standard elemental application cooldown', () => {
  it('applies on hits 1/4/7; count does not move the timer', () => {
    const icd = new ApplicationCooldown();
    expect([0, 100, 200, 300, 400, 500, 600].map(t => icd.allows('a', 'normal', t, 'standard')))
      .toEqual([true, false, false, true, false, false, true]);
    expect(icd.allows('a', 'normal', 2499, 'standard')).toBe(false);
    expect(icd.allows('a', 'normal', 2500, 'standard')).toBe(true);
    expect(icd.allows('a', 'normal', 2501, 'standard')).toBe(false);
  });
  it('separates actor/tag and bypasses no-ICD skills', () => {
    const icd = new ApplicationCooldown();
    expect(icd.allows('a', 'x', 0, 'standard')).toBe(true);
    expect(icd.allows('b', 'x', 0, 'standard')).toBe(true);
    expect(icd.allows('a', 'y', 0, 'standard')).toBe(true);
    expect(icd.allows('a', 'x', 1, 'none')).toBe(true);
    expect(icd.allows('a', 'x', 1, 'standard')).toBe(false);
  });
});

describe('first-batch elemental gauge and amplifying reactions', () => {
  it.each([1, 2, 4] as const)('taxes and decays %sU', gauge => {
    const state = new ElementalGauge();
    expect(state.apply('hydro', gauge, 0).aura?.units).toBe(gauge * 0.8);
    const duration = { 1: 9500, 2: 12000, 4: 17000 }[gauge];
    expect(state.advance(duration / 2)?.units).toBeCloseTo(gauge * 0.4);
    expect(state.advance(duration)).toBeNull();
  });
  it.each([
    ['pyro', 'hydro', 'vaporize', 2], ['hydro', 'pyro', 'reverse-vaporize', 1.5],
    ['cryo', 'pyro', 'melt', 2], ['pyro', 'cryo', 'reverse-melt', 1.5],
  ] as const)('handles %s -> %s', (aura, trigger, reaction, base) => {
    const state = new ElementalGauge();
    state.apply(aura, 1, 0);
    const result = state.apply(trigger, 1, 0);
    expect(result.reaction).toBe(reaction);
    expect(result.baseMultiplier).toBe(base);
    expect(result.aura?.units ?? 0).toBeCloseTo(base === 2 ? 0 : 0.3);
  });
  it('does not reapply leftover trigger; expired aura cannot react', () => {
    const state = new ElementalGauge();
    state.apply('pyro', 1, 0);
    expect(state.apply('hydro', 4, 0).aura).toBeNull();
    state.apply('pyro', 1, 1);
    expect(state.apply('hydro', 1, 9501).reaction).toBeUndefined();
  });
  it('keeps original hydro decay but updates stronger pyro refresh', () => {
    const hydro = new ElementalGauge();
    hydro.apply('hydro', 1, 0);
    expect(hydro.apply('hydro', 4, 1).aura?.decayPerMs).toBeCloseTo(0.8 / 9500);
    const pyro = new ElementalGauge();
    pyro.apply('pyro', 1, 0);
    expect(pyro.apply('pyro', 4, 1).aura?.decayPerMs).toBeCloseTo(3.2 / 17000);
  });
  it('fails explicitly on unsupported frozen combinations', () => {
    const state = new ElementalGauge();
    state.apply('hydro', 1, 0);
    expect(() => state.apply('cryo', 1, 1)).toThrow('Unsupported reaction');
  });
  it('applies elemental mastery and reaction bonus only to actual reactions', () => {
    expect(amplification(2, 1400, 0.1)).toBeCloseTo(4.98);
    expect(amplification(1, 1400, 0.1)).toBe(1);
  });
});

describe('party energy', () => {
  const actors = [
    { id: 'a', element: 'pyro' as const, capacity: 80, initial: 0 },
    { id: 'b', element: 'pyro' as const, capacity: 80, initial: 0 },
    { id: 'c', element: 'hydro' as const, capacity: 80, initial: 0 },
    { id: 'd', element: 'cryo' as const, capacity: 80, initial: 0 },
  ];
  it('uses color, background and recharge coefficients', () => {
    const energy = new EnergyPool(actors);
    energy.collect('pyro', 'particle', 2, 'a', () => 2);
    expect(energy.snapshot()).toEqual({ a: 12, b: 7.199999999999999, c: 2.4, d: 2.4 });
  });
  it('handles clear orbs, cap, overflow and flat energy without recharge', () => {
    const energy = new EnergyPool(actors);
    energy.collect('clear', 'orb', 1, 'c', () => 1);
    expect(energy.get('c')).toBe(6);
    expect(energy.get('a')).toBeCloseTo(3.6);
    expect(energy.add('c', 100)).toMatchObject({ after: 80, gained: 74, overflow: 26 });
    expect(energy.spend('c', 81)).toBe(false);
    expect(energy.get('c')).toBe(80);
    expect(energy.spend('c', 80)).toBe(true);
    expect(energy.get('c')).toBe(0);
  });
  it.each([2, 3, 4])('accounts for %s-member party size', count => {
    const energy = new EnergyPool(actors.slice(0, count));
    energy.collect('clear', 'particle', 1, 'a', () => 1);
    expect(energy.get('b')).toBeCloseTo(2 * (1 - count * 0.1));
  });
});

describe('seeded random source', () => {
  it('repeats across interleaved local generators', () => {
    const a = createRandom(42), b = createRandom(42), other = createRandom(1);
    const values = Array.from({ length: 20 }, () => { other(); return a(); });
    expect(values).toEqual(Array.from({ length: 20 }, b));
    expect(values.every(n => n >= 0 && n < 1)).toBe(true);
    expect(values).not.toEqual(Array.from({ length: 20 }, other));
  });
});
