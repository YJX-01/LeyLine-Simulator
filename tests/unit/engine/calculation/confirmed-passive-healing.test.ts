import * as engine from '@leyline/engine';
import { expect, it } from 'vitest';
import {
  auditConfirmedPassiveHealing, confirmedPassiveHealingIds, confirmedPassiveHealingSupportIds,
  confirmedPassiveHealingSetIds, confirmedPassiveHealingWeaponIds,
} from '../../../../tools/lib/confirmed-passive-healing-audit.mjs';
import { createRuntimeCatalog } from '../../../../tools/lib/runtime-catalog.mjs';

it('verifies passive and constellation heals with independent captured amounts and recipient gates', async () => {
  const catalog = await createRuntimeCatalog();
  const characters = [...new Set([...confirmedPassiveHealingIds, ...confirmedPassiveHealingSupportIds,
    'barbara', 'columbina', 'dahlia', 'lynette', 'qiqi'])];
  const weapons = ['dullblade', 'beginnersprotector', 'apprenticesnotes', 'huntersbow', 'wastergreatsword', ...confirmedPassiveHealingWeaponIds];
  const result = await auditConfirmedPassiveHealing({
    characters: await Promise.all(characters.map(id => catalog.get('characters', id))),
    weapons: await Promise.all(weapons.map(id => catalog.get('weapons', id))),
    sets: await Promise.all(confirmedPassiveHealingSetIds.map(id => catalog.get('sets', id))),
  }, engine);

  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified.size).toBe(result.summary.confirmedPassiveHealingClauses);
  expect(result.summary.confirmedPassiveHealingClauses).toBeGreaterThan(25);
  for (const entity of ['aether-hydro', 'lumine-hydro', 'furina']) {
    const field = entity === 'furina' ? '/passives/0' : '/constellations/5';
    const readings = result.rows.filter(row => row.entity === entity && row.field === field && row.actualStatus === 'applied');
    const self = readings.find(row => row.scenario === '施救者也受益');
    const peer = readings.find(row => row.scenario === '有效治疗');
    expect(self?.actual).toBeGreaterThan(0);
    expect(peer?.actual).toBeGreaterThan(0);
    expect(self?.actual).not.toEqual(peer?.actual);
  }
  expect(result.rows.filter(row => row.entity === 'xianyun' && row.scenario === '有效治疗')
    .map(row => row.actualStatus)).toEqual(['applied', 'applied', 'applied']);
  expect(result.gaps.filter(gap => gap.kind === '复苏').map(gap => gap.entity)).toEqual(['barbara', 'columbina', 'dahlia', 'qiqi']);
}, 90_000);
