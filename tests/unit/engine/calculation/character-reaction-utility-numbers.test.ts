import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { characterReactionUtilityNumbers } from '../../../../tools/lib/character-reaction-utility-numbers.mjs';

it('certifies contributions by modifier, recipient, reaction family and window boundary', async () => {
  const entities = {
    characters: await Promise.all(['aino', 'ganyu', 'kaeya', 'ororon'].map(id => getCharacter(id))),
    weapons: await Promise.all(['wastergreatsword', 'huntersbow', 'dullblade'].map(id => getWeapon(id))),
  };
  const buffs = [
    { entity: 'aino', field: '/constellations/5/buffs/0/modifiers/0', id: 'aino.c6.field-reactions',
      target: 'attribute.reaction.transformative.damageBonus', role: 'team', listed: true },
    { entity: 'aino', field: '/constellations/5/buffs/0/modifiers/2', id: 'aino.c6.field-reactions',
      target: 'attribute.reaction.transformative.damageBonus', role: 'team', listed: true },
    { entity: 'ganyu', field: '/constellations/3/buffs/0/modifiers/0', id: 'ganyu.c4.celestial-shower-vulnerability',
      target: 'target.ordinaryDamageReduction', role: 'target', listed: true },
    { entity: 'ororon', field: '/passives/1/buffs/0/modifiers/1', id: 'ororon.directEnergy.p1',
      target: 'attribute.directEnergyRestored', role: 'owner', listed: true },
  ];
  const results = { calculator: { buffs } };
  const proofs = characterReactionUtilityNumbers(entities, results, engine);
  expect(proofs.map(({ modifier, expected }) => [modifier, expected])).toEqual([[0, .15], [2, .2], [0, -.05], [1, 3]]);
  const [, ainoFull, ganyu, ororon] = proofs;
  expect(ainoFull.cases).toEqual(expect.arrayContaining([
    expect.objectContaining({ actual: .2, settings: expect.objectContaining({ timeMs: 14999, recipient: 'kaeya' }) }),
    expect.objectContaining({ actual: 0, settings: expect.objectContaining({ timeMs: 15000, recipient: 'kaeya' }) }),
    expect.objectContaining({ actual: 0, settings: expect.objectContaining({ onField: 'aino', recipient: 'kaeya' }) }),
  ]));
  expect(ganyu.cases).toContainEqual(expect.objectContaining({ actual: -.25, expected: -.25 }));
  expect(ororon.cases).toEqual(expect.arrayContaining([
    expect.objectContaining({ actual: 3, settings: expect.objectContaining({ recipient: 'ororon', onField: 'kaeya' }) }),
    expect.objectContaining({ actual: 0, settings: expect.objectContaining({ recipient: 'kaeya', onField: 'kaeya' }) }),
  ]));
  expect(characterReactionUtilityNumbers(entities, { ...results, registeredModifierEvidence: proofs }, engine)).toEqual([]);
  expect(characterReactionUtilityNumbers(entities, { calculator: { buffs: [buffs[0], buffs[0]] } }, engine)).toEqual([]);
});
