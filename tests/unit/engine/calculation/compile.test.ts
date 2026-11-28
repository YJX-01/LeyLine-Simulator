import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { readCalculationLibrary } from '../../../helpers/read-calculation-library';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileCalculation, evaluateFormula, describeCalculationTemplate } from '@leyline/engine';
import type { CalculationBundle, FormulaDefinition } from '@leyline/schema';

const original: FormulaDefinition = readCalculationData(new URL('../../../../src/game-data/data/characters/nahida.json', import.meta.url)).calculation.bundle.formulas.find((item: FormulaDefinition) => item.identity.id === 'nahida.skill.tri-karma.base');
function library(): CalculationBundle {
  return { schemaVersion: '0.3.0', runtimeVersion: '0.3.0', requiredFeatures: ['fixed-templates-v1', 'formula-call-v1'],
    sources: [{ id: 'character.builtin.nahida', kind: 'definition' }],
    formulas: [structuredClone(original)], tables: [], attributes: [], effects: [], stateMachines: [], aggregates: [], coverage: [] };
}

describe('fixed TS template compilation from real catalog configurations', () => {
  it('compiles without retaining mutable metadata or serializing an operation graph', () => {
    const bundle = library(), result = compileCalculation(bundle);
    expect(result.ok).toBe(true); expect(Object.isFrozen(bundle)).toBe(false);
    const recipe = bundle.formulas[0];
    if (recipe.template.id === 'scaled-damage') recipe.template.terms.splice(0);
    expect(compileCalculation(bundle).ok).toBe(false);
    if (result.ok) {
      expect(result.program.runtimeVersion).toBe('0.3.0');
      expect(evaluateFormula(result.program, original.identity, {}, { outputs: ['base'] }).execution).toBe('partial');
    }
    expect(describeCalculationTemplate(original).outputs.base).toEqual({ kind: 'quantity', unit: 'damage' });
  });

  it.each(['operations', 'signature', 'ports', 'unknown-template', 'template-revision', 'missing-source', 'conflict', 'feature', 'runtime', 'old-bundle'])(
    'rejects the explicitly modified %s metadata derivative', change => {
      const bundle = library(), recipe = bundle.formulas[0];
      if (change === 'operations') Object.assign(recipe, { nodes: [] });
      if (change === 'signature') Object.assign(recipe, { inputs: {} });
      if (change === 'ports') Object.assign(recipe, { modifierPorts: {} });
      if (change === 'unknown-template') Object.assign(recipe.template, { id: 'unregistered-template' });
      if (change === 'template-revision') Object.assign(recipe.template, { revision: 'future' });
      if (change === 'missing-source') bundle.sources = [];
      if (change === 'conflict') {
        const duplicate = structuredClone(recipe);
        if (duplicate.template.id === 'scaled-damage') duplicate.template.terms.pop();
        bundle.formulas.push(duplicate);
      }
      if (change === 'feature') bundle.requiredFeatures.push('unimplemented-event-semantics');
      if (change === 'runtime') Object.assign(bundle, { runtimeVersion: 1 });
      if (change === 'old-bundle') Object.assign(bundle, { schemaVersion: 1 });
      const result = compileCalculation(bundle);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        if (change === 'conflict') expect(result.diagnostics.some(item => item.code === 'conflicting-definition')).toBe(true);
        if (change === 'unknown-template') expect(result.diagnostics.some(item => item.code === 'unsupported-feature' && item.jsonPointer.endsWith('/template/id'))).toBe(true);
        if (['template-revision', 'runtime', 'old-bundle'].includes(change)) expect(result.diagnostics.some(item => item.code === 'unsupported-version')).toBe(true);
      }
    },
  );

  it('deduplicates equal configurations and rejects missing, recursive or incompatible template dependencies', async () => {
    const small = library(); small.formulas.push(structuredClone(small.formulas[0]));
    const equal = compileCalculation(small); expect(equal.ok && equal.program.formulaCount).toBe(1);
    for (const change of ['missing', 'cycle', 'signature']) {
      const bundle = readCalculationLibrary(), selected = bundle.formulas.find(recipe => recipe.identity.id === 'crit-selected')!;
      if (selected.template.id !== 'crit-selected') throw new Error('Actual catalog template changed');
      if (change === 'missing') selected.template.calculation.revision = 'missing-revision';
      if (change === 'cycle') selected.template.calculation = { ...selected.identity };
      if (change === 'signature') selected.template.calculation = { ...original.identity };
      const result = compileCalculation(bundle); expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics.some(item => item.code === (change === 'cycle' ? 'cycle' : 'missing-dependency'))).toBe(true);
    }
  });

  it('never resolves object prototype names as template outputs', () => {
    const result = compileCalculation(library()); expect(result.ok).toBe(true); if (!result.ok) return;
    expect(evaluateFormula(result.program, original.identity, {}, { outputs: ['constructor'] }).execution).toBe('invalid');
  });
});
