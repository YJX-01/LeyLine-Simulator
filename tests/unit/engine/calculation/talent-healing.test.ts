import * as engine from '@leyline/engine';
import { expect, it } from 'vitest';
import { createRuntimeCatalog } from '../../../../tools/lib/runtime-catalog.mjs';
import { auditTalentHealing } from '../../../../tools/lib/talent-healing-audit.mjs';

it('verifies seven single-heal detail fields against captured values and scoped facts', async () => {
  const result = await auditTalentHealing(await createRuntimeCatalog(), engine, undefined,
    ['arlecchino', 'barbara', 'clorinde', 'jahoda', 'sayu', 'yumemizukimizuki']);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  const fields = [
    'arlecchino/talents/2/details/1', 'barbara/talents/1/details/0', 'clorinde/talents/1/details/3',
    'jahoda/talents/2/details/3', 'jahoda/talents/2/details/4', 'sayu/talents/2/details/3', 'yumemizukimizuki/talents/2/details/2',
  ];
  expect(result.verified).toEqual(expect.arrayContaining(fields));
  for (const field of fields) {
    const rows = result.rows.filter(row => row.entity + row.field === field);
    expect(new Set(rows.map(row => row.actualStatus))).toEqual(new Set(['applied', 'excluded', 'unknown']));
  }
}, 30_000);
