import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditConfirmedEnergyCases } from '../../../../tools/lib/confirmed-energy-cases.mjs';

it('resolves explicitly confirmed equipment and character energy grants against independent sources', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(['barbara', 'kaeya', 'ineffa', 'razor'].map(getCharacter)),
    Promise.all(['apprenticesnotes', 'beyondthechrysalis', 'dullblade', 'beginnersprotector', 'wastergreatsword'].map(getWeapon)),
  ]);
  const result = auditConfirmedEnergyCases({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.summary.confirmedEnergyClausesVerified).toBe(3);
  expect(result.verified).toEqual(new Set([
    'beyondthechrysalis/buffs/2', 'beyondthechrysalis/buffs/2/modifiers/0',
    'ineffa/constellations/3/buffs/0', 'ineffa/constellations/3/buffs/0/modifiers/0',
    'razor/talents/2/buffs/2', 'razor/talents/2/buffs/2/modifiers/0',
  ]));
  expect(result.gaps.map(({ entity, field }) => entity + field)).toEqual([
    'beyondthechrysalis/buffs', 'ineffa/constellations/3', 'razor/talents/2',
  ]);
  expect(result.rows.filter(row => row.entity === 'beyondthechrysalis' && row.probe.label === '持有者本次丰获之风').map(row => row.value))
    .toEqual([5, 5.5, 6, 6.5, 7]);
  expect(result.rows.filter(row => row.entity === 'ineffa' && row.probe.triggerActor === 'peer').map(row => row.value)).toEqual([5, 5, 0]);
  expect(result.rows.filter(row => row.entity === 'razor' && row.probe.label.startsWith('退场时已扣减')).map(row => row.value))
    .toEqual([10, 8, 6, 4, 2, 0]);
  expect(result.rows.every(row => row.output === 'attribute.directEnergyRestored' && row.sources.length > 0)).toBe(true);
}, 30000);
