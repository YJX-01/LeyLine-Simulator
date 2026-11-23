import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { formulaDefinitionSchema } from '@leyline/schema';
import { expect, it } from 'vitest';
import { auditRemainingEnergyFacts } from '../../../../tools/lib/remaining-energy-facts.mjs';

it('evaluates the confirmed actual expenditure, cumulative repayment and whole impact steps', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(['barbara', 'sethos', 'sigewinne', 'valeriy'].map(getCharacter)),
    Promise.all(['apprenticesnotes', 'huntersbow', 'dullblade'].map(getWeapon)),
  ]);
  const result = auditRemainingEnergyFacts({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.summary.remainingEnergyClausesVerified).toBe(3);
  expect(result.verified).toEqual(new Set([
    'sethos/constellations/5/buffs/0', 'sethos/constellations/5/buffs/0/modifiers/0',
    'sigewinne/talents/1/buffs/0', 'sigewinne/talents/1/buffs/0/modifiers/0',
    'valeriy/constellations/0/buffs/0', 'valeriy/constellations/0/buffs/0/modifiers/0',
  ]));
  expect(result.gaps.map(({ entity, field, status }) => [entity + field, status])).toEqual([
    ['sethos/constellations/5', 'timeline-only'], ['sigewinne/talents/1', 'timeline-only'], ['valeriy/constellations/0', 'timeline-only'],
    ['valeriy/constellations/0/buffs/0/modifiers/0', 'unavailable'],
  ]);
  const values = (entity: string, label: string) => result.rows.filter(row => row.entity === entity && row.probe.label.startsWith(label)).map(row => row.value);
  expect(values('sethos', '本发实际消耗')).toEqual([0, 5, 10.5, 20]);
  expect(values('sigewinne', '完全清除契值')).toEqual([0, 0.4995, 0.5, 0.5005, 1, 1.25, 4.9995, 5, 5].map(value => expect.closeTo(value, 9)));
  expect(values('sigewinne', '部分偿还')).toEqual([0]);
  expect(values('sigewinne', '随后完全清除')).toEqual([1.25]);
  expect(values('valeriy', '已核实完整档位')).toEqual([6, 7.5, 9, 10.5, 12, 13.5, 15]);
  expect(values('valeriy', '四命后回能已达上限')).toEqual([15, 15]);
  const intermediate = result.rows.filter(row => row.entity === 'valeriy' && row.probe.label.startsWith('中间档位'));
  expect(intermediate.map(row => [row.probe.facts['valeriy.spentImpactPotential'], row.status, row.value]))
    .toEqual([[45, 'unknown', null], [55, 'unknown', null], [75, 'unknown', null], [85, 'unknown', null], [99, 'unknown', null]]);
  expect(result.rows.filter(row => row.probe.recipient === 'peer').map(row => row.value)).toEqual([0, 0, 0]);
  expect(result.rows.every(row => row.output === 'attribute.directEnergyRestored' && row.sources.length > 0)).toBe(true);
  const recipe = characters.find(character => character.id === 'valeriy')?.calculation.bundle.formulas.find(formula => formula.identity.id === 'valeriy.impact-momentum-energy');
  expect(formulaDefinitionSchema.safeParse(recipe).success).toBe(true);
  expect(formulaDefinitionSchema.safeParse({ ...recipe, template: { ...recipe?.template, confirmedStep: 0 } }).success).toBe(false);
}, 30000);
