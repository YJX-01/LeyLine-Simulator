import { z } from 'zod';
import { idSchema, finiteSchema, contentSourceSchema, supportSchema } from '../common/values';
import { combatConditionsSchema } from './combat-conditions';

export const damageRequestSchema = z.object({ skillId: idSchema, hitIndex: z.number().int().nonnegative().max(29), crit: z.enum(['critical', 'noncritical', 'expected']).nullable(), reaction: z.literal('none').nullable(), conditions: combatConditionsSchema.optional() }).strict();

export type DamageRequest = z.infer<typeof damageRequestSchema>;
