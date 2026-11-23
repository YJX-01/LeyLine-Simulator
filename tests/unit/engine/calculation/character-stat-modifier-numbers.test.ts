import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { characterStatModifierNumbers } from '../../../../tools/lib/character-stat-modifier-numbers.mjs';

const choice = (entity: string, field: string, grant: string, stat: string, role = 'owner') => ({
  entity, field, id: entity + '.' + grant, target: 'attribute.' + stat, role, listed: true,
});

async function prepare(characters: string[], weapons: string[]) {
  return {
    characters: await Promise.all(characters.map(id => getCharacter(id))),
    weapons: await Promise.all(weapons.map(id => getWeapon(id))),
  };
}

it('certifies shots and recipients at the constellation and ascension gates', async () => {
  const entities = await prepare(['chasca', 'wriothesley', 'navia', 'ororon', 'kaeya'],
    ['huntersbow', 'apprenticesnotes', 'wastergreatsword', 'dullblade']);
  const buffs = [
    choice('chasca', '/constellations/5/buffs/0/modifiers/0', 'c6.fatal-round-crit', 'critDamage'),
    choice('wriothesley', '/constellations/5/buffs/0/modifiers/0', 'c6.gracious-rebuke-crit', 'critRate'),
    choice('navia', '/constellations/5/buffs/0/modifiers/0', 'c6.shrapnel-crit-damage', 'critDamage'),
    choice('ororon', '/constellations/5/buffs/0/modifiers/0', 'c6.supersense-attack', 'attackPercent', 'team'),
  ];
  const results = { calculator: { buffs } };
  const proofs = characterStatModifierNumbers(entities, results, engine);
  expect(proofs).toHaveLength(4);
  for (const [entity, amount] of [['chasca', 1.2], ['wriothesley', .1], ['ororon', .3]] as const) {
    const proof = proofs.find(row => row.entity === entity)!;
    expect(proof.cases.find(row => Math.abs(row.expected - amount) < 1e-10)?.actual).toBeCloseTo(amount);
    expect(proof.cases).toContainEqual(expect.objectContaining({ expected: 0, actual: 0,
      settings: expect.objectContaining({ ascension: 0, constellation: 6 }) }));
  }
  const navia = proofs.find(row => row.entity === 'navia')!;
  const cases = navia.cases.slice(0, 6);
  expect(cases.slice(0, 3).map(row => row.actual)).toEqual([0, 0, 0]);
  for (const [index, row] of cases.slice(3).entries()) expect(row.actual).toBeCloseTo(.45 * (index + 1));
  expect(characterStatModifierNumbers(entities, { ...results, registeredModifierEvidence: proofs }, engine)).toEqual([]);
  expect(characterStatModifierNumbers(entities, { calculator: { buffs: [buffs[0], buffs[0]] } }, engine)).toEqual([]);
});

it('reads two Varesa stacks during overlap and one after the earlier stack expires', async () => {
  const entities = await prepare(['varesa', 'mualani', 'kachina', 'kaeya'],
    ['apprenticesnotes', 'beginnersprotector', 'dullblade']);
  const buffs = [choice('varesa', '/passives/1/buffs/0/modifiers/0', 'a1.nightsoul-burst-atk', 'attackPercent')];
  const [proof] = characterStatModifierNumbers(entities, { calculator: { buffs } }, engine);
  const cases = proof.cases;
  for (const [timeMs, expected] of [[9001, .7], [11999, .7], [12000, .35], [20999, .35], [21000, 0]]) {
    const row = cases.find(row => {
      const settings = row.settings as { timeMs?: number; triggers?: unknown[] };
      return settings.timeMs === timeMs && settings.triggers?.length === 2;
    });
    expect(row?.actual).toBeCloseTo(expected);
  }
  expect(cases).toContainEqual(expect.objectContaining({ actual: .35,
    settings: expect.objectContaining({ timeMs: 9000, triggers: [expect.any(Object)] }) }));
});

it('ignores an evaluated contribution that the output did not retain', async () => {
  const entities = await prepare(['vesna', 'kaeya', 'sucrose', 'lisa', 'amber'],
    ['dullblade', 'apprenticesnotes', 'huntersbow']);
  const buffs = [
    choice('vesna', '/passives/1/buffs/0/modifiers/0', 'cryo-anemo-attack.effect', 'attackPercent'),
    choice('vesna', '/constellations/3/buffs/0/modifiers/0', 'cryo-anemo-attack-c4.effect', 'attackPercent'),
  ];
  const proofs = characterStatModifierNumbers(entities, { calculator: { buffs } }, engine);
  expect(proofs).toHaveLength(2);
  expect(proofs[0].cases).toContainEqual(expect.objectContaining({ actual: 0, expected: 0,
    settings: expect.objectContaining({ constellation: 4, party: ['kaeya', 'sucrose'], values: { radiance: 'stellar-swirl' } }) }));
  expect(proofs[1].cases).toContainEqual(expect.objectContaining({ actual: expect.closeTo(.54), expected: .54,
    settings: expect.objectContaining({ constellation: 4, party: ['kaeya', 'sucrose'], values: { radiance: 'stellar-swirl' } }) }));
});
