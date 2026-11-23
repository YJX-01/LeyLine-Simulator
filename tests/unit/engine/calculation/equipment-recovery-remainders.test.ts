import * as engine from '@leyline/engine';
import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import {
  auditEquipmentRecoveryRemainders, equipmentRecoveryCharacterIds, equipmentRecoverySetIds, equipmentRecoveryWeaponIds,
} from '../../../../tools/lib/equipment-recovery-remainders.mjs';

it('verifies held-weapon recovery, the Mora pickup and the new Bell shield against fixed source records', async () => {
  const [characters, weapons, sets] = await Promise.all([
    Promise.all(equipmentRecoveryCharacterIds.map(getCharacter)),
    Promise.all(equipmentRecoveryWeaponIds.map(getWeapon)),
    Promise.all(equipmentRecoverySetIds.map(getArtifactSet)),
  ]);
  const { rows, verified, gaps } = auditEquipmentRecoveryRemainders({ characters, weapons, sets }, engine);
  expect(rows.filter(row => row.issue).map(({ entity, probe, recipient, refinement, pieces, expected, value, state }) =>
    ({ entity, probe, recipient, refinement, pieces, expected, value, state }))).toEqual([]);
  expect(verified).toEqual(new Set([
    'aquilafavonia/buffs/1/modifiers/0', 'luckydog/effects/1/buffs/0/modifiers/0', 'thebell/buffs/1/modifiers/0', 'thebell/buffs/0/modifiers/0',
  ]));
  const sword = weapons.find(weapon => weapon.id === 'aquilafavonia');
  expect(sword?.metadata.hits?.map(hit => [hit.id, hit.when])).toEqual([
    ['aquilafavonia.falcon', ['aquilafavonia.falconTriggered']],
  ]);
  expect(sword?.metadata.buffs?.[1]?.condition).toEqual({ fact: 'aquilafavonia.falconTriggered' });
  const restoration = rows.filter(row => row.entity === 'luckydog' && row.probe === '摩拉拾取');
  expect(restoration.map(row => [row.pieces, row.value])).toEqual([
    [0, 0], [0, 0], [1, 0], [1, 0], [2, 0], [2, 0], [3, 0], [3, 0], [4, 300], [4, 300], [5, 300], [5, 300],
  ]);
  expect(rows.filter(row => row.probe === '队友不受益').every(row => row.value === 0)).toBe(true);
  expect(rows.filter(row => row.probe === '本次排除').every(row => row.value === 0)).toBe(true);
  expect(rows.filter(row => row.entity === 'thebell' && row.probe === '已有其他护盾').map(row => row.value)).toEqual([0.12, 0.15, 0.18, 0.21, 0.24]);
  expect(rows.filter(row => row.entity === 'thebell' && row.probe === '已有其他盾但本次未触发钟剑').map(row => row.value)).toEqual([0, 0, 0, 0, 0]);
  expect(gaps.map(row => [row.entity, row.output])).toEqual([
    ['aquilafavonia', 'attribute.equipmentHealing'], ['luckydog', 'attribute.equipmentBaseHealingTick'], ['thebell', 'attribute.shieldAbsorption'],
  ]);
}, 30_000);
