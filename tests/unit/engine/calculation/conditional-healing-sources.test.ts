import * as engine from '@leyline/engine';
import { getArtifactSet, getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import {
  auditConditionalHealingSources, conditionalHealingCharacterIds, conditionalHealingSetIds, conditionalHealingWeaponIds,
} from '../../../../tools/lib/conditional-healing-sources.mjs';

it('checks ascension, recipient HP thresholds, mixed healing and each cursed weapon against fixed sources', async () => {
  const [characters, weapons, sets] = await Promise.all([
    Promise.all(conditionalHealingCharacterIds.map(getCharacter)),
    Promise.all(conditionalHealingWeaponIds.map(getWeapon)),
    Promise.all(conditionalHealingSetIds.map(getArtifactSet)),
  ]);
  const result = await auditConditionalHealingSources({ characters, weapons, sets }, engine);
  expect(result.rows.filter(row => row.issue).map(({ sources: _, ...row }) => row).slice(0, 5)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    'kukishinobu/talents/1/heals/0/extra',
    'vodyanitsa/talents/1/heals/0/multiplier',
    'prizedisshinblade/buffs/1/modifiers/0',
    'prizedisshinblade-01/hits/prizedisshinblade-01.curse',
    'prizedisshinblade-02/buffs/1/modifiers/0',
  ]));
  const shinobu = result.rows.filter(row => row.entity === 'kukishinobu' && row.ascension === 4 && row.elementalMastery === 36);
  expect(shinobu.find(row => row.recipient === 'ally' && row.ownerHp === .5)?.value).toBeGreaterThan(
    shinobu.find(row => row.recipient === 'ally' && row.ownerHp === .501)!.value!);
  const vodyanitsa = result.rows.filter(row => row.entity === 'vodyanitsa' && row.constellation === 4 && row.recipient === 'ally' && row.stacks === 0);
  const low = vodyanitsa.filter(row => row.recipientHp === .399);
  expect(low.map(({ outgoing, incoming, actualStatus }) => [outgoing, incoming, actualStatus])).toEqual([
    [0, 0, 'applied'], [.15, 0, 'applied'], [0, .2, 'applied'], [.15, .2, 'applied'],
  ]);
  const boundary = vodyanitsa.filter(row => row.recipientHp === .4);
  expect(boundary).toHaveLength(4);
  for (const [index, row] of low.entries()) {
    expect(row.value).toBeCloseTo(boundary[index].value! * 1.5, 8);
    expect(row.value).toBeCloseTo(low[0].value! * (1 + row.outgoing! + row.incoming!), 8);
  }
  expect(vodyanitsa.find(row => row.recipientHp === null)?.actualBase).toBeGreaterThan(0);
  expect(result.rows.filter(row => row.entity === 'prizedisshinblade-01').every(row => row.value === 0)).toBe(true);
}, 30_000);
