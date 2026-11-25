import { z } from 'zod';
import { finiteSchema, idSchema } from '../common/values';
import { elements } from '../content/stats';
import { attackTypeSchema } from '../content/effects';
import { calculationBindingSchema } from './binding';
import { buffEventSelectorSchema } from './event';
import { calculationValueTypeSchema, definitionRefSchema, valueMatchesType } from './values';

export const teamHealthCounterSchema = z.object({
  fact: idSchema, change: idSchema, perRatio: finiteSchema.positive(), cap: finiteSchema.positive(),
  overflowFact: idSchema.optional(),
  bonuses: z.array(z.object({ constellation: z.number().int().min(1).max(6), initial: finiteSchema.nonnegative().optional(),
    extraCap: finiteSchema.nonnegative().optional(), gainFactor: finiteSchema.positive().optional() }).strict()).max(6),
}).strict();
export const calculationHitSelectorSchema = z.object({
  skillIds: z.array(idSchema).min(1).max(1000).optional(), hitIds: z.array(idSchema).min(1).max(1000).optional(),
  excludeHitIds: z.array(idSchema).min(1).max(1000).optional(),
  elements: z.array(z.enum(elements)).min(1).max(8).optional(),
  categories: z.array(attackTypeSchema).min(1).max(attackTypeSchema.options.length).optional(),
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
  identity: definitionRefSchema, buff: definitionRefSchema.optional(), sources: z.array(idSchema).min(1).max(1000),
  activation: z.object({ elements:z.array(z.enum(elements)).min(1).max(8).optional(), weaponTypes: z.array(idSchema).min(1).max(5).optional(),
    characterGameIds: z.array(z.number().int().positive()).min(1).max(32).optional(), ascension: z.number().int().min(0).max(6).optional(), constellation: z.number().int().min(0).max(6).optional(),
    refinement: z.number().int().min(1).max(5).optional(), set: z.object({ id: idSchema, pieces: z.number().int().min(1).max(5) }).strict().optional() }).strict(),
  recipient: z.discriminatedUnion('role', [
    z.object({ role: z.literal('owner') }).strict(), z.object({ role: z.literal('team'), excludeOwner: z.boolean(),
      elements: z.array(z.enum(elements)).min(1).max(8).optional(), weaponTypes: z.array(idSchema).min(1).max(5).optional() }).strict(),
    z.object({ role: z.literal('fact-actor'), input: idSchema }).strict(), z.object({ role: z.literal('target') }).strict(),
  ]),
  trigger: z.discriminatedUnion('kind', [z.object({ kind: z.literal('permanent') }).strict(), z.object({ kind: z.literal('event'), selector: buffEventSelectorSchema,
    cooldownMs: z.number().int().positive().max(3600000).optional(), duringTeamInterval: idSchema.optional() }).strict()]),
  lifetime: z.discriminatedUnion('kind', [z.object({ kind: z.literal('permanent') }).strict(),
    z.object({ kind: z.literal('interval'), durationMs: z.number().int().positive().max(3600000), phase: z.enum(['before', 'after']) }).strict()]),
  counter: teamHealthCounterSchema.optional(),
  windowFact: idSchema.optional(),
  charges: z.object({ perRecipient: z.number().int().positive().max(1000), categories: calculationHitSelectorSchema.shape.categories.unwrap() }).strict().optional(),
  predicate: calculationBindingSchema.optional(), value: calculationBindingSchema, extraAttack: z.literal(true).optional(),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('attribute'), attribute: definitionRefSchema }).strict(),
    z.object({ kind: z.literal('port'), formula: definitionRefSchema, port: idSchema }).strict(),
  ]),
  appliesTo: calculationHitSelectorSchema,
  application: z.enum(['always', 'explicit', 'observed']), priority: z.number().int().safe(),
  stacking: z.object({ group: idSchema, scope: z.enum(['owner', 'recipient', 'team']), policy: z.enum(['add', 'replace', 'max']),
    maxStacks: z.number().int().min(1).max(10000), retain: z.enum(['earliest', 'latest', 'highest-priority']),
    crossOwnerUnverified: z.literal(true).optional(),
    crossOwnerAdditiveGroup: idSchema.optional(),
    refreshUnverified: z.literal(true).optional(),
    endOnNewTrigger: z.literal(true).optional() }).strict(),
}).strict().superRefine((effect, context) => {
  if (effect.stacking.crossOwnerAdditiveGroup && effect.target.kind !== 'attribute') context.addIssue({
    code: 'custom', path: ['stacking', 'crossOwnerAdditiveGroup'], message: '加法叠加组只能用于属性效果。',
  });
  if (effect.extraAttack && (effect.target.kind !== 'attribute' || effect.target.attribute.id !== 'attribute.attack')) {
    context.addIssue({ code: 'custom', path: ['extraAttack'], message: '额外攻击力贡献须指向攻击力。' });
  }
  if (effect.windowFact && effect.trigger.kind !== 'event') context.addIssue({ code: 'custom', path: ['windowFact'], message: '已确认的窗口须对应限时增益。' });
  if ((effect.trigger.kind === 'permanent') !== (effect.lifetime.kind === 'permanent')) context.addIssue({ code: 'custom', path: ['lifetime'], message: '常驻与事件区间的触发/时效必须一致。' });
  if (effect.stacking.policy === 'replace' && effect.stacking.maxStacks !== 1) context.addIssue({ code: 'custom', path: ['stacking'], message: '替换规则只能保留一个实例。' });
  if (effect.stacking.refreshUnverified && (effect.trigger.kind !== 'event' || effect.lifetime.kind !== 'interval'
    || effect.stacking.scope !== 'owner' || effect.stacking.policy !== 'add' || effect.stacking.retain !== 'latest' || effect.stacking.maxStacks < 2)) {
    context.addIssue({ code: 'custom', path: ['stacking'], message: '叠层刷新待核对须对应同一持有者的限时叠加效果。' });
  }
  if (effect.stacking.endOnNewTrigger && (effect.trigger.kind !== 'event' || effect.stacking.policy !== 'replace' || effect.stacking.retain !== 'latest' || effect.stacking.scope === 'recipient')) context.addIssue({ code: 'custom', path: ['stacking'], message: '新触发结束旧实例需使用持有者或全队的最近一次替换规则。' });
});
export type AttributeDefinition = z.infer<typeof attributeDefinitionSchema>;
export type EffectDefinition = z.infer<typeof effectDefinitionSchema>;
export type CalculationHitSelector = z.infer<typeof calculationHitSelectorSchema>;
