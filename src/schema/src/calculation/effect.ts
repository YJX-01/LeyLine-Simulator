import { z } from 'zod';
import { finiteSchema, idSchema } from '../common/values';
import { elements } from '../content/stats';
import { calculationBindingSchema } from './binding';
import { calculationEventSelectorSchema } from './event';
import { calculationValueTypeSchema, definitionRefSchema, valueMatchesType } from './values';

export const calculationHitSelectorSchema = z.object({
  skillIds: z.array(idSchema).min(1).max(1000).optional(), hitIds: z.array(idSchema).min(1).max(1000).optional(),
  elements: z.array(z.enum(elements)).min(1).max(8).optional(),
  categories: z.array(z.enum(['normal', 'charged', 'plunge', 'skill', 'burst'])).min(1).max(5).optional(),
  families: z.array(idSchema).min(1).max(1000).optional(), origins: z.array(z.enum(['talent', 'reaction', 'triggered'])).min(1).max(3).optional(),
  reactionIds: z.array(idSchema).min(1).max(1000).optional(),
}).strict();

export const attributeDefinitionSchema = z.object({
  identity: definitionRefSchema, type: calculationValueTypeSchema,
  scope: z.enum(['actor', 'target', 'team', 'hit', 'contributor']),
  base: z.union([z.object({ kind: z.literal('input'), key: idSchema }).strict(), calculationBindingSchema]),
  combine: z.enum(['sum', 'product', 'max', 'replace']),
  bounds: z.object({ min: finiteSchema.optional(), max: finiteSchema.optional() }).strict().optional(),
  sources: z.array(idSchema).min(1).max(1000),
}).strict().superRefine((attribute, context) => {
  if (attribute.combine !== 'replace' && attribute.type.kind !== 'quantity') context.addIssue({ code: 'custom', path: ['combine'], message: '数值合并属性必须是数量。' });
  if (attribute.combine === 'product' && (attribute.type.kind !== 'quantity' || attribute.type.unit !== 'scalar')) context.addIssue({ code: 'custom', path: ['combine'], message: '相乘属性必须为无量纲数量。' });
  if (attribute.bounds && (attribute.type.kind !== 'quantity' || attribute.bounds.min !== undefined && attribute.bounds.max !== undefined && attribute.bounds.min > attribute.bounds.max)) context.addIssue({ code: 'custom', path: ['bounds'], message: '属性范围无效。' });
  if (attribute.base.kind === 'constant' && !valueMatchesType(attribute.base.value, attribute.type)) context.addIssue({ code: 'custom', path: ['base'], message: '基础常量与属性类型不匹配。' });
});

export const effectDefinitionSchema = z.object({
  identity: definitionRefSchema, sources: z.array(idSchema).min(1).max(1000),
  activation: z.object({ ascension: z.number().int().min(0).max(6).optional(), constellation: z.number().int().min(0).max(6).optional(),
    refinement: z.number().int().min(1).max(5).optional(), set: z.object({ id: idSchema, pieces: z.number().int().min(1).max(5) }).strict().optional() }).strict(),
  recipient: z.discriminatedUnion('role', [
    z.object({ role: z.literal('owner') }).strict(), z.object({ role: z.literal('team'), excludeOwner: z.boolean() }).strict(),
    z.object({ role: z.literal('fact-actor'), input: idSchema }).strict(), z.object({ role: z.literal('target') }).strict(),
  ]),
  trigger: z.discriminatedUnion('kind', [z.object({ kind: z.literal('permanent') }).strict(), z.object({ kind: z.literal('event'), selector: calculationEventSelectorSchema }).strict()]),
  lifetime: z.discriminatedUnion('kind', [z.object({ kind: z.literal('permanent') }).strict(),
    z.object({ kind: z.literal('interval'), durationMs: z.number().int().positive().max(3600000), phase: z.enum(['before', 'after']) }).strict()]),
  predicate: calculationBindingSchema.optional(), value: calculationBindingSchema,
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('attribute'), attribute: definitionRefSchema }).strict(),
    z.object({ kind: z.literal('port'), formula: definitionRefSchema, port: idSchema }).strict(),
  ]),
  appliesTo: calculationHitSelectorSchema,
  application: z.enum(['always', 'explicit']), priority: z.number().int().safe(),
  stacking: z.object({ group: idSchema, scope: z.enum(['owner', 'recipient', 'team']), policy: z.enum(['add', 'replace', 'max']),
    maxStacks: z.number().int().min(1).max(10000), retain: z.enum(['earliest', 'latest', 'highest-priority']) }).strict(),
}).strict().superRefine((effect, context) => {
  if ((effect.trigger.kind === 'permanent') !== (effect.lifetime.kind === 'permanent')) context.addIssue({ code: 'custom', path: ['lifetime'], message: '常驻与事件区间的触发/时效必须一致。' });
  if (effect.stacking.policy === 'replace' && effect.stacking.maxStacks !== 1) context.addIssue({ code: 'custom', path: ['stacking'], message: '替换规则只能保留一个实例。' });
});
export type AttributeDefinition = z.infer<typeof attributeDefinitionSchema>;
export type EffectDefinition = z.infer<typeof effectDefinitionSchema>;
export type CalculationHitSelector = z.infer<typeof calculationHitSelectorSchema>;
