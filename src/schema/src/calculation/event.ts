import { z } from 'zod';
import { attackTypeSchema } from '../content/effects';
import { idSchema, millisecondsSchema } from '../common/values';
import { calculationFactSchema, type CalculationFact } from './binding';
import { hitFactsSchema } from '../project/hit-facts';
import { definitionRefSchema } from './values';
import { elements } from '../content/stats';

export const confirmedBuffSchema = definitionRefSchema.extend({ remainingMs: millisecondsSchema.positive().optional() });
export const combatObservationUnits = { hpRatioChange:'scalar', damageTaken:'hp', healingDone:'hp', healingReceived:'hp', bondOfLifeChange:'hp', nightsoulChange:'scalar', nightsoulBurst:'boolean', shieldCreated:'boolean' } as const;
export type CombatObservation = keyof typeof combatObservationUnits;
export function validateCombatObservations(kind:string, facts:Record<string,CalculationFact>|undefined, validation:z.RefinementCtx, path:(string|number)[] = []) {
  if (!facts) return;
  for (const [key,unit] of Object.entries(combatObservationUnits)) {
    const fact=facts[key];
    if (!fact) continue;
    const value=fact.value;
    if (kind !== 'state-change' || value && (unit === 'boolean' ? value.kind !== 'boolean'
      : value.kind !== 'quantity' || value.unit !== unit || key === 'hpRatioChange' && Math.abs(value.value)>1
        || ['healingDone','healingReceived','damageTaken'].includes(key) && value.value<0)) {
      validation.addIssue({code:'custom',path:[...path,'facts',key],message:'战斗状态变化的记录类型、单位或数值范围不符。'});
    }
  }
}
export const auraObservationSchema = z.object({ element:z.enum(['pyro','hydro','cryo','electro']), baseDurationMs:millisecondsSchema }).strict();
export type AuraObservation = z.infer<typeof auraObservationSchema>;
export const calculationEventSchema = z.object({
  id: idSchema, kind: z.enum(['action', 'hit', 'reaction', 'capture', 'state-change']),
  occurred: z.boolean().nullable().optional(),
  confirmedBuff: confirmedBuffSchema.optional(),
  derivedStates: z.object({ before: z.record(idSchema,z.record(idSchema,calculationFactSchema)), after: z.record(idSchema,z.record(idSchema,calculationFactSchema)) }).strict().optional(),
  actionId: idSchema.optional(),
  actorId: idSchema.nullable(), targetIds: z.array(idSchema).max(10000).nullable(),
  timeMs: millisecondsSchema, order: z.number().int().nonnegative().safe(),
  skillId: idSchema.optional(), hitId: idSchema.optional(), category: attackTypeSchema.optional(),
  applications: z.array(z.object({ instanceId: z.string(), active: z.boolean().nullable() }).strict()).optional(),
  reactionId: idSchema.optional(), reactionElement: z.enum(elements).optional(), sourceEventIds: z.array(idSchema).max(1000), facts: z.record(idSchema, calculationFactSchema),
  subjectFacts: hitFactsSchema.refine(rows => rows.every(row => row.subject.kind !== 'event'), '事件字段须存入事件事实。').optional(),
}).strict().superRefine((event, context) => {
  validateCombatObservations(event.kind,event.facts,context);
  if (event.targetIds && new Set(event.targetIds).size !== event.targetIds.length) context.addIssue({ code: 'custom', path: ['targetIds'], message: '事件目标不得重复。' });
  if (new Set(event.sourceEventIds).size !== event.sourceEventIds.length || event.sourceEventIds.includes(event.id)) context.addIssue({ code: 'custom', path: ['sourceEventIds'], message: '事件来源不得重复或引用自身。' });
});
export const calculationEventSelectorSchema = z.object({
  kinds: z.array(z.enum(['action', 'hit', 'reaction', 'capture', 'state-change'])).min(1).max(5),
  actionIds: z.array(idSchema).min(1).max(1000).optional(),
  actor: z.enum(['owner', 'any']), target: z.enum(['query', 'any', 'enemy']),
  skillIds: z.array(idSchema).min(1).max(1000).optional(), hitIds: z.array(idSchema).min(1).max(1000).optional(),
  categories: z.array(attackTypeSchema).min(1).max(attackTypeSchema.options.length).optional(),
  allowZeroDamage: z.literal(true).optional(),
  reactionIds: z.array(idSchema).min(1).max(1000).optional(),
  reactionElements: z.record(idSchema,z.array(z.enum(elements)).min(1).max(elements.length)).optional(),
  observation: z.object({ key: idSchema, test: z.enum(['true', 'increase', 'decrease', 'change']) }).strict().optional(),
}).strict();
export type CalculationEvent = z.infer<typeof calculationEventSchema>;
export type CalculationEventSelector = z.infer<typeof calculationEventSelectorSchema>;

export const buffEventSelectorSchema = z.union([calculationEventSelectorSchema, z.array(calculationEventSelectorSchema).min(2).max(32)]);
export function buffEventSelectors(selector: z.infer<typeof buffEventSelectorSchema>): CalculationEventSelector[] {
  return Array.isArray(selector) ? selector : [selector];
}
