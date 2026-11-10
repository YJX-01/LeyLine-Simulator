import { z } from 'zod';
import { idSchema,millisecondsSchema,quantitySchema,quantityUnitSchema } from '../common/values';
export const expressionNodeSchema = z.discriminatedUnion('op', [
  z.object({ id: idSchema, op: z.literal('attribute'), actor: idSchema.optional(), key: idSchema, unit: quantityUnitSchema, at: idSchema.optional(), phase: z.enum(['before', 'after']).optional() }).strict(),
  z.object({ id: idSchema, op: z.literal('capture'), at: idSchema, value: idSchema, phase: z.enum(['before', 'after']).optional() }).strict(),
  z.object({ id: idSchema, op: z.literal('history'), mode: z.enum(['sum', 'count']), startMs: millisecondsSchema, endMs: millisecondsSchema, actor: idSchema.optional(), definition: idSchema.optional(), initial: z.number().finite().optional(), cap: z.number().finite().nonnegative().optional(), resetAt: z.array(idSchema).max(1000).optional(), includeCurrent: z.boolean().optional() }).strict(),
  z.object({ id: idSchema, op: z.literal('game-damage') }).strict(),
  z.object({ id: idSchema, op: z.literal('constant'), quantity: quantitySchema }).strict(),
  z.object({ id: idSchema, op: z.literal('input'), key: idSchema, unit: quantityUnitSchema }).strict(),
  z.object({ id: idSchema, op: z.enum(['add', 'multiply', 'divide']), left: idSchema, right: idSchema }).strict(),
  z.object({ id: idSchema, op: z.literal('condition'), key: idSchema, yes: idSchema, no: idSchema }).strict(),
  z.object({ id: idSchema, op: z.literal('unsupported'), capability: z.enum(['snapshot', 'history', 'probability']) }).strict(),
]);
export const effectSchema = z.object({
  id: idSchema, startMs: millisecondsSchema, endMs: millisecondsSchema, value: idSchema, condition: idSchema.optional(),
  action: idSchema.optional(), recipient: idSchema.optional(), attribute: idSchema.optional(), unit: quantityUnitSchema.optional(),
  group: idSchema.optional(), policy: z.enum(['add', 'replace', 'stack']).optional(), maxStacks: z.number().int().min(1).max(1000).optional(),
  captureAt: z.enum(['dynamic', 'source']).optional(),
}).strict().refine(e => e.endMs > e.startMs, 'Effect interval must be nonempty');
export const ruleDefinitionSchema = z.object({
  id: idSchema, version: idSchema, name: idSchema.optional(),
  source: z.object({ kind: z.enum(['preset', 'user']), reference: idSchema, verified: z.boolean() }).strict(),
  nodes: z.array(expressionNodeSchema).max(1000), damage: idSchema.optional(), effects: z.array(effectSchema).max(1000),
}).strict();

export type ExpressionNode = z.infer<typeof expressionNodeSchema>;
export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>;
