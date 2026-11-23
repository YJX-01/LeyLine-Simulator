import * as engine from '@leyline/engine';
import { expect, it } from 'vitest';
import { auditMityaSteadyCore, mityaSteadyCoreCharacterIds, mityaSteadyCoreWeaponIds } from '../../../../tools/lib/mitya-steady-core.mjs';
import { createRuntimeCatalog } from '../../../../tools/lib/runtime-catalog.mjs';

it('scales the steady-core skill base of the four eligible hits and preserves the other reaction stages', async () => {
  const catalog = await createRuntimeCatalog();
  const result = auditMityaSteadyCore({
    characters: await Promise.all(mityaSteadyCoreCharacterIds.map(id => catalog.get('characters', id))),
    weapons: await Promise.all(mityaSteadyCoreWeaponIds.map(id => catalog.get('weapons', id))),
  }, engine);

  expect(result.rows.filter(row => row.issue).map(({ sources, diagnostics, ...row }) => ({ ...row,
    diagnostics: diagnostics?.filter(issue => issue.severity === 'error').map(issue => issue.message),
  }))).toEqual([]);
  expect(result.verified).toContain('mitya/constellations/5/buffs/1');
  const modifierRows = result.rows.filter(row => row.pointer === '/constellations/5/buffs/1/modifiers/0' && row.output === 'attribute.baseMultiplier');
  expect(new Set(modifierRows.map(row => row.value))).toEqual(new Set([1, 1.15]));
  expect(new Set(result.rows.filter(row => row.multiplier === 1.15).map(row => row.probe.hitId))).toEqual(new Set([
    'mitya.skill.param3', 'mitya.skill.param4', 'mitya.skill.param5', 'mitya.c4.beacon-consumption',
  ]));
  expect(result.rows.find(row => row.probe.rank === 6 && row.probe.hitId === 'mitya.c4.beacon-consumption' && row.probe.mode === 'overload'))
    .toMatchObject({ status: 'known', multiplier: 1, elevation: 1.2 });
  expect(result.rows.find(row => row.probe.rank === 6 && row.probe.dealerId === 'sandrone'))
    .toMatchObject({ status: 'known', multiplier: 1, elevation: 1.2 });
  const withFlat = result.rows.find(row => row.output === 'damage' && row.probe.rank === 6 && row.sources.some(source => source.includes('valeriy/combat1/param8')));
  expect(withFlat).toMatchObject({ status: 'known', multiplier: 1.15, elevation: 1.2 });
  expect(result.rows.find(row => row.probe.overlapping)).toMatchObject({ status: 'unknown', value: null });
  expect(result.gaps[0]?.reason).toContain('34%');
}, 90_000);
