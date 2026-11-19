import { z } from 'zod';
import { idSchema, millisecondsSchema } from '../common/values';
import { calculationFactSchema } from './binding';

export const calculationEventSchema = z.object({
  id: idSchema, kind: z.enum(['action', 'hit', 'reaction', 'capture', 'state-change']),
  actionId: idSchema.optional(),
  actorId: idSchema.nullable(), targetIds: z.array(idSchema).max(10000).nullable(),
  timeMs: millisecondsSchema, order: z.number().int().nonnegative().safe(),
  skillId: idSchema.optional(), hitId: idSchema.optional(), category: z.enum(['normal', 'charged', 'plunge', 'skill', 'burst']).optional(),
  reactionId: idSchema.optional(), sourceEventIds: z.array(idSchema).max(1000), facts: z.record(idSchema, calculationFactSchema),
}).strict().superRefine((event, context) => {
  if (event.targetIds && new Set(event.targetIds).size !== event.targetIds.length) context.addIssue({ code: 'custom', path: ['targetIds'], message: '事件目标不得重复。' });
  if (new Set(event.sourceEventIds).size !== event.sourceEventIds.length || event.sourceEventIds.includes(event.id)) context.addIssue({ code: 'custom', path: ['sourceEventIds'], message: '事件来源不得重复或引用自身。' });
});
export const calculationEventSelectorSchema = z.object({
  kinds: z.array(z.enum(['action', 'hit', 'reaction', 'capture', 'state-change'])).min(1).max(5),
  actionIds: z.array(idSchema).min(1).max(1000).optional(),
  actor: z.enum(['owner', 'any']), target: z.enum(['query', 'any']),
  skillIds: z.array(idSchema).min(1).max(1000).optional(), hitIds: z.array(idSchema).min(1).max(1000).optional(),
  categories: z.array(z.enum(['normal', 'charged', 'plunge', 'skill', 'burst'])).min(1).max(5).optional(),
  reactionIds: z.array(idSchema).min(1).max(1000).optional(),
}).strict();
export type CalculationEvent = z.infer<typeof calculationEventSchema>;
export type CalculationEventSelector = z.infer<typeof calculationEventSelectorSchema>;
