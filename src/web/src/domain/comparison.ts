import type { RunSnapshot } from './run';
import { canonical } from './editor';
export function delta(before: number, after: number) { return { value: after - before, percent: before === 0 ? null : (after - before) / Math.abs(before) * 100 }; }
export interface Difference { path: string; before: string; after: string }
export function configurationDiff(before: unknown, after: unknown, path = ''): Difference[] {
  if (canonical(before) === canonical(after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().flatMap(key => configurationDiff(a[key], b[key], path ? `${path}.${key}` : key));
  }
  const describe = (value: unknown) => value === undefined ? '未设置' : typeof value === 'object' ? canonical(value) : String(value);
  return [{ path, before: describe(before), after: describe(after) }];
}
export function compareRuns(a: RunSnapshot, b: RunSnapshot) {
  const characters = [...new Set([...a.result.loadouts, ...b.result.loadouts].map(actor => actor.loadout.character))];
  return {
    damage: delta(a.result.totalDamage, b.result.totalDamage), dps: delta(a.result.dps, b.result.dps),
    differences: [...configurationDiff(a.input, b.input), ...configurationDiff(a.result.versions, b.result.versions, 'versions')],
    actors: characters.map(character => {
      const left = a.result.loadouts.find(actor => actor.loadout.character === character), right = b.result.loadouts.find(actor => actor.loadout.character === character);
      const aDamage = left ? a.result.damageByActor[left.loadout.id] : 0, bDamage = right ? b.result.damageByActor[right.loadout.id] : 0;
      return { character, aDamage, bDamage, damage: delta(aDamage, bDamage), aEnergy: left ? a.result.finalEnergy[left.loadout.id] : null, bEnergy: right ? b.result.finalEnergy[right.loadout.id] : null };
    }),
  };
}
