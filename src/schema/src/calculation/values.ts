import { z } from 'zod';
import { finiteSchema, idSchema, quantityUnitSchema } from '../common/values';

export const calculationUnitSchema = quantityUnitSchema;
export const definitionRefSchema = z.object({
  namespace: z.string().regex(/^(builtin|custom:[a-zA-Z0-9][a-zA-Z0-9._-]{0,159})$/),
  id: idSchema,
  revision: idSchema,
}).strict();
export const calculationQuantityTypeSchema = z.object({ kind: z.literal('quantity'), unit: calculationUnitSchema, integer: z.boolean().optional() }).strict()
  .refine(type => !['count', 'milliseconds'].includes(type.unit) || type.integer !== false, '次数和毫秒必须为整数。');
export const calculationValueTypeSchema = z.discriminatedUnion('kind', [
  calculationQuantityTypeSchema,
  z.object({ kind: z.literal('boolean') }).strict(),
  z.object({ kind: z.literal('enum'), values: z.array(idSchema).min(1).max(1000)
    .refine(values => new Set(values).size === values.length, '枚举值不得重复。') }).strict(),
]);
export const calculationValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('quantity'), unit: calculationUnitSchema, value: finiteSchema }).strict()
    .refine(value => !['count', 'milliseconds'].includes(value.unit) || (Number.isSafeInteger(value.value) && value.value >= 0), '次数和毫秒必须为非负安全整数。'),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }).strict(),
  z.object({ kind: z.literal('enum'), value: idSchema }).strict(),
]);

export type CalculationUnit = z.infer<typeof calculationUnitSchema>;
export type DefinitionRef = z.infer<typeof definitionRefSchema>;
export type ValueType = z.infer<typeof calculationValueTypeSchema>;
export type Value = z.infer<typeof calculationValueSchema>;

/** Identity and cache comparisons never resolve a missing revision to a newer one. */
export function definitionKey(reference: DefinitionRef): string {
  return JSON.stringify([reference.namespace, reference.id, reference.revision]);
}

export function valueMatchesType(value: Value, type: ValueType): boolean {
  if (type.kind === 'quantity') return value.kind === 'quantity' && value.unit === type.unit
    && (!type.integer || Number.isSafeInteger(value.value));
  if (type.kind === 'enum') return value.kind === 'enum' && type.values.includes(value.value);
  return value.kind === 'boolean';
}

export function sameValueType(left: ValueType, right: ValueType): boolean {
  if (left.kind === 'quantity') return right.kind === 'quantity' && left.unit === right.unit;
  if (left.kind === 'enum') return right.kind === 'enum' && left.values.length === right.values.length
    && left.values.every(value => right.values.includes(value));
  return right.kind === 'boolean';
}

export function valueTypeAssignable(actual: ValueType, expected: ValueType): boolean {
  if (actual.kind === 'enum') return expected.kind === 'enum' && actual.values.every(value => expected.values.includes(value));
  return sameValueType(actual, expected);
}
