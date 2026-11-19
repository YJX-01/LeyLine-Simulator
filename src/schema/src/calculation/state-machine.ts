import { z } from 'zod';
import { finiteSchema, idSchema, millisecondsSchema } from '../common/values';
import { boundFormulaSchema } from './binding';
import { calculationEventSelectorSchema } from './event';
import { calculationValueSchema, calculationValueTypeSchema, definitionRefSchema, valueMatchesType } from './values';

export const stateValueSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('literal'), value: calculationValueSchema }).strict(),
  z.object({ kind: z.literal('formula'), invocation: boundFormulaSchema }).strict(),
  z.object({ kind: z.literal('input'), key: idSchema, type: calculationValueTypeSchema, scope: z.enum(['event', 'owner']) }).strict(),
]);
export const stateVariableSchema = z.object({
  key: idSchema, type: calculationValueTypeSchema, kind: z.enum(['value', 'stacked']), inactiveValue: calculationValueSchema,
  capacity: finiteSchema.nonnegative().max(10000).nullable(), knownCapacityFloor: finiteSchema.nonnegative().max(10000).optional(),
  duration: stateValueSourceSchema.optional(), overflow: z.enum(['retain-latest', 'unknown']),
  expireUpdates: z.array(z.object({ state: idSchema }).strict()).max(1000),
}).strict().superRefine((state, validation) => {
  if (!valueMatchesType(state.inactiveValue, state.type)) validation.addIssue({ code: 'custom', path: ['inactiveValue'], message: '过期值与状态类型不符。' });
  if (state.kind === 'stacked' && (state.type.kind !== 'quantity' || state.type.unit !== 'count' || !Number.isSafeInteger(state.capacity) || !state.capacity || !state.duration)) validation.addIssue({ code: 'custom', message: '独立层数须有整数上限及每层时效。' });
  if (state.kind === 'stacked' && (state.inactiveValue.kind !== 'quantity' || state.inactiveValue.value !== 0)) validation.addIssue({ code: 'custom', path: ['inactiveValue'], message: '独立层数清除后必须为零。' });
  if (state.type.kind !== 'quantity' && (state.capacity !== null || state.knownCapacityFloor !== undefined)) validation.addIssue({ code: 'custom', path: ['capacity'], message: '非数量状态不声明数量上限。' });
  if (state.type.kind === 'quantity' && state.capacity === null && state.knownCapacityFloor === undefined) validation.addIssue({ code: 'custom', path: ['capacity'], message: '数量上限未知时须明确给出已核验的容量下界，不能视为无限资源。' });
  if (state.type.kind === 'quantity' && state.type.unit === 'count' && (state.capacity !== null && !Number.isSafeInteger(state.capacity) || state.knownCapacityFloor !== undefined && !Number.isSafeInteger(state.knownCapacityFloor))) validation.addIssue({ code: 'custom', path: ['capacity'], message: '次数上限须为安全整数。' });
  if (state.capacity !== null && state.knownCapacityFloor !== undefined && state.knownCapacityFloor > state.capacity) validation.addIssue({ code: 'custom', path: ['knownCapacityFloor'], message: '已知容量下界超过上限。' });
});
export const stateMachineDefinitionSchema = z.object({
  identity: definitionRefSchema, template: z.object({ id: z.literal('event-state'), revision: z.literal('1') }).strict(),
  sources: z.array(idSchema).min(1).max(1000), states: z.array(stateVariableSchema).min(1).max(1000),
  requirements: z.array(z.object({ id: idSchema, selector: calculationEventSelectorSchema, predicate: boundFormulaSchema }).strict()).max(1000),
  transitions: z.array(z.object({
    id: idSchema, selector: calculationEventSelectorSchema, phase: z.enum(['before', 'after']), priority: z.number().int().safe(),
    activation: z.object({ ascension: z.number().int().min(0).max(6).optional(), constellation: z.number().int().min(0).max(6).optional() }).strict(),
    predicate: boundFormulaSchema.optional(),
    updates: z.array(z.object({ state: idSchema, operation: z.enum(['set', 'add', 'consume', 'clear', 'unknown']), value: stateValueSourceSchema.optional() }).strict()
      .refine(update => ['clear', 'unknown'].includes(update.operation) === (update.value === undefined), '清除及明确缺口不提供数值；其他更新必须提供明确数值。')).min(1).max(1000),
  }).strict()).max(1000),
}).strict().superRefine((machine, validation) => {
  const states = new Map(machine.states.map(state => [state.key, state]));
  if (states.size !== machine.states.length || new Set(machine.transitions.map(transition => transition.id)).size !== machine.transitions.length
    || new Set(machine.requirements.map(requirement => requirement.id)).size !== machine.requirements.length) validation.addIssue({ code: 'custom', message: '状态、约束或转换身份重复。' });
  if (new Set(machine.transitions.map(transition => transition.phase + ':' + transition.priority)).size !== machine.transitions.length) validation.addIssue({ code: 'custom', path: ['transitions'], message: '同一阶段的转换顺序必须明确，不能用身份裁定。' });
  for (const [index, state] of machine.states.entries()) for (const update of state.expireUpdates) {
    const target = states.get(update.state);
    if (!target) validation.addIssue({ code: 'custom', path: ['states', index, 'expireUpdates'], message: '过期更新引用不存在。' });
  }
  for (const [index, transition] of machine.transitions.entries()) for (const update of transition.updates) {
    const state = states.get(update.state);
    if (!state || ['add', 'consume'].includes(update.operation) && state.type.kind !== 'quantity') validation.addIssue({ code: 'custom', path: ['transitions', index, 'updates'], message: '状态更新引用或运算类型不符。' });
    if (state?.kind === 'stacked' && update.operation === 'consume') validation.addIssue({ code: 'custom', path: ['transitions', index, 'updates'], message: '独立层数的逐层消耗顺序尚未声明；可使用明确的清除或重新设置。' });
    if (state && update.value?.kind === 'literal' && !valueMatchesType(update.value.value, state.type)) validation.addIssue({ code: 'custom', path: ['transitions', index, 'updates'], message: '状态更新数值单位不符。' });
  }
});
export const stateMachineRequestSchema = z.object({
  id: idSchema.max(80), definition: definitionRefSchema, ownerId: idSchema, targetId: idSchema, startMs: millisecondsSchema,
  initial: z.record(idSchema, z.object({ value: calculationValueSchema.nullable(), expiresAtMs: millisecondsSchema.nullable(),
    stackExpiries: z.array(millisecondsSchema.nullable()).max(10000).optional() }).strict()),
}).strict();
export type StateValueSource = z.infer<typeof stateValueSourceSchema>;
export type StateVariable = z.infer<typeof stateVariableSchema>;
export type StateMachineDefinition = z.infer<typeof stateMachineDefinitionSchema>;
export type StateMachineRequest = z.infer<typeof stateMachineRequestSchema>;
