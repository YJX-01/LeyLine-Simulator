import * as engine from '@leyline/engine';
import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditEquipmentEnergyGrants, equipmentEnergyCharacterIds, equipmentEnergySetIds, equipmentEnergyWeaponIds } from '../../../../tools/lib/equipment-energy-grants.mjs';

it('matches confirmed equipment energy grants to the pinned game text and legal recipients', async () => {
  const starterWeapons = ['dullblade', 'huntersbow', 'apprenticesnotes', 'wastergreatsword', 'beginnersprotector'];
  const [characters, weapons, sets] = await Promise.all([
    Promise.all(equipmentEnergyCharacterIds.map(getCharacter)),
    Promise.all([...equipmentEnergyWeaponIds, ...starterWeapons].map(getWeapon)),
    Promise.all(equipmentEnergySetIds.map(getArtifactSet)),
  ]);
  const { rows, resolved, gaps, summary, verified } = auditEquipmentEnergyGrants({ characters, weapons, sets }, engine);
  expect(rows.filter(row => row.issue)).toEqual([]);
  expect(summary.equipmentEnergyClausesVerified).toBe(21);
  expect(resolved).toHaveLength(21);
  expect(gaps).toHaveLength(21);
  expect(verified.size).toBe(48);
  const values = (entity: string, label: string) => rows.filter(row => row.entity === entity && row.probe.label.startsWith(label)).map(row => row.value);
  expect(values('amenomakageuchi', '已消费层数')).toEqual([0, 24, 36, null]);
  expect(values('everlastingmoonglow', '合法精炼')).toEqual([0.6, 0.6, 0.6, 0.6, 0.6]);
  expect(values('exaiphanesblade', '非旅行者')).toEqual([0]);
  expect(values('exaiphanesblade', '荧的其他元素')).toEqual([3]);
  expect(values('kitaincrossspear', '扣能时当前能量 ')).toEqual([0, -1.5, -3, -3]);
  expect(values('kitaincrossspear', '每跳只计一次')).toEqual([3, 3.5, 4, 4.5, 5]);
  expect(values('scholar', '单手剑')).toEqual([0]);
  expect(values('theexile', '同时有两位装备者')).toEqual([2]);
}, 30_000);
