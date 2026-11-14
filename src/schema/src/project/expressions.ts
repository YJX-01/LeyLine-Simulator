import { z } from 'zod';
import { idSchema,millisecondsSchema,quantitySchema,quantityUnitSchema,supportSchema } from '../common/values';
import { attackTypeSchema } from '../content/effects';
import { elements } from '../content/stats';
export const expressionNodeSchema = z.discriminatedUnion('op', [
  z.object({ id: idSchema, op: z.literal('attribute'), actor: idSchema.optional(), key: idSchema, unit: quantityUnitSchema, at: idSchema.optional(), phase: z.enum(['before', 'after']).optional() }).strict(),
  z.object({ id: idSchema, op: z.literal('capture'), at: idSchema, value: idSchema, phase: z.enum(['before', 'after']).optional() }).strict(),
  z.object({ id: idSchema, op: z.literal('history'), mode: z.enum(['sum', 'count']), startMs: millisecondsSchema, endMs: millisecondsSchema, actor: idSchema.optional(), definition: idSchema.optional(), initial: z.number().finite().optional(), cap: z.number().finite().nonnegative().optional(), resetAt: z.array(idSchema).max(1000).optional(), includeCurrent: z.boolean().optional() }).strict(),
  z.object({ id: idSchema, op: z.literal('game-damage') }).strict(),
  z.object({ id: idSchema, op: z.literal('constant'), quantity: quantitySchema }).strict(),
  z.object({ id: idSchema, op: z.literal('input'), key: idSchema, unit: quantityUnitSchema }).strict(),
  z.object({ id: idSchema, op: z.literal('refinement'), values: z.array(z.number().finite()).length(5), unit: quantityUnitSchema }).strict(),
  z.object({ id: idSchema, op: z.literal('talent-parameter'), skillId: idSchema, parameter: idSchema, unit: quantityUnitSchema }).strict(),
  z.object({ id: idSchema, op: z.literal('combat-state'), actor: idSchema.optional(), field: z.enum(['hpRatio', 'onField', 'shielded']) }).strict(),
  z.object({ id: idSchema, op: z.enum(['add', 'subtract', 'multiply', 'divide', 'min', 'max']), left: idSchema, right: idSchema }).strict(),
  z.object({ id: idSchema, op: z.literal('compare'), comparison: z.enum(['lt', 'lte', 'gt', 'gte', 'eq']), left: idSchema, right: idSchema }).strict(),
  z.object({ id: idSchema, op: z.literal('select'), condition: idSchema, yes: idSchema, no: idSchema }).strict(),
  z.object({ id: idSchema, op: z.literal('condition'), key: idSchema, yes: idSchema, no: idSchema }).strict(),
  z.object({ id: idSchema, op: z.literal('unsupported'), capability: z.enum(['snapshot', 'history', 'probability']) }).strict(),
]);
export const hitFilterSchema = z.object({ skillId: idSchema.optional(), hitIndex: z.number().int().nonnegative().max(29).optional(),
  category: attackTypeSchema.optional(), element: z.enum(elements).optional() }).strict();
export const effectSchema = z.object({
  id: idSchema, startMs: millisecondsSchema, endMs: millisecondsSchema, value: idSchema, condition: idSchema.optional(),
  action: idSchema.optional(), recipient: idSchema.optional(), attribute: idSchema.optional(), unit: quantityUnitSchema.optional(),
  group: idSchema.optional(), policy: z.enum(['add', 'replace', 'stack']).optional(), maxStacks: z.number().int().min(1).max(1000).optional(),
  captureAt: z.enum(['dynamic', 'source']).optional(),
  permanent: z.literal(true).optional(),
  trigger: z.object({ kind: z.enum(['action', 'damage']), skillId: idSchema.optional(), category: z.enum(['normal', 'skill', 'burst']).optional() }).strict().optional(),
  appliesTo: hitFilterSchema.optional(),
  requiresApplication: z.literal(true).optional(),
}).strict().refine(e => e.endMs > e.startMs, 'Effect interval must be nonempty')
  .refine(e => !(e.action && e.trigger), 'Effect must use one trigger selector')
  .refine(e => !e.permanent || (!e.action && !e.trigger && e.captureAt !== 'source'), 'Permanent effects cannot use event triggers or captures');
export const ruleDefinitionSchema = z.object({
  id: idSchema, version: idSchema, name: idSchema.optional(),
  source: z.object({ kind: z.enum(['preset', 'user']), reference: idSchema, verified: z.boolean() }).strict(),
  support: supportSchema.optional(),
  nodes: z.array(expressionNodeSchema).max(1000), damage: idSchema.optional(), effects: z.array(effectSchema).max(1000),
}).strict();

export type ExpressionNode = z.infer<typeof expressionNodeSchema>;
export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>;

export function expressionReferences(node: ExpressionNode): string[] {
  if ('left' in node) return [node.left, node.right];
  if (node.op === 'select') return [node.condition, node.yes, node.no];
  if (node.op === 'condition') return [node.yes, node.no];
  return node.op === 'capture' ? [node.value] : [];
}

export function requiresDependencyDefinition(definition: RuleDefinition): boolean {
  return definition.nodes.some(node => ['attribute', 'capture', 'history', 'refinement', 'talent-parameter', 'combat-state'].includes(node.op))
    || definition.effects.some(effect => ['recipient', 'attribute', 'unit', 'group', 'policy', 'maxStacks', 'captureAt', 'trigger', 'appliesTo', 'permanent', 'requiresApplication'].some(key => Object.hasOwn(effect, key)));
}
