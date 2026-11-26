import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileCalculation, evaluateFormula } from '@leyline/engine';
import type { CalculationBundle, FormulaDefinition, Value } from '@leyline/schema';

const root = new URL('../../../../', import.meta.url);
const quantity = (unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): Value => ({ kind: 'quantity', unit, value });
function prepared(bundle: CalculationBundle) {
  const result = compileCalculation(bundle);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.program;
}
function numeric(result: ReturnType<typeof evaluateFormula>, output = 'value') {
  expect(result.outputs[output].state).toBe('known');
  const value = result.outputs[output];
  return value.state === 'known' && value.value.kind === 'quantity' ? value.value.value : NaN;
}

describe('authored ordinary formula library', () => {
  it('compiles every authored graph and returns independent copies', async () => {
    const first = readCalculationLibrary(), second = readCalculationLibrary();
    expect(prepared(first).formulaCount).toBe(first.formulas.length);
    first.formulas[0].identity.revision = 'modified-export-copy';
    expect(second.formulas.some(formula => formula.identity.revision === 'modified-export-copy')).toBe(false);
  });

  it('evaluates the source-derived Kaeya level-90 ordinary setting with fractional defense reduction', async () => {
    const bundle = readCalculationLibrary(), program = prepared(bundle);
    const kaeya = readCalculationData(new URL('src/game-data/data/characters/kaeya.json', root));
    const weapon = readCalculationData(new URL('src/game-data/data/weapons/favoniussword.json', root));
    // Same traceable component setting as damage-pipeline.test.ts; no inventory/recording claim.
    const attack = 18.6984 * 8.349 + 66.90411 + 41.0671 * 7.275 + 155.6;
    expect(kaeya.attributes.base.attack).toBe(18.6984);
    expect(weapon.baseAttack).toBe(41.0671);
    const defense = evaluateFormula(program, { namespace: 'builtin', id: 'defense', revision: '1' }, {
      characterLevel: quantity('count', 90), enemyLevel: quantity('count', 90), reduction: quantity('scalar', 0.25), ignore: quantity('scalar', 0),
    });
    expect(numeric(defense)).toBeCloseTo(190 / (190 + 190 * 0.75), 12);
    const resistance = evaluateFormula(program, { namespace: 'builtin', id: 'resistance', revision: '1' }, { resistance: quantity('scalar', 0.1) });
    const ordinary = evaluateFormula(program, { namespace: 'builtin', id: 'ordinary-hit', revision: '1' }, {
      skillBase: quantity('damage', attack * 0.9875), ordinaryBonusMinusReduction: quantity('scalar', 0),
      critFactor: quantity('scalar', 1), defenseFactor: quantity('scalar', numeric(defense)), resistanceFactor: quantity('scalar', numeric(resistance)),
    });
    expect(ordinary.execution).toBe('complete');
    expect(numeric(ordinary)).toBeCloseTo(attack * 0.9875 * (190 / (190 + 190 * 0.75)) * 0.9, 8);
  });

  it('caps stacked defense reduction at 90% independently of defense ignore', () => {
    // KQM's four-source in-game measurements: https://library.keqingmains.com/evidence/combat-mechanics/damage/damage-formula
    const program = prepared(readCalculationLibrary());
    for (const enemyLevel of [1, 90, 100]) for (const reduction of [.89, .9, .98, 1.1]) for (const ignore of [0, .6, 1]) {
      const result = evaluateFormula(program, {namespace:'builtin',id:'defense',revision:'1'}, {
        characterLevel:quantity('count', 1), enemyLevel:quantity('count', enemyLevel),
        reduction:quantity('scalar', reduction), ignore:quantity('scalar', ignore),
      });
      const expected = 101 / (101 + (enemyLevel + 100) * (1 - Math.min(.9, reduction)) * (1 - ignore));
      expect(numeric(result)).toBeCloseTo(expected, 12);
    }
  });

  it('implements resistance branches and crit clamping from source-bounded derivatives', async () => {
    const program = prepared(readCalculationLibrary());
    // Transparent resistance-boundary derivatives of the existing 10% Hilichurl calculation setting.
    for (const [resistance, expected] of [[-0.1, 1.05], [0, 1], [0.75, 0.25], [1, 0.2]]) {
      expect(numeric(evaluateFormula(program, { namespace: 'builtin', id: 'resistance', revision: '1' }, { resistance: quantity('scalar', resistance) }))).toBeCloseTo(expected, 12);
    }
    for (const [rate, expected] of [[0, 1], [1, 1.5], [1.032, 1.5]]) {
      const result = evaluateFormula(program, { namespace: 'builtin', id: 'crit', revision: '1' }, { critRate: quantity('scalar', rate), critDamage: quantity('scalar', 0.5) }, { outputs: ['expected'] });
      expect(numeric(result, 'expected')).toBe(expected);
    }
  });

  it('uses the adopted exact reaction level table and distinguishes a missing index from an unknown value', async () => {
    const bundle = readCalculationLibrary();
    const reactions = readCalculationData(new URL('src/game-data/data/calculation/reactions.json', root)).rules;
    const additive = bundle.formulas.find(formula => formula.identity.id === 'additive')!;
    const table = bundle.tables.find(table => table.identity.id === 'reaction-level')!;
    const lookup: FormulaDefinition = { schemaVersion: '0.2.0', identity: { namespace: 'custom:reaction-table-test', id: 'adopted-level-lookup', revision: '1' },
      template: { id: 'level-multiplier', revision: '1', table: table.identity }, sources: ['kqm.additive'] };
    bundle.formulas.push(lookup);
    const program = prepared(bundle);
    expect(numeric(evaluateFormula(program, lookup.identity, { level: quantity('count', 90) }))).toBe(reactions.levelMultipliers[90]);
    expect(evaluateFormula(program, lookup.identity, { level: quantity('count', 0) }).execution).toBe('invalid');
    expect(evaluateFormula(program, lookup.identity, { level: quantity('count', reactions.levelMultipliers.length) }).execution).toBe('invalid');
    const added = evaluateFormula(program, additive.identity, { em: quantity('elementalMastery', 0), reactionBonus: quantity('scalar', 0), reactionCoefficient: quantity('scalar', 1.25), levelMultiplier: quantity('damage', reactions.levelMultipliers[90]) });
    expect(numeric(added)).toBeCloseTo(reactions.levelMultipliers[90] * 1.25, 10);
    if (table.kind !== 'integer') throw new Error('Actual level table kind changed');
    table.values[90] = null; // Deliberate missing-value derivative of the adopted table.
    expect(evaluateFormula(prepared(bundle), lookup.identity, { level: quantity('count', 90) }).execution).toBe('partial');
  });

  it('keeps TS-owned calls lazy for the noncritical mode of the ordinary Kaeya setting', async () => {
    const bundle = readCalculationLibrary(), definition = bundle.formulas.find(formula => formula.identity.id === 'crit-selected')!;
    const result = evaluateFormula(prepared(bundle), definition.identity, { mode: { kind: 'enum', value: 'noncritical' }, critRate: null, critDamage: null });
    expect(result.execution).toBe('complete');
    expect(result.requiredInputs).toEqual([]);
    expect(result.trace.some(trace => trace.nodeId === 'critRate' || trace.nodeId === 'critDamage')).toBe(false);
    expect(numeric(result)).toBe(1);
  });

  it('evaluates the source-defined Hyperbloom component without ordinary damage, defense or implicit crit', async () => {
    const bundle = readCalculationLibrary(), program = prepared(bundle);
    const kuki = readCalculationData(new URL('src/game-data/data/characters/kukishinobu.json', root));
    const weapon = readCalculationData(new URL('src/game-data/data/weapons/ironsting.json', root));
    const em = weapon.baseStat * weapon.statCurve[90];
    const rules = readCalculationData(new URL('src/game-data/data/calculation/reactions.json', root)).rules;
    expect(kuki.identity.element).toBe('electro');
    const result = evaluateFormula(program, { namespace: 'builtin', id: 'transformative', revision: '1' }, {
      levelMultiplier: quantity('damage', rules.levelMultipliers[90]), reactionCoefficient: quantity('scalar', 3),
      em: quantity('elementalMastery', em), reactionBonus: quantity('scalar', 0), resistanceFactor: quantity('scalar', 0.9),
    });
    expect(result.execution).toBe('complete');
    expect(numeric(result)).toBeCloseTo(3 * rules.levelMultipliers[90] * (1 + 16 * em / (em + 2000)) * 0.9, 8);
    expect(result.trace.some(node => ['critRate', 'critDamage', 'defenseFactor', 'ordinaryBonusMinusReduction'].includes(node.nodeId))).toBe(false);
  });
});
