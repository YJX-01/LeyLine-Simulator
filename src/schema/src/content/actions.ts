import { APP_VERSION } from '../version.mjs';
import { z } from 'zod';
import { idSchema, millisecondsSchema } from '../common/values';
import { calculationBundleSchema } from '../calculation/bundle';
import { definitionRefSchema } from '../calculation/values';

/** Optional companion to one exact character revision. Unknown timing is never zero delay. */
export const characterActionsDefinitionSchema = z.object({
  schemaVersion: z.literal(APP_VERSION), kind: z.literal('character-actions'), identity: definitionRefSchema, character: definitionRefSchema,
  sources: z.array(idSchema).min(1).max(1000),
  actions: z.array(z.object({
    id: idSchema, skillId: idSchema.nullable(),
    activation: z.object({ ascension: z.number().int().min(0).max(6).optional(), constellation: z.number().int().min(0).max(6).optional() }).strict(),
    durationMs: millisecondsSchema.nullable(), cancelAfterMs: millisecondsSchema.nullable(),
    hits: z.array(z.object({ skillId: idSchema, hitId: idSchema, outputIds: z.array(idSchema).min(1).max(1000),
      offsetsMs: z.array(millisecondsSchema.nullable()).min(1).max(1000) }).strict()).max(1000),
    sources: z.array(idSchema).min(1).max(1000),
  }).strict()).min(1).max(1000),
  calculation: z.object({ bundle: calculationBundleSchema, stateMachine: definitionRefSchema }).strict(),
  gaps: z.array(z.object({ id: idSchema, area: z.enum(['timing', 'resource', 'transition', 'observation']), sources: z.array(idSchema).min(1).max(1000) }).strict()).max(1000),
}).strict().superRefine((definition, validation) => {
  if (new Set(definition.actions.map(action => action.id)).size !== definition.actions.length) validation.addIssue({ code: 'custom', path: ['actions'], message: '动作身份重复。' });
  if (new Set(definition.gaps.map(gap => gap.id)).size !== definition.gaps.length) validation.addIssue({ code: 'custom', path: ['gaps'], message: '动作缺口身份重复。' });
  for (const [index, action] of definition.actions.entries()) {
    if (action.durationMs !== null && action.cancelAfterMs !== null && action.cancelAfterMs > action.durationMs) validation.addIssue({ code: 'custom', path: ['actions', index, 'cancelAfterMs'], message: '取消时点超出动作持续。' });
    if (new Set(action.hits.map(hit => JSON.stringify([hit.skillId, hit.hitId]))).size !== action.hits.length) validation.addIssue({ code: 'custom', path: ['actions', index, 'hits'], message: '动作命中身份重复。' });
    for (const [hitIndex, hit] of action.hits.entries()) {
      if (new Set(hit.outputIds).size !== hit.outputIds.length) validation.addIssue({ code: 'custom', path: ['actions', index, 'hits', hitIndex], message: '动作输出重复。' });
      if (action.durationMs !== null && hit.offsetsMs.some(offset => offset !== null && offset > action.durationMs!)) validation.addIssue({ code: 'custom', path: ['actions', index, 'hits', hitIndex], message: '命中偏移超出动作持续。' });
    }
  }
});
export type CharacterActionsDefinition = z.infer<typeof characterActionsDefinitionSchema>;
