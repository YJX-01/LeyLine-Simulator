import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { characterDamageModifierNumbers } from '../../../../tools/lib/character-damage-modifier-numbers.mjs';

async function content(characters: string[], weapons: string[]) {
  return {
    characters: await Promise.all(characters.map(getCharacter)),
    weapons: await Promise.all(weapons.map(getWeapon)),
  };
}

it('requires the exact retained base multiplier in the output dependency graph', async () => {
  const entities = await content(['amber'], ['huntersbow']);
  const listed = {
    entity: 'amber', field: '/constellations/0/buffs/0/modifiers/0', id: 'amber.second-arrow',
    target: 'attribute.baseMultiplier', role: 'owner', listed: true,
  };
  const results = { calculator: { buffs: [listed] } };
  const evidence = characterDamageModifierNumbers(entities, results, engine);
  expect(evidence).toHaveLength(1);
  expect(evidence[0]).toMatchObject({ id: listed.id, target: listed.target, actual: .2, expected: .2 });
  expect(evidence[0].cases.map(row => row.actual)).toEqual([.2, .2, 0, 0]);
  expect(characterDamageModifierNumbers(entities, { ...results, registeredModifierEvidence: evidence }, engine)).toEqual([]);
  expect(characterDamageModifierNumbers(entities, { calculator: { buffs: [listed, listed] } }, engine)).toEqual([]);
  expect(characterDamageModifierNumbers(entities, results, {
    ...engine,
    evaluateStructuredHit(...args) {
      const reading = engine.evaluateStructuredHit(...args);
      const detached = new Set(reading.trace
        .filter(node => node.kind === 'effect' && node.definition.id === listed.id).map(node => node.id));
      return { ...reading, trace: reading.trace.map(node => ({
        ...node, dependencies: node.dependencies.filter(id => !detached.has(id)),
      })) };
    },
  })).toEqual([]);
}, 15_000);

it('certifies Nilou C4 only after either third-step hit and before the window expires', async () => {
  const entities = await content(['nilou'], ['dullblade']);
  const listed = {
    entity: 'nilou', field: '/constellations/3/buffs/0/modifiers/0', id: 'nilou.c4.fricative-pulse',
    target: 'attribute.damageBonus', role: 'owner', listed: true,
  };
  const [proof] = characterDamageModifierNumbers(entities, { calculator: { buffs: [listed] } }, engine);
  expect(proof).toMatchObject({ id: listed.id, expected: .5 });
  expect(proof.cases.map(row => row.actual)).toEqual([.5, .5, 0, 0, 0, 0]);
  expect(proof.cases[1].settings).toMatchObject({ timeMs: 7_999 });
  expect(proof.cases[2].settings).toMatchObject({ timeMs: 8_000 });
}, 15_000);

it('keeps the C2 Geo bonus active with a remaining Geo sample and a Geo recipient', async () => {
  const entities = await content(['xilonen', 'noelle', 'amber', 'kaeya', 'lisa'],
    ['dullblade', 'wastergreatsword', 'huntersbow', 'apprenticesnotes']);
  const listed = {
    entity: 'xilonen', field: '/constellations/1/buffs/0/modifiers/0', id: 'xilonen.c2.chiucue-geo',
    target: 'attribute.damageBonus', role: 'team', listed: true,
  };
  const [proof] = characterDamageModifierNumbers(entities, { calculator: { buffs: [listed] } }, engine);
  expect(proof).toMatchObject({ id: listed.id, expected: .5 });
  expect(proof.cases.map(row => row.actual)).toEqual([.5, .5, .5, 0, 0, 0]);
  expect(proof.cases[0].settings).toMatchObject({ recipient: 'noelle', values: { 'xilonen.sourceSamplesActive': false } });
  expect(proof.cases[3].settings).toMatchObject({ party: ['amber', 'kaeya', 'lisa'] });
}, 15_000);

it('certifies Xianyun C2 on the recipient’s impact and isolates the additive cap', async () => {
  const entities = await content(['xianyun', 'kaeya'], ['apprenticesnotes', 'dullblade']);
  const listed = {
    entity: 'xianyun', field: '/constellations/1/buffs/1/modifiers/0', id: 'xianyun.c2.adeptal-assistance',
    target: 'attribute.baseDamageBonus', role: 'team', listed: true,
  };
  const [proof] = characterDamageModifierNumbers(entities, { calculator: { buffs: [listed] } }, engine);
  expect(proof).toMatchObject({ id: listed.id, target: listed.target });
  expect(proof.cases[0].actual).toBeGreaterThan(0);
  expect(proof.cases[1].actual).toBe(18_000);
  expect(proof.cases.slice(2).map(row => row.actual)).toEqual([0, 0, 0, 0, 0]);
}, 15_000);
