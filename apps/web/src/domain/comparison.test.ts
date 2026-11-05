import { beforeEach, describe, it, expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { simulateTeam } from '@leyline/engine';
import { teamSchema } from '@leyline/schema';
import example from '../../../../fixtures/scenarios/first-team.json';
import { compareRuns, configurationDiff, delta } from './comparison';
import { useComparisonStore } from '../stores/comparison';
describe('run comparisons', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('owns pinned snapshots even when source inputs and results change', () => {
    const input = teamSchema.parse(example), result = simulateTeam(input), store = useComparisonStore();
    store.pin('a', { input, result }); const original = result.totalDamage;
    input.seed = 25; result.totalDamage = 0;
    expect(store.a?.input.seed).toBe(1); expect(store.a?.result.totalDamage).toBe(original);
    store.pin('b', { input, result }); expect(store.comparison?.damage.value).toBe(-original);
    store.clear(); expect(store.a).toBeUndefined(); expect(store.b).toBeUndefined();
  });
  it('matches characters across different slot IDs and reports zero baselines safely', () => {
    const input = teamSchema.parse(example), result = simulateTeam(input);
    const other = JSON.parse(JSON.stringify({ input, result }));
    const actor = other.result.loadouts[0], oldId = actor.loadout.id; actor.loadout.id = 'new-slot';
    other.result.damageByActor['new-slot'] = other.result.damageByActor[oldId];
    other.result.finalEnergy['new-slot'] = other.result.finalEnergy[oldId];
    expect(compareRuns({ input, result }, other).actors.every(actor => actor.damage.value === 0)).toBe(true);
    expect(delta(0, 100)).toEqual({ value: 100, percent: null });
  });
  it('distinguishes target, order, seed and version differences', () => {
    expect(configurationDiff({ seed: 1, enemy: { level: 90 } }, { enemy: { level: 100 }, seed: 2 }).map(diff => diff.path)).toEqual(['enemy.level', 'seed']);
    expect(configurationDiff({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
    expect(configurationDiff([1,2], [2,1])).toHaveLength(2);
  });
});
