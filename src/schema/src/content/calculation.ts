import { z } from 'zod';
import { attackTypeSchema } from './effects';
import { calculationBundleSchema } from '../calculation/bundle';
import { definitionKey, definitionRefSchema } from '../calculation/values';
import { reactionRulesSchema } from './reactions';
import { contentSourceSchema, idSchema } from '../common/values';
import { elements, statSchema } from './stats';
import { boundFormulaSchema, calculationBindingSchema } from '../calculation/binding';

export const structuredHitSchema = z.object({
  id: idSchema, name: idSchema, element: z.enum(elements), category: attackTypeSchema,
  critical: z.literal('always').optional(),
  reactions: z.literal(false).optional(),
  selection: z.object({
    kind: z.enum(['variant', 'source-event']).optional(),
    repetitions: z.number().int().min(2).max(100).optional(),
    minConstellation: z.number().int().min(1).max(6).optional(),
  }).strict().optional(),
  elementBy: z.enum(['absorbedElement', 'partyPriorityElement', 'strikingHand']).optional(),
  infusion: z.object({ fact:idSchema, element:z.enum(elements), minConstellation:z.number().int().min(1).max(6).optional() }).strict().optional(),
  coordinated: z.object({ dealer: z.literal('on-field'), readyFact: idSchema, cooldownMs: z.number().int().positive(),
    window: z.object({ duration: idSchema, charges: idSchema }).strict().optional() }).strict().optional(),
  snapshot: z.object({ sourceSkillId: idSchema, attributes: z.array(z.union([statSchema, z.literal('damageBonus')])).min(1).max(30), source: contentSourceSchema.optional() }).strict().optional(),
  base: boundFormulaSchema, sources: z.array(idSchema).min(1).max(1000),
  origin: z.enum(['talent', 'triggered']), damage: z.record(idSchema, boundFormulaSchema),
  coverageRefs: z.array(definitionRefSchema).min(1).max(1000),
}).strict();

export const equipmentHitSchema = structuredHitSchema.extend({ category: structuredHitSchema.shape.category.nullable(),
  accumulate: z.object({ eventFact: idSchema, hitFact: idSchema, durationMs: z.number().int().positive(), cooldownMs: z.number().int().positive() }).strict().optional() });

export const reactionLibrarySchema = z.object({
  rules: reactionRulesSchema,
  calculation: calculationBundleSchema,
}).strict();
