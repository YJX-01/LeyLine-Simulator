import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import example from '../../../../fixtures/scenarios/first-team.json';
import { usePlansStore } from './plans';
import { readPlans, plansKey, type StoragePort } from '../domain/plans';

function memory(): StoragePort {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}
describe('local plan persistence', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('round trips a validated independent copy and renames/deletes it', () => {
    const port = memory(), store = usePlansStore(); store.initialize(port);
    expect(store.save('四人循环', JSON.stringify(example))).toBe(true);
    const plan = store.plans[0];
    expect(store.rename(plan.id, '两轮')).toBe(true);
    expect(readPlans(port)[0].name).toBe('两轮');
    expect(readPlans(port)[0].input.commands).toEqual(example.commands);
    expect(store.remove(plan.id)).toBe(true);
    expect(readPlans(port)).toEqual([]);
  });
  it('preserves corrupt storage rather than overwriting it on save', () => {
    const port = memory(); port.setItem(plansKey, '{broken');
    const store = usePlansStore(); store.initialize(port);
    expect(store.save('test', JSON.stringify(example))).toBe(false);
    expect(port.getItem(plansKey)).toBe('{broken');
  });
  it('does not claim success or mutate memory when storage quota is exhausted', () => {
    const store = usePlansStore();
    store.initialize({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
    expect(store.save('test', JSON.stringify(example))).toBe(false);
    expect(store.plans).toHaveLength(0);
    expect(store.error).toBe('quota');
  });
  it('rejects invalid and future inputs without replacing saved plans', () => {
    const store = usePlansStore(); store.initialize(memory());
    expect(store.save('valid', JSON.stringify(example))).toBe(true);
    expect(store.save('future', JSON.stringify({ ...example, schemaVersion: 99 }))).toBe(false);
    expect(store.save('broken', '{')).toBe(false);
    expect(store.plans).toHaveLength(1);
  });
  it('rejects duplicate IDs and unknown library versions', () => {
    const port = memory(), plan = { id: 'same', name: 'one', input: example };
    port.setItem(plansKey, JSON.stringify({ version: 1, plans: [plan, plan] }));
    expect(() => readPlans(port)).toThrow();
    port.setItem(plansKey, JSON.stringify({ version: 2, plans: [] }));
    expect(() => readPlans(port)).toThrow();
  });
});
