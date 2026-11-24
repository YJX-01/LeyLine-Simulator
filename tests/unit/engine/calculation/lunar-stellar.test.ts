import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileCalculation, describeCalculationTemplate, evaluateFormula } from '@leyline/engine';
import type { Value } from '@leyline/schema';

const root = new URL('../../../../', import.meta.url);
const read = (file: string) => readCalculationData(new URL(file, root));
const zibai = read('src/game-data/data/characters/zibai.json');
const ironSting = read('src/game-data/data/weapons/ironsting.json');
const reactions = read('src/game-data/data/calculation/reactions.json').rules;
const quantity = (unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): Value => ({ kind: 'quantity', unit, value });

// Real catalog components at level 90 with an actual compatible sword. Explicit mathematical conditions,
// not a claimed player export, observed reaction sequence, or complete Zibai kit acceptance.
const defense = zibai.attributes.base.defense * zibai.progression.curves.defense[90] + zibai.progression.promotion[6].defense;
const em = ironSting.baseStat * ironSting.statCurve[90];
const rate = zibai.talents.find((talent: { id: string }) => talent.id === 'zibai.skill').parameters.find((parameter: { id: string }) => parameter.id === 'param2').values[0];
const scaledBase = defense * rate;
const baseBonus = Math.min(defense / 100 * 0.007, 0.14);
const critical = 1 + zibai.attributes.base.critDamage + zibai.progression.promotion[6].specialized;

describe('source-image lunar and stellar pure formula components', () => {
  let bundle: ReturnType<typeof readCalculationLibrary>;
  let program: Extract<ReturnType<typeof compileCalculation>, { ok: true }>['program'];
  beforeAll(() => {
    bundle = readCalculationLibrary();
    const compiled = compileCalculation(bundle);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
    program = compiled.program;
  });
  it.each([
    ['lunar-charged-individual', 3, 'levelMultiplier'], ['lunar-crystallize-individual', 1.6, 'levelMultiplier'],
    ['lunar-charged-direct', 3, 'scaledBase'], ['lunar-bloom-direct', 1, 'scaledBase'],
    ['lunar-crystallize-direct', 1.6, 'scaledBase'], ['stellar-conduct-direct', 1.45, 'scaledBase'],
    ['stellar-swirl-individual', 0.75, 'levelMultiplier'], ['stellar-swirl-direct', 1, 'scaledBase'],
  ] as const)('independently checks %s without ordinary bonus or defense reads', async (id, coefficient, baseInput) => {
    const definition = bundle.formulas.find(formula => formula.identity.id === id)!;
    const base = baseInput === 'scaledBase' ? scaledBase : reactions.levelMultipliers[90];
    const flat = id === 'lunar-crystallize-direct' ? defense * 0.6 : 0;
    const inputs: Record<string, Value> = {
      [baseInput]: quantity('damage', base), reactionBaseBonus: quantity('scalar', baseBonus), em: quantity('elementalMastery', em),
      reactionBonus: quantity('scalar', 0), flatBaseBonus: quantity('damage', flat),
      critFactor: quantity('scalar', critical), resistanceFactor: quantity('scalar', 0.9), elevationFactor: quantity('scalar', 1),
    };
    if (Object.hasOwn(describeCalculationTemplate(definition).inputs, 'reactionCoefficient')) inputs.reactionCoefficient = quantity('scalar', coefficient);
    const result = evaluateFormula(program, definition.identity, inputs);
    const expected = (coefficient * base * (1 + baseBonus) * (1 + 6 * em / (em + 2000)) + flat) * critical * 0.9;
    expect(result.execution).toBe('complete');
    expect(result.outputs.value.state).toBe('known');
    if (result.outputs.value.state === 'known') expect(result.outputs.value.value.value).toBeCloseTo(expected, 8);
    expect(result.trace.some(node => ['defenseFactor', 'ordinaryBonusMinusReduction'].includes(node.nodeId))).toBe(false);
    if (baseInput === 'scaledBase') expect(result.trace.some(node => node.nodeId === 'levelMultiplier')).toBe(false);
  });

  it('keeps a missing exclusive input unknown rather than inheriting ordinary damage factors', async () => {
    const result = evaluateFormula(program, { namespace: 'builtin', id: 'lunar-crystallize-direct', revision: '1' }, { scaledBase: quantity('damage', scaledBase) });
    expect(result.execution).toBe('partial');
    expect(result.requiredInputs.map(input => input.key)).toContain('reactionBaseBonus');
    expect(result.requiredInputs.some(input => input.key.includes('defense'))).toBe(false);
  });
});
