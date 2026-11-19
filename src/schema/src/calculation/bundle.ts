import { z } from 'zod';
import { idSchema } from '../common/values';
import { calculationValueSchema, calculationValueTypeSchema, definitionRefSchema, valueMatchesType } from './values';
import { formulaDefinitionSchema } from './template';
import { aggregateDefinitionSchema } from './aggregate';
import { attributeDefinitionSchema, effectDefinitionSchema } from './effect';
import { calculationSourceSchema } from './source';
import { calculationCoverageRecordSchema } from './coverage';
import { stateMachineDefinitionSchema } from './state-machine';
export { calculationSourceSchema, type SourceRecord } from './source';

export const calculationRuntimeFeatures = ['fixed-templates-v1', 'formula-call-v1', 'table-lookup-v1', 'modifier-port-v1', 'aggregate-v1', 'bound-aggregate-v1', 'event-state-v1', 'probability-enumeration-v1', 'combat-binding-v1', 'effect-v1', 'coverage-v1'] as const;

export const calculationTableSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('integer'), identity: definitionRefSchema, start: z.number().int().nonnegative().safe(),
    valueType: calculationValueTypeSchema, values: z.array(calculationValueSchema.nullable()).min(1).max(10000), sources: z.array(idSchema).min(1).max(1000) }).strict(),
  z.object({ kind: z.literal('enum'), identity: definitionRefSchema, keys: z.array(idSchema).min(1).max(10000),
    valueType: calculationValueTypeSchema, values: z.record(idSchema, calculationValueSchema.nullable()), sources: z.array(idSchema).min(1).max(1000) }).strict(),
]).superRefine((table, context) => {
  if (table.kind === 'integer' && !Number.isSafeInteger(table.start + table.values.length - 1)) {
    context.addIssue({ code: 'custom', path: ['start'], message: '表索引超出安全整数范围。' });
  }
  if (table.kind === 'enum' && (new Set(table.keys).size !== table.keys.length || Object.keys(table.values).length !== table.keys.length
    || table.keys.some(key => !Object.hasOwn(table.values, key)))) context.addIssue({ code: 'custom', path: ['keys'], message: '枚举表的键必须唯一并完整匹配数值项。' });
  const entries = table.kind === 'integer' ? table.values.entries() : Object.entries(table.values);
  for (const [key, value] of entries) if (value !== null && !valueMatchesType(value, table.valueType)) {
    context.addIssue({ code: 'custom', path: ['values', key], message: '表值不符合声明类型。' });
  }
});

/** Portable data definitions; algorithms and event-state operations are fixed by the runtime. */
export const calculationBundleSchema = z.object({
  schemaVersion: z.literal(2), runtimeVersion: z.literal(2),
  requiredFeatures: z.array(idSchema).max(100).refine(features => new Set(features).size === features.length, '运行能力声明重复。'),
  sources: z.array(calculationSourceSchema).max(20000),
  tables: z.array(calculationTableSchema).max(1000),
  formulas: z.array(formulaDefinitionSchema).max(20000),
  attributes: z.array(attributeDefinitionSchema).max(10000), effects: z.array(effectDefinitionSchema).max(10000),
  damageFamilies: z.array(idSchema).max(1000).refine(families => new Set(families).size === families.length, '伤害族标识重复。').optional(),
  stateMachines: z.array(stateMachineDefinitionSchema).max(1000), aggregates: z.array(aggregateDefinitionSchema).max(1000), coverage: z.array(calculationCoverageRecordSchema).max(10000),
}).strict();

export type TableDefinition = z.infer<typeof calculationTableSchema>;
export type CalculationBundle = z.infer<typeof calculationBundleSchema>;
