import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { characterResistanceBonusProofs } from '../../../../tools/lib/character-resistance-bonus-proofs.mjs';

it('certifies the C6 cast bonus for sword, bow and catalyst recipients inside Inspiration Field', async () => {
  const entities = {
    characters: await Promise.all(['bennett', 'kaeya', 'klee', 'amber'].map(id => getCharacter(id))),
    weapons: await Promise.all(['dullblade', 'apprenticesnotes', 'huntersbow'].map(id => getWeapon(id))),
  };
  const listed = {
    entity: 'bennett',
    field: '/constellations/5/buffs/0/modifiers/0',
    id: 'bennett.c6.inspiration-pyro',
    target: 'attribute.pyroBonus',
    role: 'team',
    listed: true,
  };
  const results = { calculator: { buffs: [listed] } };
  const proofs = characterResistanceBonusProofs(entities, results, engine);
  expect(proofs).toHaveLength(1);
  expect(proofs[0]).toMatchObject({ id: listed.id, field: listed.field, modifier: 0, target: listed.target, expected: .15 });
  const cases = proofs[0].cases;
  expect(cases.filter(row => row.expected > 0).map(row => row.settings)).toEqual(
    ['kaeya', 'klee', 'amber'].map(recipient => expect.objectContaining({ recipient, values: { 'bennett.inField': true } })),
  );
  for (const row of cases.filter(row => row.expected > 0)) expect(row.actual).toBeCloseTo(.15, 8);
  expect(cases.filter(row => row.expected === 0).map(row => row.actual)).toEqual([0, 0, 0, 0]);
  expect(characterResistanceBonusProofs(entities, { ...results, registeredModifierEvidence: proofs }, engine)).toEqual([]);
  expect(characterResistanceBonusProofs(entities, { calculator: { buffs: [listed, listed] } }, engine)).toEqual([]);
});

it('uses one Escoffier grant for all four party counts and both resistances', async () => {
  const entities = {
    characters: await Promise.all(['escoffier', 'barbara', 'kaeya', 'mona', 'amber'].map(id => getCharacter(id))),
    weapons: await Promise.all(['beginnersprotector', 'apprenticesnotes', 'dullblade', 'huntersbow'].map(id => getWeapon(id))),
  };
  const buff = entities.characters[0].metadata.passives[1].buffs;
  expect(buff?.map(row => row.id)).toEqual(['escoffier.a1.pairing-shred']);
  const buffs = ['cryo', 'hydro'].map((element, index) => ({
    entity: 'escoffier',
    field: '/passives/1/buffs/0/modifiers/' + index,
    id: 'escoffier.a1.pairing-shred',
    target: 'target.resistance.' + element,
    role: 'target',
    listed: true,
  }));
  const proofs = characterResistanceBonusProofs(entities, { calculator: { buffs } }, engine);
  expect(proofs.map(row => row.target)).toEqual(buffs.map(row => row.target));
  for (const proof of proofs) {
    const values = [...new Set(proof.cases.map(row => row.expected))].sort((a, b) => a - b);
    expect(values).toEqual([-.55, -.15, -.1, -.05, 0]);
    for (const row of proof.cases) expect(row.actual).toBeCloseTo(row.expected, 8);
  }
});
