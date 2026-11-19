import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileCalculation, evaluateAggregate } from '@leyline/engine';
import type { AggregateRequest, Value } from '@leyline/schema';

const root = new URL('../../../../', import.meta.url);
const read = (file: string) => readCalculationData(new URL(file, root));
const levels = read('src/game-data/data/calculation/reactions.json').rules.levelMultipliers;
const ids = ['ineffa', 'aino', 'flins', 'columbina'];
const actors = ids.map(id => {
  const character = read(`src/game-data/data/characters/${id}.json`);
  const specialized = character.progression.promotion[6].specialized;
  return { id, weaponType: character.identity.weaponType, em: character.attributes.specialized === 'elementalMastery' ? specialized : 0,
    critRate: character.attributes.base.critRate + (character.attributes.specialized === 'critRate' ? specialized : 0),
    critDamage: character.attributes.base.critDamage + (character.attributes.specialized === 'critDamage' ? specialized : 0) };
});
const quantity = (unit: Extract<Value, { kind: 'quantity' }>['unit'], value: number): Value => ({ kind: 'quantity', unit, value });

// Formula components isolated at source-derived level-90 stats and explicit neutral effect inputs.
// These do not claim complete kits, a player party, observed participation, or recorded damage.
function request(): AggregateRequest {
  return { definition: { namespace: 'builtin', id: 'lunar-charged', revision: '1' },
    contributors: actors.map(actor => ({ id: actor.id, inputs: { levelMultiplier: quantity('damage', levels[90]), em: quantity('elementalMastery', actor.em),
      reactionBaseBonus: quantity('scalar', 0), reactionBonus: quantity('scalar', 0), flatBaseBonus: quantity('damage', 0),
      critFactor: null, resistanceFactor: quantity('scalar', 0.9), elevationFactor: quantity('scalar', 1) } })),
    probability: { kind: 'independent', variables: actors.map(actor => ({ id: actor.id + ':crit', probability: actor.critRate,
      bindings: [{ contributorId: actor.id, input: 'critFactor', no: quantity('scalar', 1), yes: quantity('scalar', 1 + actor.critDamage) }] })) } };
}
async function program() {
  const compiled = compileCalculation(readCalculationLibrary());
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  return compiled.program;
}
const weighted = (values: number[]) => {
  const descending = [...values].sort((a, b) => b - a);
  return descending[0] * 0.6 + descending[1] * 0.3 + descending[2] * 0.05 + descending[3] * 0.05;
};

describe('ranked contribution expectation from actual catalog components', () => {
  it('matches an independent equation in every crit state and differs from ranking individual expectations', async () => {
    const input = request(), result = evaluateAggregate(await program(), input);
    const independentBase = actors.map(actor => 3 * levels[90] * (1 + 6 * actor.em / (2000 + actor.em)) * 0.9);
    let expected = 0;
    for (let mask = 0; mask < 2 ** actors.length; mask++) {
      let probability = 1;
      const values = actors.map((actor, index) => {
        const critical = (mask & (1 << index)) !== 0;
        probability *= critical ? actor.critRate : 1 - actor.critRate;
        return independentBase[index] * (critical ? 1 + actor.critDamage : 1);
      });
      expected += probability * weighted(values);
    }
    const incorrectlyRankedExpectations = weighted(actors.map((actor, index) => independentBase[index] * (1 + actor.critRate * actor.critDamage)));
    expect(result.execution).toBe('complete');
    expect(result.states).toHaveLength(2 ** actors.length);
    expect(result.states.reduce((total, state) => total + state.probability, 0)).toBeCloseTo(1, 12);
    if (result.value.state === 'known') expect(result.value.value.value).toBeCloseTo(expected, 8);
    expect(Math.abs(expected - incorrectlyRankedExpectations)).toBeGreaterThan(1);
    expect(new Set(result.trace.map(node => node.id)).size).toBe(result.trace.length);
    expect(result.trace.every(node => node.dependencies.every(id => result.trace.some(parent => parent.id === id)))).toBe(true);
  });

  it('recomputes ranking after a transparent equipment-stat change and preserves its input', async () => {
    const input = request(), before = structuredClone(input), compiled = await program();
    const baseline = evaluateAggregate(compiled, input);
    // Add the compatible real level-90 Dragon's Bane EM component as an explicit input derivative.
    const weapon = read('src/game-data/data/weapons/dragonsbane.json');
    expect(weapon.weaponType).toBe(actors[0].weaponType);
    expect(weapon.stat).toBe('elementalMastery');
    input.contributors[0].inputs.em = quantity('elementalMastery', weapon.baseStat * weapon.statCurve[90]);
    const candidate = evaluateAggregate(compiled, input);
    expect(candidate.execution).toBe('complete');
    expect(candidate.states[0].ranking[0].contributorId).toBe('ineffa');
    expect(baseline.states[0].ranking[0].contributorId).toBe('aino');
    expect(evaluateAggregate(compiled, before)).toEqual(baseline);
  });

  it('retains missing probabilities as unknown and never uses an expectation shortcut for over-budget states', async () => {
    const input = request(), compiled = await program();
    const over = evaluateAggregate(compiled, input, { limits: { probabilityStates: 8 } });
    expect(over.execution).toBe('invalid');
    expect(over.diagnostics.some(diagnostic => diagnostic.code === 'budget')).toBe(true);
    if (input.probability.kind !== 'independent') throw new Error('Expected the declared independent model');
    input.probability.variables[0].probability = null;
    const unknown = evaluateAggregate(compiled, input);
    expect(unknown.execution).toBe('partial');
    expect(unknown.requiredInputs[0].scope).toBe('probability');
  });

  it('collapses explicit zero/one probability boundaries without inventing extra states', async () => {
    const input = request();
    if (input.probability.kind !== 'independent') throw new Error('Expected the declared independent model');
    input.probability.variables.forEach((variable, index) => { variable.probability = index % 2; });
    const result = evaluateAggregate(await program(), input);
    expect(result.execution).toBe('complete');
    expect(result.states).toHaveLength(1);
    expect(result.states[0].probability).toBe(1);
  });

  it('honors a complete explicit joint model and rejects contradictory probability tables', async () => {
    const input = request();
    // Transparent correlation-model derivative; no claim that game crits share this correlation.
    const bindings = (critical: boolean) => actors.map(actor => ({ contributorId: actor.id, input: 'critFactor', value: quantity('scalar', critical ? 1 + actor.critDamage : 1) }));
    input.probability = { kind: 'joint', states: [{ id: 'all-noncritical', probability: 0.5, bindings: bindings(false) }, { id: 'all-critical', probability: 0.5, bindings: bindings(true) }] };
    const compiled = await program(), result = evaluateAggregate(compiled, input);
    expect(result.execution).toBe('complete');
    expect(result.states).toHaveLength(2);
    const expected = 0.5 * weighted(actors.map(actor => 3 * levels[90] * (1 + 6 * actor.em / (2000 + actor.em)) * 0.9))
      + 0.5 * weighted(actors.map(actor => 3 * levels[90] * (1 + 6 * actor.em / (2000 + actor.em)) * 0.9 * (1 + actor.critDamage)));
    if (result.value.state === 'known') expect(result.value.value.value).toBeCloseTo(expected, 8);
    input.probability.states[0].probability = 1;
    expect(evaluateAggregate(compiled, input).execution).toBe('invalid');
  });

  it('does not assign unequal weights by ID when fixed ranks tie but realized contributions differ', async () => {
    const library = readCalculationLibrary();
    // Explicit fixed-rank error derivative of the real lunar formula, not a claim about game ranking.
    library.aggregates.find(definition => definition.identity.id === 'lunar-charged')!.rankMetric.at = 'fixed';
    const compiled = compileCalculation(library); expect(compiled.ok).toBe(true); if (!compiled.ok) return;
    const input = request(); input.contributors = [input.contributors[0], input.contributors[2]]; input.probability = { kind: 'fixed' };
    input.contributors.forEach((contributor, index) => {
      contributor.inputs.critFactor = quantity('scalar', 1);
      contributor.rankInputs = structuredClone(contributor.inputs);
      if (index === 1) contributor.inputs.critFactor = quantity('scalar', 1 + actors[2].critDamage);
    });
    for (const names of [['ineffa', 'flins'], ['a-ineffa', 'z-flins']]) {
      input.contributors.forEach((contributor, index) => { contributor.id = names[index]; });
      const before = JSON.stringify(input), result = evaluateAggregate(compiled.program, input);
      expect(result.execution).toBe('partial'); expect(result.value.state).toBe('unknown');
      expect(result.diagnostics.some(diagnostic => diagnostic.code === 'unsupported-semantics')).toBe(true);
      expect(result.states[0].value).toBe(null); expect(result.states[0].ranking).toEqual([]);
      expect(JSON.stringify(input)).toBe(before);
    }
    input.contributors[1].inputs.critFactor = quantity('scalar', 1);
    const equal = evaluateAggregate(compiled.program, input);
    expect(equal.execution).toBe('complete');
    if (equal.value.state === 'known') expect(equal.value.value.value).toBeCloseTo(3 * levels[90] * 0.9 * (0.6 + 0.3), 8);

    // Equal-weight boundary of the same protocol derivative also makes the tied order immaterial.
    const definition = library.aggregates.find(definition => definition.identity.id === 'lunar-charged')!;
    definition.weights![1] = definition.weights![0];
    const equalWeights = compileCalculation(library); expect(equalWeights.ok).toBe(true); if (!equalWeights.ok) return;
    input.contributors[1].inputs.critFactor = quantity('scalar', 1 + actors[2].critDamage);
    const known = evaluateAggregate(equalWeights.program, input);
    expect(known.execution).toBe('complete');
    if (known.value.state === 'known') expect(known.value.value.value).toBeCloseTo(3 * levels[90] * 0.9 * 0.6 * (2 + actors[2].critDamage), 8);
  });
});
