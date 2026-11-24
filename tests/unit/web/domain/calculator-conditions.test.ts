import { describe, expect, it } from 'vitest';
import type { CalculationBinding, CalculationBundle, DamageRequest, Value } from '@leyline/schema';
import { selectionEnumFallback, type CalculatorFactField } from '../../../../src/web/src/domain/calculator-conditions';

const ref = (id: string) => ({ namespace: 'test', id, revision: '1' });
const values = ['none', 'stellar-conduct', 'stellar-swirl'];
const type = { kind: 'enum', values } as const;
const subject = { kind: 'actor', id: 'actor' } as const;
const fact: CalculationBinding = { kind: 'fact', key: 'radiance', scope: 'owner', type };
const equality: CalculationBinding = { kind: 'formula', formula: ref('equals'), output: 'value', inputs: { mode: fact } };
const predicate: CalculationBinding = { kind: 'formula', formula: ref('not'), output: 'value', inputs: { term: equality } };
const bundle = { formulas: [
  { identity: ref('equals'), template: { id: 'enum-condition', revision: '1', input: 'mode', values, equals: 'none' } },
  { identity: ref('not'), template: { id: 'condition-group', revision: '1', operator: 'all', terms: 1, negate: true } },
  { identity: ref('both'), template: { id: 'condition-group', revision: '1', operator: 'all', terms: 2, negate: false } },
] } as CalculationBundle;
const enumValue = (value: string): Value => ({ kind: 'enum', value });
const field = (inherited?: Value): CalculatorFactField => ({ key: 'radiance', type, subject, inherited });
const facts = (value: string): DamageRequest['facts'] => [{ subject, values: {
  radiance: { value: enumValue(value), provenance: 'explicit', sourceRefs: [] },
} }];
const select = (binding: CalculationBinding, inherited?: Value, current?: string) =>
  selectionEnumFallback(binding, bundle, [field(inherited)], current ? facts(current) : undefined, 'actor');

describe('selectionEnumFallback', () => {
  it('uses an applicable inherited stellar swirl', () => {
    expect(select(predicate, enumValue('stellar-swirl'))).toEqual([{ key: 'radiance', subject, value: enumValue('stellar-swirl') }]);
  });

  it('replaces an excluded old none when selecting a new hit', () => {
    expect(select(predicate, undefined, 'none')).toEqual([{ key: 'radiance', subject, value: enumValue('stellar-conduct') }]);
  });

  it('does not treat a partial result from a compound predicate as a single exclusion', () => {
    const compound: CalculationBinding = { kind: 'formula', formula: ref('both'), output: 'value', inputs: {
      first: predicate, second: { kind: 'constant', value: { kind: 'boolean', value: true } },
    } };
    expect(select(compound)).toEqual([]);
  });
});
