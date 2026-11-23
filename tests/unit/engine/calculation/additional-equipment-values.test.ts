import * as engine from '@leyline/engine';
import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditAdditionalEquipment } from '../../../../tools/lib/additional-equipment-values.mjs';

it('matches the pinned equipment values across refinements, recipients and hit conditions', async () => {
  const weaponIds = [
    'aquilafavonia', 'athameartis', 'dullblade', 'endoftheline', 'everlastingmoonglow', 'exaiphanesblade', 'eyeofperception', 'hunterspath',
    'kagotsurubeisshin', 'kingssquire', 'lightoffoliarincision', 'luxurioussealord', 'primordialjadecutter', 'redhornstonethresher',
    'royalbow', 'royalgreatsword', 'royalgrimoire', 'royallongsword', 'royalspear', 'scionoftheblazingsun', 'skywardatlas',
    'skywardblade', 'skywardharp', 'skywardpride', 'skywardspine', 'staffofhoma', 'sturdybone', 'whitelakefrostfeather',
  ];
  const setIds = ['echoesofanoffering', 'emblemofseveredfate', 'noblesseoblige', 'paleflame'];
  const [characters, weapons, sets] = await Promise.all([
    Promise.all(['aether-anemo', 'amber', 'kaeya', 'lisa', 'noelle', 'xiangling'].map(getCharacter)),
    Promise.all(weaponIds.map(getWeapon)),
    Promise.all(setIds.map(getArtifactSet)),
  ]);
  const { rows, verified } = auditAdditionalEquipment({ characters, weapons, sets }, engine);

  const failures = rows.filter(row => row.issue);
  expect([...new Map(failures.map(row => [row.entity + row.field, row])).values()]).toEqual([]);
  expect(verified).toEqual(new Set([
    ...weaponIds.filter(id => id !== 'dullblade').map(id => id + '/buffs'),
    ...setIds.map(id => id + '/effects/1'),
    'noblesseoblige/effects/0',
  ]));
}, 30_000);
