import { z } from 'zod';
import { idSchema } from '../common/values';
import { boundFormulaSchema } from './binding';
import { combatFrameSchema } from './context';
import { aggregateRequestSchema } from './aggregate';
import { boundAggregateRequestSchema } from './bound-aggregate';

export const calculationSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('output'), eventId: idSchema, outputId: idSchema }).strict(),
  z.object({ kind: z.literal('event-total'), eventId: idSchema }).strict(),
]);
export const inventoryAllocationSchema = z.object({ actorId: idSchema, artifacts: z.array(z.object({
  slot: z.enum(['flower', 'plume', 'sands', 'goblet', 'circlet']), inventoryAccountId: idSchema.nullable(), inventoryItemId: idSchema.nullable(),
}).strict()).max(5) }).strict().superRefine((allocation, validation) => {
  if (new Set(allocation.artifacts.map(item => item.slot)).size !== allocation.artifacts.length) validation.addIssue({ code: 'custom', path: ['artifacts'], message: '同一队员装备部位重复。' });
  const identities = allocation.artifacts.filter(item => item.inventoryAccountId !== null && item.inventoryItemId !== null).map(item => JSON.stringify([item.inventoryAccountId, item.inventoryItemId]));
  if (new Set(identities).size !== identities.length) validation.addIssue({ code: 'custom', path: ['artifacts'], message: '同一队员不能将同一库存物品用于多个部位。' });
});
export const inventoryAllocationsSchema = z.array(inventoryAllocationSchema).max(1000)
  .refine(allocations => new Set(allocations.map(allocation => allocation.actorId)).size === allocations.length, '装备占用队员身份重复。');

export const damageOccurrenceSchema = z.object({
  eventId: idSchema, outputId: idSchema, actorId: idSchema.nullable(), contributorIds: z.array(idSchema).max(10000), family: idSchema,
  computation: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('formula'), invocation: boundFormulaSchema, frame: combatFrameSchema }).strict(),
    z.object({ kind: z.literal('aggregate'), request: aggregateRequestSchema }).strict(),
    z.object({ kind: z.literal('bound-aggregate'), request: boundAggregateRequestSchema }).strict(),
  ]),
}).strict().superRefine((output, validation) => {
  if (new Set(output.contributorIds).size !== output.contributorIds.length) validation.addIssue({ code: 'custom', path: ['contributorIds'], message: '参与队员不得重复。' });
  if (output.computation.kind === 'formula') {
    const { frame } = output.computation;
    if (output.actorId !== frame.ownerId || output.eventId !== frame.eventId || frame.hit && frame.hit.family !== output.family) validation.addIssue({ code: 'custom', path: ['computation', 'frame'], message: '公式读取帧与输出归属不一致。' });
  } else {
    const ids = output.computation.request.contributors.map(contributor => contributor.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify([...output.contributorIds].sort())) validation.addIssue({ code: 'custom', path: ['contributorIds'], message: '聚合参与队员必须与明确请求完全一致。' });
  }
});
export const damageQuerySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hit'), output: damageOccurrenceSchema, inventoryAllocations: inventoryAllocationsSchema.optional() }).strict()
    .refine(query => query.output.computation.kind === 'formula' && query.output.computation.frame.hit !== null
      && query.output.computation.frame.hit.origin !== 'reaction' && query.output.computation.frame.hit.hitId !== null,
    '技能命中请求必须引用技能公式输出。'),
  z.object({ kind: z.literal('event'), eventId: idSchema, outputs: z.array(damageOccurrenceSchema).max(10000), inventoryAllocations: inventoryAllocationsSchema.optional() }).strict()
    .superRefine((query, validation) => {
      if (new Set(query.outputs.map(output => output.outputId)).size !== query.outputs.length || query.outputs.some(output => output.eventId !== query.eventId)) validation.addIssue({ code: 'custom', path: ['outputs'], message: '事件输出须有唯一身份，且属于该事件。' });
    }),
]);
export type CalculationSelection = z.infer<typeof calculationSelectionSchema>;
export type InventoryAllocation = z.infer<typeof inventoryAllocationSchema>;
export type DamageOccurrence = z.infer<typeof damageOccurrenceSchema>;
export type DamageQuery = z.infer<typeof damageQuerySchema>;
