import * as engine from '@leyline/engine';
import { expect, it } from 'vitest';
import { auditNatlanCurrentResources, natlanCurrentCharacterIds, natlanCurrentWeaponIds } from '../../../../tools/lib/natlan-current-resources.mjs';
import { createRuntimeCatalog } from '../../../../tools/lib/runtime-catalog.mjs';

it('evaluates the confirmed Natlan resource gains and separates the two sprint stamina increments', async () => {
  const catalog = await createRuntimeCatalog();
  const result = auditNatlanCurrentResources({
    characters: await Promise.all(natlanCurrentCharacterIds.map(id => catalog.get('characters', id))),
    weapons: await Promise.all(natlanCurrentWeaponIds.map(id => catalog.get('weapons', id))),
  }, engine);

  expect(result.rows.filter(row => row.issue).slice(0, 4)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    'ifa/passives/3/buffs/0/modifiers/0',
    'varesa/passives/3/buffs/0/modifiers/0',
    'varesa/passives/3/buffs/1/modifiers/0',
    'varesa/passives/3/buffs/1/modifiers/1',
  ]));
  const rows = result.rows.filter(row => row.value !== null && row.value > 0);
  const values = (output: string) => rows.filter(row => row.output === `attribute.${output}`)
    .map(row => [row.value, row.unit, row.probe.owner, row.probe.recipient]);
  expect(values('saurianBaseHealing')).toEqual([
    [expect.closeTo(109.631798784, 8), 'hp', 'actor', 'actor'],
    [expect.closeTo(8221.553115264, 8), 'hp', 'peer', 'peer'],
  ]);
  expect(values('foodPhlogistonRestored')).toEqual([[20, 'count', 'actor', 'actor'], [20, 'count', 'actor', 'peer'], [20, 'count', 'peer', 'peer']]);
  expect(values('sprintStartStaminaCostAdded')).toEqual([[6, 'stamina', 'actor', 'actor']]);
  expect(values('sprintSustainStaminaCostAdded')).toEqual([[6, 'staminaPerSecond', 'actor', 'actor']]);
  expect(result.rows.some(row => row.probe.label === '恰好40%生命' && row.value === 0)).toBe(true);
  expect(result.rows.some(row => row.probe.label === '食物使用归属未知' && row.status === 'unknown')).toBe(true);
}, 90_000);
