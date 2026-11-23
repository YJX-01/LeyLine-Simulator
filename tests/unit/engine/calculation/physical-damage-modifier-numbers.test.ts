import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { physicalDamageModifierNumbers } from '../../../../tools/lib/physical-damage-modifier-numbers.mjs';

const buffs = [
  { entity: 'eula', field: '/constellations/0/buffs/0/modifiers/0', id: 'eula.c1.grimheart-physical', role: 'owner' },
  { entity: 'mika', field: '/passives/0/buffs/0/modifiers/0', id: 'mika.a0.detector-physical', role: 'team' },
  { entity: 'xinyan', field: '/passives/1/buffs/0/modifiers/0', id: 'xinyan.a1.sweeping-fervor-physical', role: 'team' },
].map(row => ({ ...row, target: 'attribute.physicalBonus', listed: true }));

async function content() {
  return {
    characters: await Promise.all(['eula', 'mika', 'xinyan', 'kaeya'].map(getCharacter)),
    weapons: await Promise.all(['wastergreatsword', 'beginnersprotector', 'dullblade'].map(getWeapon)),
  };
}

it('checks Eula’s supplied windows and Xinyan’s shielded recipient through real hit damage', async () => {
  const entities = await content();
  const proofs = physicalDamageModifierNumbers(entities, { calculator: { buffs } }, engine);
  expect(proofs.map(row => row.key)).toEqual(buffs.map(row => row.entity + row.field));
  const [eula, , xinyan] = proofs;
  expect(eula.cases.slice(0, 8).map(row => row.actual)).toEqual([0, .3, .3, 0, 0, .3, .3, 0]);
  expect(eula.cases[3].settings).toMatchObject({ window: { consumed: 1, startMs: 1_000, endMs: 13_000 }, timeMs: 13_000 });
  expect(eula.cases[7].settings).toMatchObject({ window: { consumed: 2, startMs: 1_000, endMs: 19_000 }, timeMs: 19_000 });
  expect(eula.cases.slice(8).map(row => row.actual)).toEqual([0, 0, 0, 0]);
  expect(xinyan.cases.map(row => row.actual)).toEqual([.15, .15, 0, 0, 0]);
  expect(xinyan.cases[0].settings).toMatchObject({ supplier: 'xinyan', recipient: 'kaeya', hit: 'kaeya.normal.param1' });
  expect(xinyan.cases[2].settings).toMatchObject({ recipientFacts: { 'xinyan.sweepingFervorShield': false, shielded: true } });
}, 15_000);

it('checks Mika’s 3, 4 and 5 stack ceilings using the supplying build', async () => {
  const entities = await content();
  const [proof] = physicalDamageModifierNumbers(entities, { calculator: { buffs: [buffs[1]] } }, engine);
  expect(proof?.id).toBe('mika.a0.detector-physical');
  expect(proof.cases.map(row => Math.round(row.actual * 100))).toEqual([
    0, 10, 30, 30, 30,
    0, 10, 30, 40, 40,
    0, 10, 30, 40, 40,
    0, 10, 30, 40, 50,
    10, 30, 0, 0, 0, 0,
  ]);
  expect(proof.cases[19].settings).toMatchObject({ recipient: 'kaeya', ascension: 4, constellation: 6,
    recipientFacts: { 'mika.detectorStacks': 5, 'mika.soulwindActive': true } });
  expect(proof.cases[21].settings).toMatchObject({ recipientAscension: 4, recipientConstellation: 6, ascension: 1, constellation: 0 });
}, 15_000);

it('requires each exact listed modifier, an unclaimed proof and its retained hit dependency', async () => {
  const entities = await content();
  const [eula, mika, xinyan] = buffs;
  expect(physicalDamageModifierNumbers(entities, {
    calculator: { buffs: [eula, eula, { ...mika, role: 'owner' }, xinyan] },
    registeredModifierEvidence: [{ key: xinyan.entity + xinyan.field }],
  }, engine)).toEqual([]);
  expect(physicalDamageModifierNumbers(entities, { calculator: { buffs: [xinyan] } }, {
    ...engine,
    evaluateStructuredHit(...args) {
      const reading = engine.evaluateStructuredHit(...args);
      const detached = new Set(reading.trace.filter(node => node.kind === 'effect' && node.definition.id === xinyan.id).map(node => node.id));
      return { ...reading, trace: reading.trace.map(node => ({ ...node, dependencies: node.dependencies.filter(id => !detached.has(id)) })) };
    },
  })).toEqual([]);
}, 15_000);
