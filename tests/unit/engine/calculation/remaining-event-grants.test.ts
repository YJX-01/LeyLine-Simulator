import * as engine from '@leyline/engine';
import { expect, it } from 'vitest';
import { auditRemainingEventGrants, remainingEventGrantIds, remainingEventGrantSetIds } from '../../../../tools/lib/remaining-event-grants.mjs';
import { createRuntimeCatalog } from '../../../../tools/lib/runtime-catalog.mjs';

it('checks confirmed revival and event recovery against the fixed original rates and recipient conditions', async () => {
  const catalog = await createRuntimeCatalog();
  const weapons = ['dullblade', 'apprenticesnotes', 'beginnersprotector'];
  const result = await auditRemainingEventGrants({
    characters: await Promise.all(remainingEventGrantIds.map(id => catalog.get('characters', id))),
    weapons: await Promise.all(weapons.map(id => catalog.get('weapons', id))),
    sets: await Promise.all(remainingEventGrantSetIds.map(id => catalog.get('sets', id))),
  }, engine);

  expect(result.rows.filter(row => row.issue).map(row => [row.entity, row.probe?.title, row.expectedStatus, row.status, row.missing])).toEqual([]);
  expect(result.resolved.map(row => row.entity)).toEqual(['barbara', 'qiqi', 'dahlia', 'zhongli', 'lynette']);
  const revive = (entity: string, title: string) => result.rows.find(row => row.entity === entity && row.probe?.title === title);
  const barbara = revive('barbara', '本次确认')!.value!;
  expect(revive('barbara', '施救者治疗加成')?.value).toBeCloseTo(barbara * 1.15, 8);
  expect(revive('barbara', '受益者受治疗加成')?.value).toBeCloseTo(barbara * 1.2, 8);
  expect(revive('barbara', '两项治疗加成')?.value).toBeCloseTo(barbara * 1.35, 8);
  const qiqi = revive('qiqi', '本次确认')!.value!;
  expect(revive('qiqi', '施救者治疗加成')?.value).toBeCloseTo(qiqi * 1.15, 8);
  expect(revive('qiqi', '受益者受治疗加成')).toMatchObject({ status: 'unknown', value: null, base: qiqi });
  expect(revive('dahlia', '施救者治疗加成')?.status).toBe('unknown');
  expect(revive('dahlia', '受益者受治疗加成')?.status).toBe('unknown');
  expect(result.gaps.filter(row => row.status === 'needs-evidence').map(row => row.entity)).not.toContain('barbara');
  const capped = result.rows.find(row => row.entity === 'zhongli' && row.probe?.title === '超过受益者上限');
  const exact = result.rows.find(row => row.entity === 'zhongli' && row.probe?.title === '恰达受益者上限');
  expect(capped?.value).toBeGreaterThan(0);
  expect(capped?.value).toBeCloseTo(exact?.value ?? 0);
  expect(result.verified.has('lynette/passives/2/buffs/0/modifiers/0')).toBe(true);
  expect(result.rows.find(row => row.entity === 'lynette' && row.output === 'attribute.staminaRestored' && row.value === 25)).toBeDefined();
}, 90_000);
