import { describe, expect, it } from 'vitest';
import { simulateRotation } from './index';
import scenario from '../../../fixtures/scenarios/buff-boundary.json';
import expected from '../../../fixtures/expected/buff-boundary.json';

describe('synthetic action rotation', () => {
  it('matches the hand-calculated buff boundary fixture', () => {
    const result = simulateRotation(scenario);
    expect(result.totalDamage).toBe(expected.totalDamage);
    expect(result.dps).toBe(expected.dps);
    expect(result.events.filter(e => e.type === 'hit').map(e => e.calculation.damage)).toEqual(expected.hitDamage);
    expect(result.events.map(e => `${e.type}:${e.id}`)).toEqual(expected.eventOrder);
  });
  it('adds overlapping independent buffs and reads them at hit time', () => {
    const result = simulateRotation({ ...scenario, buffs: [
      ...scenario.buffs, { id: 'second', startMs: 500, durationMs: 1000, damageBonus: 0.25 },
    ] });
    const hits = result.events.filter(e => e.type === 'hit');
    expect(hits.map(e => e.calculation.damage)).toEqual([1000, 1750, 1750, 1250, 1000]);
    expect(hits[1].activeBuffIds).toEqual(['bonus', 'second']);
  });
  it('preserves action order at equal timestamps and isolates repeated runs', () => {
    const first = simulateRotation(scenario);
    const second = simulateRotation({ ...scenario, actions: [
      { id: 'a', timeMs: 500, multiplier: 1 }, { id: 'b', timeMs: 500, multiplier: 2 },
    ] });
    expect(second.events.filter(e => e.type === 'hit').map(e => e.id)).toEqual(['a', 'b']);
    expect(simulateRotation(scenario)).toEqual(first);
  });
  it('keeps a buff active through the horizon if expiry is later', () => {
    const result = simulateRotation({ ...scenario, buffs: [{ id: 'long', startMs: 0, durationMs: 3000, damageBonus: 1 }] });
    expect(result.totalDamage).toBe(10000);
    expect(result.events.some(e => e.type === 'buff-end')).toBe(false);
  });
  it.each([
    { durationMs: 0 },
    { actions: [] },
    { actions: [{ id: 'bad', timeMs: 2001, multiplier: 1 }] },
    { actions: [{ id: 'bad', timeMs: 0.5, multiplier: 1 }] },
    { buffs: [{ id: 'bad', startMs: 0, durationMs: 0, damageBonus: 1 }] },
    { actions: [scenario.actions[0], scenario.actions[0]] },
    { buffs: [scenario.buffs[0], scenario.buffs[0]] },
  ])('rejects invalid scenario %o', (invalid) => {
    expect(() => simulateRotation({ ...scenario, ...invalid })).toThrow();
  });
});
