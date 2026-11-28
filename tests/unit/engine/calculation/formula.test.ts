import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileCalculation, evaluateFormula } from '@leyline/engine';
import type { CalculationBundle, FormulaDefinition, Value } from '@leyline/schema';

const root = new URL('../../../../', import.meta.url);
const formula: FormulaDefinition = readCalculationData(new URL('src/game-data/data/characters/nahida.json', root)).calculation.bundle.formulas.find((item: FormulaDefinition) => item.identity.id === 'nahida.skill.tri-karma.base');
const character = readCalculationData(new URL('src/game-data/data/characters/nahida.json', root));
const recording = new URL('.references/enka/uid-107590923.json', root);
function library(definition = structuredClone(formula)): CalculationBundle {
  return { schemaVersion: '0.3.0', runtimeVersion: '0.3.0', requiredFeatures: ['fixed-templates-v1', 'formula-call-v1'],
    sources: [{ id: 'character.builtin.nahida', kind: 'definition' }],
    formulas: [definition], tables: [], attributes: [], effects: [], stateMachines: [], aggregates: [], coverage: [] };
}
function compile(bundle = library()) {
  const result = compileCalculation(bundle);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.program;
}
const quantity = (unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): Value => ({ kind: 'quantity', unit, value });
const parameters = character.talents.find((talent: { id: string }) => talent.id === 'nahida.skill').parameters;
const rates = () => ({ attackRate: quantity('scalar', parameters.find((p: { id: string }) => p.id === 'param3').values[0]),
  emRate: quantity('scalar', parameters.find((p: { id: string }) => p.id === 'param4').values[0]) });

describe('pure interpretation of real Tri-Karma scaling', () => {
  it('keeps absent attack/EM unknown, with independently evaluated output dependencies', () => {
    const program = compile();
    // Actual canonical white attack; this is a component calculation, not a claimed player build.
    const result = evaluateFormula(program, formula.identity, { ...rates(), attack: quantity('attack', character.attributes.base.attack) });
    expect(result.execution).toBe('partial');
    expect(result.outputs.base.state).toBe('unknown');
    expect(result.requiredInputs.map(input => input.key)).toEqual(['em']);
    expect(result.diagnostics.find(item => item.code === 'missing-fact')?.affectedOutputIds).toEqual(['base']);
    const oneTerm = structuredClone(formula);
    if (oneTerm.template.id !== 'scaled-damage') throw new Error('Actual scaling template changed');
    oneTerm.template.terms.pop(); // Explicit component setting using the existing attack scaling term.
    const component = evaluateFormula(compile(library(oneTerm)), oneTerm.identity,
      { attackRate: rates().attackRate, attack: quantity('attack', character.attributes.base.attack) });
    expect(component.outputs.base.state).toBe('known');
    if (component.outputs.base.state === 'known') expect(component.outputs.base.value.value).toBeCloseTo(character.attributes.base.attack * 1.032, 8);
  });

  it('respects reduced work budgets on the real graph', () => {
    const result = evaluateFormula(compile(), formula.identity, rates(), { limits: { visits: 1 } });
    expect(result.execution).toBe('invalid');
    expect(result.diagnostics.some(diagnostic => diagnostic.code === 'budget')).toBe(true);
    expect(result.trace.every(node => node.dependencies.every(id => result.trace.some(parent => parent.id === id)))).toBe(true);
  });

  it('rejects prototype-named undeclared inputs and does not hide supplied invalid values in inactive branches', () => {
    const input = { ...rates(), constructor: quantity('scalar', 1.032) };
    expect(evaluateFormula(compile(), formula.identity, input).execution).toBe('invalid');
    const result = evaluateFormula(compile(), formula.identity, { ...rates(), attackRate: quantity('hp', 1.032) }, { outputs: ['base'] });
    expect(result.execution).toBe('invalid');
    expect(result.diagnostics[0].jsonPointer).toBe('/inputs/attackRate');
  });

  it.skipIf(!existsSync(recording))('matches an independent component calculation using authorized recorded Nahida attributes', () => {
    const response = JSON.parse(readFileSync(recording, 'utf8'));
    const avatar = response.avatarInfoList.find((avatar: { avatarId: number }) => avatar.avatarId === character.identity.gameId);
    expect(avatar).toBeDefined();
    // Enka fightPropMap values are recorded panel facts. This does not reconstruct battle state or observed damage.
    const attack = avatar.fightPropMap['2001'], em = avatar.fightPropMap['28'];
    expect(Number.isFinite(attack) && Number.isFinite(em)).toBe(true);
    // Explicit talent-1 component setting derived from actual parameters; it is not the avatar's observed skill damage.
    const inputs = { ...rates(), attack: quantity('attack', attack), em: quantity('elementalMastery', em) };
    const before = structuredClone(inputs), program = compile();
    const first = evaluateFormula(program, formula.identity, inputs);
    const expected = attack * 1.032 + em * 2.064;
    expect(first.outputs.base).toMatchObject({ state: 'known', value: { kind: 'quantity', unit: 'damage' } });
    if (first.outputs.base.state === 'known') expect(first.outputs.base.value.value).toBeCloseTo(expected, 8);
    expect(evaluateFormula(program, formula.identity, inputs)).toEqual(first);
    expect(inputs).toEqual(before);
    if (inputs.attack.kind === 'quantity') inputs.attack.value = 0; // Mutation derivative, not a recorded panel claim.
    expect(first).toEqual(evaluateFormula(program, formula.identity, before));
  });

  it('does not read Ayato HP scaling at the source-declared zero Namisen count', () => {
    const definition: FormulaDefinition = readCalculationData(new URL('src/game-data/data/characters/kamisatoayato.json', root)).calculation.bundle.formulas.find((item: FormulaDefinition) => item.identity.id === 'kamisatoayato-shunsuiken-base');
    const ayato = readCalculationData(new URL('src/game-data/data/characters/kamisatoayato.json', root));
    const sources = ayato.calculation.bundle.sources;
    const bundle = library(definition);
    bundle.sources = sources;
    const result = evaluateFormula(compile(bundle), definition.identity,
      { attack: quantity('attack', ayato.attributes.base.attack), attackRate: quantity('scalar', 0.5289), namisen: quantity('count', 0), hp: null, hpRate: null });
    expect(result.execution).toBe('complete');
    expect(result.requiredInputs).toEqual([]);
    expect(result.trace.some(node => node.nodeId === 'hp' || node.nodeId === 'hpRate')).toBe(false);
    if (result.outputs.base.state === 'known') expect(result.outputs.base.value.value).toBeCloseTo(ayato.attributes.base.attack * 0.5289, 8);
    const strict = evaluateFormula(compile(), formula.identity, { ...rates(), attack: quantity('attack', 0), em: null });
    expect(strict.outputs.base.state).toBe('unknown');
  });
});
