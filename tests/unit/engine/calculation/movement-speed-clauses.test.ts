import * as engine from '@leyline/engine';
import { expect, it } from 'vitest';
import { auditMovementSpeedClauses, movementSpeedClauseIds } from '../../../../tools/lib/movement-speed-clauses.mjs';
import { createRuntimeCatalog } from '../../../../tools/lib/runtime-catalog.mjs';

it('evaluates party movement and stamina modifiers under the current movement, scene and event conditions', async () => {
  const catalog = await createRuntimeCatalog();
  const result = auditMovementSpeedClauses({
    characters: await Promise.all([...movementSpeedClauseIds, 'noelle'].map(id => catalog.get('characters', id))),
    weapons: await Promise.all(['dullblade', 'apprenticesnotes', 'wastergreatsword', 'huntersbow', 'beginnersprotector'].map(id => catalog.get('weapons', id))),
  }, engine);

  expect(result.rows.filter(row => row.issue).slice(0, 4)).toEqual([]);
  expect(result.verified.size).toBe(13);
  expect(result.resolved).toHaveLength(12);
  expect(result.gaps.map(row => [row.entity, row.field])).toEqual([['kinich', '/passives/3']]);
  const values = (effect: string, name: string) => result.rows.filter(row => row.effect === effect && row.probe.label === name).map(row => row.actual);
  expect(values('dahlia.swift-stride', '游戏时间第360分钟')).toEqual([0.1]);
  expect(values('rosaria.swift-stride', '游戏时间第360分钟')).toEqual([0]);
  expect(values('rosaria.swift-stride', '游戏时间第1080分钟')).toEqual([0.1]);
  expect(values('dahlia.swift-stride', '多个同时间迅行与千织合计一次')).toEqual([0.1]);
  expect(values('diona.a1.icy-paws.1', '只受另一护盾保护')).toEqual([0]);
  expect(values('diona.a1.icy-paws.1', '通用体力降低计入 glide')).toEqual([0.1]);
  expect(values('xianyun.glide-speed', '滑翔专用速度独立于通用速度')).toEqual([0]);
  expect(values('xianyun.glide-speed', '两个滑翔天赋与水下冲刺在场')).toEqual([0.15]);
  expect(values('kinich.special-gathering-speed', '采集时超出距离')).toEqual([0]);
  expect(values('kinich.special-gathering-speed', '第一段过期而刷新段仍存在')).toEqual([0.15]);
  expect(values('kinich.c1.swing-landing-speed', '队友同一时段不获本人落地加速')).toEqual([0]);
}, 90_000);
