import * as engine from '@leyline/engine';
import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import {
  auditEquipmentHealing, equipmentHealingCharacterIds, equipmentHealingSetIds, equipmentHealingWeaponIds,
} from '../../../../tools/lib/equipment-healing-audit.mjs';

it('checks equipment healing, recovery totals and direct energy against fixed clauses and independent attributes', async () => {
  const [characters, weapons, sets] = await Promise.all([
    Promise.all(equipmentHealingCharacterIds.map(getCharacter)),
    Promise.all(equipmentHealingWeaponIds.map(getWeapon)),
    Promise.all(equipmentHealingSetIds.map(getArtifactSet)),
  ]);
  const result = auditEquipmentHealing({ characters, weapons, sets }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    'otherworldlystory/buffs/0/modifiers/0', 'recurvebow/buffs/0/modifiers/0', 'travelershandysword/buffs/0/modifiers/0',
    'whiteirongreatsword/buffs/0/modifiers/0', 'prototypeamber/buffs/0/modifiers/0', 'prototypeamber/buffs/0/modifiers/1',
    'travelingdoctor/effects/0/buffs/0/modifiers/0', 'travelingdoctor/effects/1/buffs/0/modifiers/0', 'adventurer/effects/0/buffs/0/modifiers/0',
    'adventurer/effects/1/buffs/0/modifiers/0', 'adventurer/effects/1/buffs/1/modifiers/0',
  ]));
  const amber = result.rows.filter(row => row.entity === 'prototypeamber' && row.refinement === 3 && row.probe === '持有者施疗／队员受疗');
  expect(amber.filter(row => row.unit === 'energy').map(row => row.value)).toEqual([5, 0, 0]);
  const heal = amber.filter(row => row.unit === 'hp');
  expect(heal.map(row => row.recipient)).toEqual(['actor', 'peer', 'other']);
  expect(new Set(heal.map(row => row.value)).size).toBe(3);
  expect(result.rows.filter(row => row.probe === '受益者生命上限未知').every(row => row.state === 'unknown')).toBe(true);
  for (const [attribute, label, amberHp, jeanHp] of [
    ['equipmentBaseHealingTotal', '完成5秒回复', 537.97746, 2281.4792364],
    ['equipmentBaseHealingTick', '1秒间隔的一次回复', 107.595492, 456.29584728],
  ] as const) {
    const recovery = result.rows.filter(row => row.entity === 'adventurer' && row.attribute === attribute);
    const confirmed = recovery.filter(row => row.recipient === 'actor' && row.probe.endsWith('／等级1／' + label));
    expect(confirmed.slice(0, 4).map(row => row.value)).toEqual([0, 0, 0, 0]);
    expect(confirmed[4].value).toBeCloseTo(amberHp, 8);
    expect(confirmed[5].value).toBeCloseTo(amberHp, 8);
    expect(recovery.find(row => row.recipient === 'actor' && row.probe === '4件／等级40／' + label)?.value).toBeCloseTo(jeanHp, 8);
    expect(recovery).toContainEqual(expect.objectContaining({ probe: '4件／等级1／回复条件未填写', state: 'unknown' }));
  }
  expect(result.gaps).toContainEqual(expect.objectContaining({ entity: 'adventurer', field: '/effects/1/support/mechanisms/2', pieces: 4 }));
}, 30_000);
